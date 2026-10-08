package com.aio.hospitalsafety.dto.admin;

import com.aio.hospitalsafety.domain.ApprovalStatus;
import com.aio.hospitalsafety.domain.Role;

public record CreateUserResponse(
        String userId,
        String userName,
        Long wardId,
        Role role,
        ApprovalStatus accountStatus,
        boolean mustChangePassword,
        String temporaryPassword
) {
}