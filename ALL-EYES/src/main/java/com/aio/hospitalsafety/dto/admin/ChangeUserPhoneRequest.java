package com.aio.hospitalsafety.dto.admin;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

/**
 * [2026.09.27] 관리자 화면의 "전화번호 수정" (간호사·간병인 공통).
 * 확정 낙상 SMS 를 받는 번호(tb_emp.phone_no)다. 형식은 계정 생성과 같다.
 */
public record ChangeUserPhoneRequest(

        @NotBlank(message = "전화번호를 입력해 주세요.")
        @Pattern(regexp = "^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$", message = "휴대전화 번호를 확인해 주세요.")
        String phoneNumber

) {
}
