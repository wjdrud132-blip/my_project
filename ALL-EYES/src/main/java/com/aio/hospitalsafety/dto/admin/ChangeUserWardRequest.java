package com.aio.hospitalsafety.dto.admin;

import java.util.List;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record ChangeUserWardRequest(

        @NotNull(message = "변경할 병동을 선택해 주세요.")
        @Positive(message = "올바른 병동을 선택해 주세요.")
        Long wardId,

        // [2026.09.30 추가] 간호사 담당 병실(선택 사항, 여러 개 가능). 보내지 않으면(null) 병동만 바꾸고,
        // 병동이 바뀌면 예전 병동의 담당 병실은 지운다. 빈 목록이면 담당 병실을 모두 지운다.
        List<Integer> roomNumbers

) {
}