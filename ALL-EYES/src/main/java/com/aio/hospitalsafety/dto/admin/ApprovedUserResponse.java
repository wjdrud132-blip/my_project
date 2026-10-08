package com.aio.hospitalsafety.dto.admin;

public record ApprovedUserResponse(
        String userId,
        String userName,
        String authStatus,
        Long wardId,
        String wardName,
        String phoneNumber,
        String roomNumber,
        // [2026.09.30 추가] 간호사 담당 병실(쉼표로 이은 번호, 예: "301,302"). 없으면 null
        String assignedRooms
) {
}
