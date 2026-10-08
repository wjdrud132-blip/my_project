package com.aio.hospitalsafety.dto.action;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 대시보드 대응 등록 창에서 보내는 조치 내용 (TB_EVENT_ACTION).
 * 길이 제한은 화면(maxlength)과 테이블 명세와 같다.
 */
public record EventActionRequest(
        @NotBlank(message = "환자 이름을 입력해 주세요.")
        @Size(max = 50, message = "환자 이름은 50자 이내로 입력해 주세요.")
        String patientName,

        @NotBlank(message = "조치 내용을 입력해 주세요.")
        @Size(max = 1000, message = "조치 내용은 1000자 이내로 입력해 주세요.")
        String actionContent
) {
}
