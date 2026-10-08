package com.aio.hospitalsafety.dto.admin;

import jakarta.validation.constraints.NotNull;

/**
 * [2026.09.27] 관리자 화면의 간병인 "담당 병실 변경".
 * 병실 번호는 101~117, 201~217, 301~317 중 하나다(대시보드 도면과 같은 규칙). 검사는 서비스에서 한다.
 */
public record ChangeCaregiverRoomRequest(

        @NotNull(message = "변경할 병실을 선택해 주세요.")
        Integer roomNumber

) {
}
