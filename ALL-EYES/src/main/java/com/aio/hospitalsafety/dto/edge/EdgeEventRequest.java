package com.aio.hospitalsafety.dto.edge;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * 젯슨이 보내는 감지 이벤트 한 건 (TB_DETECTION_EVENT 한 행).
 *
 * eventType: FALL(낙상) 또는 BED_EXIT(침대 이탈)
 * decisionSt: CONFIRMED(확정) 또는 SUSPECTED(의심, 낙상만 가능)
 * trackId 는 화면 속 사람 번호일 뿐 환자 신원이 아니다.
 */
public record EdgeEventRequest(
        @NotNull(message = "이벤트 ID가 필요합니다.")
        UUID eventId,

        @NotNull(message = "실행 세션 ID가 필요합니다.")
        UUID cameraSessionId,

        @NotBlank(message = "이벤트 종류가 필요합니다.")
        String eventType,

        @NotBlank(message = "판정 상태가 필요합니다.")
        String decisionSt,

        @NotNull(message = "발생 시각이 필요합니다.")
        OffsetDateTime eventAt,

        @PositiveOrZero(message = "사람 번호는 0 이상이어야 합니다.")
        Integer trackId,

        Double decisionScore,

        @NotNull(message = "이벤트 상세가 필요합니다.")
        Map<String, Object> eventDetail
) {
}
