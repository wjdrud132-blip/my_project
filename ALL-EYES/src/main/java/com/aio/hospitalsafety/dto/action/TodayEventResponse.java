package com.aio.hospitalsafety.dto.action;

/**
 * 대시보드를 새로 열었을 때 불러오는 오늘(한국 시각) 감지 이벤트 한 건.
 * [2026.09.27] 조치 없는 확정 낙상은 24시간 안이면 어제 것도 온다. [2026.09.28] 24시간 안 확정 낙상은 조치가 있어도 온다.
 * 실시간 알림(DashboardEventMessage)과 같은 이름을 쓰고, 조치 등록 여부(handled)를 더한다.
 *
 * room 은 병실(ROOM)일 때만 숫자이고, 공용 공간이면 null 이다.
 * [2026.09.28] dismissed: 조치가 대시보드 '확인'(확정 낙상은 오경보)이면 true. 화면이 낙상 감지·의심 건수와 최근 기록에서 뺀다(침대 이탈 건수는 그대로).
 */
public record TodayEventResponse(
        String id,
        Integer room,
        String locationName,
        String occurredAt,
        String eventType,
        String decisionSt,
        boolean handled,
        boolean dismissed
) {
}
