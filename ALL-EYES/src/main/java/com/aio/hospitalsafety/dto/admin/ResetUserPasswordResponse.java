package com.aio.hospitalsafety.dto.admin;

public record ResetUserPasswordResponse(
        String userId,
        String temporaryPassword,
        boolean mustChangePassword
) {
}