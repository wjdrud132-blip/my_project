package com.aio.hospitalsafety.dto.action;

import java.time.OffsetDateTime;

/** 오늘 감지 이벤트를 DB 에서 그대로 읽은 한 줄 */
public record TodayEventRow(
        String eventId,
        String eventType,
        String decisionSt,
        OffsetDateTime eventAt,
        String locationName,
        String locationType,
        boolean handled,
        // [2026.09.28] 대시보드 '확인'(확정 낙상은 오경보)으로 끈 이벤트인지(EventActionMapper.xml). 열 순서대로 채워지므로 맨 끝에 둔다.
        boolean dismissed
) {
}
