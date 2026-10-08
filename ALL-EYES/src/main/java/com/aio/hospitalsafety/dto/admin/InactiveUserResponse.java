package com.aio.hospitalsafety.dto.admin;

import java.time.Instant;

public record InactiveUserResponse(
        String userId,
        String userName,
        String authStatus,
        Long wardId,
        String wardName,
        Instant deactivatedAt,
        String roomNumber
) {
}
