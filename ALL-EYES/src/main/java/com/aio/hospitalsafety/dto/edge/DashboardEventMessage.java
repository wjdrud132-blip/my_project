package com.aio.hospitalsafety.dto.edge;

/**
 * 대시보드로 실시간 전달하는 감지 알림.
 *
 * 병실(ROOM) 이벤트는 대시보드 JS 의 window.CareGuard 함수에 그대로 넘길 수 있게 id, room, occurredAt 을 담는다.
 * - FALL / CONFIRMED  → receiveFallEvent
 * - FALL / SUSPECTED  → receiveSuspectedFallEvent
 * - BED_EXIT          → receiveBedExitEvent
 *
 * room 은 병실(ROOM)일 때만 숫자(예: 305)이고, 공용 공간(복도 등)이면 null 이다.
 * 공용 공간 이벤트는 dashboard.js 의 receiveServerEvent 가 locationName 으로 복도 표시에 띄운다(2026.09.27).
 */
public record DashboardEventMessage(
        String id,
        Integer room,
        String locationName,
        String occurredAt,
        String eventType,
        String decisionSt
) {
}
