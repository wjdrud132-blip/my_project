package com.aio.hospitalsafety.exception;

public class UserConflictException extends RuntimeException {
    public UserConflictException(String message) {
        super(message);
    }
}
