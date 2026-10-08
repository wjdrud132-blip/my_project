package com.aio.hospitalsafety.controller.edge;

import com.aio.hospitalsafety.dto.edge.DetectionAlert;
import com.aio.hospitalsafety.dto.edge.EdgeEventRequest;
import com.aio.hospitalsafety.dto.edge.EdgeSessionRequest;
import com.aio.hospitalsafety.dto.sms.FallSmsRequest;
import com.aio.hospitalsafety.service.edge.DashboardEventPushService;
import com.aio.hospitalsafety.service.edge.EdgeService;
import com.aio.hospitalsafety.service.sms.SmsService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 젯슨(엣지 장비)이 부르는 API.
 *
 * POST /api/edge/sessions : 프로그램이 켜질 때 실행 세션 등록
 * POST /api/edge/events   : 감지 이벤트 한 건 등록
 *
 * 응답 코드는 젯슨 전송기(edge_forwarder.py)와 맞춘다.
 * 201 새로 저장, 409 이미 받은 것(젯슨은 성공으로 본다),
 * 428 서버가 모르는 실행 세션(젯슨은 세션을 다시 등록하고 같은 이벤트를 다시 보낸다)
 * 400 은 두 API 에서 젯슨의 반응이 다르다.
 * - 이벤트 400: 젯슨이 그 줄을 보류 파일로 빼고 다음 줄을 보낸다.
 * - 세션 400: 젯슨이 등록될 때까지 계속 다시 보내고, 그동안 이벤트는 하나도 보내지 않는다.
 *   (장치 이름, 카메라, 모델 묶음이 DB 에 맞게 등록돼 있는지 확인해야 한다)
 */
@RestController
@RequestMapping("/api/edge")
public class EdgeController {

    private static final Logger log = LoggerFactory.getLogger(EdgeController.class);

    private final EdgeService edgeService;
    private final DashboardEventPushService dashboardEventPushService;
    private final SmsService smsService;

    public EdgeController(
            EdgeService edgeService,
            DashboardEventPushService dashboardEventPushService,
            SmsService smsService) {
        this.edgeService = edgeService;
        this.dashboardEventPushService = dashboardEventPushService;
        this.smsService = smsService;
    }

    @PostMapping("/sessions")
    public ResponseEntity<Map<String, String>> registerSession(@Valid @RequestBody EdgeSessionRequest request) {
        String sessionId = request.cameraSessionId().toString();
        boolean created = edgeService.registerSessionIfNew(request);

        if (!created) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of("message", "이미 등록된 실행 세션입니다.", "cameraSessionId", sessionId));
        }
        log.info("실행 세션 등록 cameraSessionId={} device={} source={}",
                sessionId, request.deviceName(), request.sourceRef());
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(Map.of("cameraSessionId", sessionId));
    }

    @PostMapping("/events")
    public ResponseEntity<Map<String, String>> registerEvent(@Valid @RequestBody EdgeEventRequest request) {
        String eventId = request.eventId().toString();

        // 1. 저장 (이 줄이 끝나면 DB 저장이 끝난 상태다)
        DetectionAlert alert = edgeService.saveEventIfNew(request);
        if (alert == null) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .cacheControl(CacheControl.noStore())
                    .body(Map.of("message", "이미 받은 이벤트입니다.", "eventId", eventId));
        }

        // 2. 대시보드 실시간 알림 (낙상, 낙상 의심, 침대 이탈 모두)
        //    같은 낙상의 반복 알림(duplicate_of)은 보내지 않는다. SMS·조치 이력·오늘 이벤트와 같은 규칙이다.
        //    반복 알림마다 보내면 대시보드가 새 낙상으로 보고 음성을 다시 내고, 조치가 반복 알림에 붙어
        //    처음 낙상(문자가 나간 것)이 계속 '미확인'으로 남는다. 반복 알림도 DB 에는 그대로 저장한다.
        if (alert.duplicateOf() == null) {
            pushToDashboard(alert);
        }

        // 3. 확정 낙상만 SMS (요구사항 AIO_035). 같은 낙상의 반복 알림(duplicate_of)은 보내지 않는다.
        if (alert.needsFallSms()) {
            startFallSms(alert);
        }

        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(Map.of("eventId", eventId));
    }

    /** 알림이 실패해도 저장은 끝났으므로 젯슨에는 성공으로 응답한다. 로그만 남긴다. */
    private void pushToDashboard(DetectionAlert alert) {
        try {
            dashboardEventPushService.sendEvent(alert);
        } catch (RuntimeException exception) {
            log.error("대시보드 알림 전송 실패 eventId={}", alert.eventId(), exception);
        }
    }

    /**
     * SMS 는 따로 도는 작업(@Async, 작업마다 새 스레드)으로 맡기고 바로 돌아온다(젯슨 응답을 늦추지 않기 위해).
     * 작업을 맡기지 못해도 여기서 500 을 주면 안 된다.
     * 젯슨이 다시 보내도 409 라서 SMS 가 다시 시작되지 않기 때문이다.
     * 서버가 꺼지는 도중에는 발송이 끊길 수 있다. 못 보낸 SMS 는 서버를 다시 켤 때 SmsRecoveryService 가 이어서 보낸다.
     */
    private void startFallSms(DetectionAlert alert) {
        try {
            smsService.sendFallSms(FallSmsRequest.from(alert));
        } catch (RuntimeException exception) {
            log.error("낙상 SMS 작업 시작 실패 eventId={}", alert.eventId(), exception);
        }
    }
}
