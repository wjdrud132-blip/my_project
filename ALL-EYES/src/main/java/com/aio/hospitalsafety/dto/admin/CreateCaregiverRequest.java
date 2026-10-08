package com.aio.hospitalsafety.dto.admin;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CreateCaregiverRequest(
        @NotBlank(message = "이름을 입력해 주세요.")
        @Size(max = 20, message = "이름은 20자 이하여야 합니다.")
        String userName,
        @NotBlank(message = "전화번호를 입력해 주세요.")
        @Pattern(regexp = "^01[0-9]-?[0-9]{3,4}-?[0-9]{4}$", message = "휴대전화 번호를 확인해 주세요.")
        String phoneNumber,
        @NotNull(message = "담당 병실을 선택해 주세요.")
        @Min(value = 301, message = "301호부터 317호까지 선택해 주세요.")
        @Max(value = 317, message = "301호부터 317호까지 선택해 주세요.")
        Integer roomNumber
) {
}
