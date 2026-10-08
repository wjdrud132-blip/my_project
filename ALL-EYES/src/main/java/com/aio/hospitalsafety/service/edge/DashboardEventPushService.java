package com.aio.hospitalsafety.service.edge;

import com.aio.hospitalsafety.common.RoomNumbers;
import com.aio.hospitalsafety.common.SeoulTimes;
import com.aio.hospitalsafety.dto.action.DashboardActionMessage;
import com.aio.hospitalsafety.dto.edge.DashboardEventMessage;
import com.aio.hospitalsafety.dto.edge.DetectionAlert;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

/**
 * 저장된 감지 이벤트를 해당 병동 대시보드로 보낸다(STOMP).
 *
 * 주소: /topic/wards/{병동ID}/events
 * 같은 병동 직원(간호사·간병인 계정 모두)만 구독하고 받을 수 있다(WebSocketInboundGuard, WebSocketOutboundGuard).
 * 같은 낙상의 반복 알림(duplicate_of)은 보내지 않는다(EdgeController).
 */
@Service
public class DashboardEventPushService {

    private static final Logger log = LoggerFactory.getLogger(DashboardEventPushService.class);

    private final SimpMessagingTemplate messagingTemplate;

    public DashboardEventPushService(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    public void sendEvent(DetectionAlert alert) {
        DashboardEventMessage message = new DashboardEventMessage(
                alert.eventId(),
                RoomNumbers.forDashboard(alert.locationType(), alert.locationName()),
                alert.locationName(),
                SeoulTimes.withOffset(alert.eventAt()),
                alert.eventType(),
                alert.decisionSt());

        String topic = "/topic/wards/" + alert.wardId() + "/events";
        messagingTemplate.convertAndSend(topic, message);
        log.info("대시보드 알림 전송 eventId={} wardId={} {}/{}",
                alert.eventId(), alert.wardId(), alert.eventType(), alert.decisionSt());
    }

    /**
     * [2026.09.27] 조치가 등록됐다고 같은 병동 대시보드에 알린다.
     * 다른 화면에 떠 있던 같은 경보와 반복 음성을 끄는 데 쓴다(server-events.js → dashboard.js).
     * [2026.09.28] dismissed: '확인'(확정 낙상은 오경보) 기록이면 true. 화면이 낙상 감지·의심 건수와 최근 기록에서 뺀다(침대 이탈 건수는 그대로).
     */
    public void sendActionRegistered(Long wardId, String eventId, boolean dismissed) {
        String topic = "/topic/wards/" + wardId + "/events";
        messagingTemplate.convertAndSend(topic, new DashboardActionMessage(eventId, true, dismissed));
        log.info("대시보드 조치 등록 알림 전송 eventId={} wardId={} dismissed={}", eventId, wardId, dismissed);
    }
}
