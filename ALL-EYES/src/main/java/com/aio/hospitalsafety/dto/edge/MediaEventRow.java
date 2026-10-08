package com.aio.hospitalsafety.dto.edge;

/**
 * [2026.09.28] 영상 업로드를 받을 때 보는 이벤트 정보.
 * 조치가 아직 없으면 patientName, actionContent 는 null 이다(조치는 이벤트당 1건).
 */
public record MediaEventRow(
        String eventType,
        String patientName,
        String actionContent
) {
}
