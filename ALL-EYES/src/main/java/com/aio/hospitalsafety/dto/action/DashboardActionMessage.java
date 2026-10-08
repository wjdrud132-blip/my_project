package com.aio.hospitalsafety.dto.action;

/**
 * [2026.09.27] "이 경보에 조치가 등록됐다"는 대시보드 실시간 알림.
 * 같은 병동 대시보드를 여러 대 열어 둔 경우, 한 화면에서 대응 등록을 하면 다른 화면의 같은 경보도 끈다.
 * 감지 알림(DashboardEventMessage)과 구분하려고 eventType 없이 id, handled=true, dismissed 만 보낸다.
 * [2026.09.28] dismissed: 그 조치가 대시보드 '확인'(확정 낙상은 오경보)이면 true. 화면이 낙상 감지·의심 건수와 최근 기록에서 뺀다(침대 이탈 건수는 그대로).
 */
public record DashboardActionMessage(
        String id,
        boolean handled,
        boolean dismissed
) {
}
