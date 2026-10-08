package com.aio.hospitalsafety.dto;

public record UserDto(
        String userId,
        String name,
        String ward,
        String status
) {
}
