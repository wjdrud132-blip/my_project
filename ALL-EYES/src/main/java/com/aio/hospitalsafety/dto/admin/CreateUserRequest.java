package com.aio.hospitalsafety.dto.admin;

import java.util.List;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateUserRequest(

        @NotBlank(message = "직원 아이디를 입력해 주세요.")
        @Size(max = 20, message = "직원 아이디는 20자 이하여야 합니다.")
        @Pattern(
                regexp = "^[A-Za-z0-9._-]+$",
                message = "아이디는 영문, 숫자, 마침표, 밑줄, 하이픈만 사용할 수 있습니다."
        )
        String userId,

        @NotBlank(message = "직원 이름을 입력해 주세요.")
        @Size(max = 20, message = "직원 이름은 20자 이하여야 합니다.")
        String userName,

        @NotNull(message = "담당 병동을 선택해 주세요.")
        Long wardId,

        // [2026.09.27 추가] 확정 낙상 SMS 는 tb_emp.phone_no 에 번호가 있는 병동 간호사에게 간다(SmsMapper.findWardUsers).
        // 관리자 화면에서 입력받던 번호를 저장한다. 형식은 간병인 등록과 같다.
        @NotBlank(message = "전화번호를 입력해 주세요.")
        @Pattern(regexp = "^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$", message = "휴대전화 번호를 확인해 주세요.")
        String phoneNumber,
        // [2026.09.30 추가] 담당 병실(선택 사항, 여러 개 가능). 병실 낙상 SMS 는 담당 간호사에게 간다(UserRoomService, SmsService).
        List<Integer> roomNumbers
) {
}