package com.aio.hospitalsafety.controller.action;

import com.aio.hospitalsafety.config.HospitalUserDetails;
import com.aio.hospitalsafety.dto.WardOption;
import com.aio.hospitalsafety.dto.action.ActionHistoryResponse;
import com.aio.hospitalsafety.dto.action.EventActionRequest;
import com.aio.hospitalsafety.dto.action.TodayEventResponse;
import com.aio.hospitalsafety.mapper.UserMapper;
import com.aio.hospitalsafety.service.action.EventActionService;
import com.aio.hospitalsafety.service.edge.DashboardEventPushService;
import com.aio.hospitalsafety.service.edge.EventMediaService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 조치 이력 조회와 대응 등록 API.
 *
 * GET  /api/action-history          : 조치 이력 화면(record.js). 병동 직원은 자기 병동, 관리자는 병원 전체
 * GET  /api/dashboard/events        : 대시보드를 새로 열 때 자기 병동의 오늘 감지 이벤트(+ 24시간 안의 확정 낙상, 2026.09.28 부터 조치가 있어도)
 * POST /api/events/{eventId}/action : 대시보드 대응 등록 창. 병동 직원만(간호사·간병인 계정 모두), 자기 병동 이벤트만
 */
@RestController
public class EventActionController {

    private static final Logger log = LoggerFactory.getLogger(EventActionController.class);

    private final EventActionService eventActionService;
    private final UserMapper userMapper;
    private final DashboardEventPushService dashboardEventPushService;
    private final EventMediaService eventMediaService;

    public EventActionController(EventActionService eventActionService, UserMapper userMapper,
                                 DashboardEventPushService dashboardEventPushService,
                                 EventMediaService eventMediaService) {
        this.eventActionService = eventActionService;
        this.userMapper = userMapper;
        this.dashboardEventPushService = dashboardEventPushService;
        this.eventMediaService = eventMediaService;
    }

    @GetMapping("/api/action-history")
    public ResponseEntity<List<ActionHistoryResponse>> findActionHistory(
            @AuthenticationPrincipal HospitalUserDetails loginUser,
            // [2026.09.28] 관리자 홈 사고 현황이 true 로 부른다. 조치가 등록된 낙상 의심도 함께 받는다(조치 이력 화면은 기본값 false).
            @RequestParam(defaultValue = "false") boolean includeSuspected) {

        List<ActionHistoryResponse> history;
        if (hasRole(loginUser, "ROLE_ADMIN")) {
            history = eventActionService.findActionHistory(loginUser.getHospitalId(), null, includeSuspected);
        } else {
            WardOption ward = userMapper.findUserWard(loginUser.getHospitalId(), loginUser.getUsername());
            history = ward == null
                    ? List.of()
                    : eventActionService.findActionHistory(loginUser.getHospitalId(), ward.wardId(), includeSuspected);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(history);
    }

    @GetMapping("/api/dashboard/events")
    public ResponseEntity<List<TodayEventResponse>> findTodayEvents(
            @AuthenticationPrincipal HospitalUserDetails loginUser) {

        if (!hasRole(loginUser, "ROLE_USER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "병동 직원만 조회할 수 있습니다.");
        }
        WardOption ward = userMapper.findUserWard(loginUser.getHospitalId(), loginUser.getUsername());
        List<TodayEventResponse> events = ward == null
                ? List.of()
                : eventActionService.findTodayEvents(loginUser.getHospitalId(), ward.wardId());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(events);
    }

    @PostMapping("/api/events/{eventId}/action")
    public ResponseEntity<Map<String, String>> registerAction(
            @AuthenticationPrincipal HospitalUserDetails loginUser,
            @PathVariable String eventId,
            @Valid @RequestBody EventActionRequest request) {

        if (!hasRole(loginUser, "ROLE_USER")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "병동 직원만 조치를 등록할 수 있습니다.");
        }
        String checkedEventId = parseEventId(eventId);

        WardOption ward = userMapper.findUserWard(loginUser.getHospitalId(), loginUser.getUsername());
        if (ward == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "담당 병동이 없는 계정입니다.");
        }

        eventActionService.registerAction(
                checkedEventId,
                loginUser.getHospitalId(),
                ward.wardId(),
                loginUser.getUsername(),
                request);

        // [2026.09.27] 저장(커밋)이 끝난 뒤 같은 병동의 다른 대시보드에도 알려 같은 경보를 끄게 한다.
        // 알림을 못 보내도 조치 저장은 이미 끝났으므로 201 을 그대로 돌려준다(다른 화면은 등록할 때 409 로 해제된다).
        // [2026.09.28] '확인'(확정 낙상은 오경보) 기록인지도 함께 알려, 다른 화면도 낙상 감지·의심 건수와 최근 기록에서 뺀다(침대 이탈 건수는 그대로).
        boolean dismissed = EventActionService.isDismissal(request.patientName(), request.actionContent());
        try {
            dashboardEventPushService.sendActionRegistered(ward.wardId(), checkedEventId, dismissed);
        } catch (RuntimeException exception) {
            log.warn("조치 등록 알림을 보내지 못했습니다. eventId={} 오류={}", checkedEventId, exception.getClass().getSimpleName());
        }

        // [2026.09.28] '확인'·오경보로 끈 낙상이면 젯슨이 올린 영상(tb_event_media 행과 파일)을 지운다. 대응 등록한 낙상은 영상을 남긴다.
        // registerAction 이 돌아온 뒤라 조치 저장은 이미 커밋됐다. 그래서 영상 업로드가 동시에 와도
        // 업로드 쪽이 저장 뒤 조치를 다시 보고 지운다(EventMediaService 설명). 지우다 실패해도 조치 등록은 끝났으므로 201 을 그대로 준다.
        if (dismissed) {
            try {
                eventMediaService.deleteClip(checkedEventId);
            } catch (RuntimeException exception) {
                log.warn("확인·오경보 처리된 낙상의 영상을 지우지 못했습니다. eventId={} 오류={}",
                        checkedEventId, exception.getClass().getSimpleName());
            }
        }

        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(Map.of("eventId", checkedEventId));
    }

    private String parseEventId(String eventId) {
        try {
            return UUID.fromString(eventId).toString();
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "이벤트 ID 형식이 올바르지 않습니다.");
        }
    }

    private boolean hasRole(HospitalUserDetails loginUser, String role) {
        return loginUser != null && loginUser.getAuthorities().stream()
                .anyMatch(authority -> role.equals(authority.getAuthority()));
    }
}
