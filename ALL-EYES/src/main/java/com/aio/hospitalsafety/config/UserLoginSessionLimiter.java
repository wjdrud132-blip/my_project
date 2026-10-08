package com.aio.hospitalsafety.config;

import jakarta.servlet.http.HttpSession;

import java.time.Duration;
import java.time.Instant;

/**
 * 존재하지 않는 아이디를 반복 입력한 브라우저 세션의
 * 로그인 시도를 제한한다.
 */
public final class UserLoginSessionLimiter {

    private static final String FAILURE_COUNT =
            "userUnknownLoginFailureCount";

    private static final String LOCKED_UNTIL =
            "userUnknownLoginLockedUntil";

    private static final int FAILURE_THRESHOLD = 5;

    private static final Duration LOCK_DURATION =
            Duration.ofMinutes(1);

    private UserLoginSessionLimiter() {
    }

    /**
     * 존재하지 않는 아이디로 발생한 로그인 실패를
     * 현재 브라우저 세션에 누적한다.
     *
     * @return 세션이 잠겼으면 잠금 종료 시각의 Epoch 밀리초,
     *         아직 잠기지 않았으면 0.
     */
    public static long registerUnknownUserFailure(
            HttpSession session) {
        synchronized (session) {
            long currentLockedUntil =
                    getLockedUntilEpochMillisInternal(session);

            if (currentLockedUntil > 0) {
                return currentLockedUntil;
            }

            Object failureCountValue =
                    session.getAttribute(FAILURE_COUNT);

            int failureCount =
                    failureCountValue instanceof Integer count
                            ? count
                            : 0;

            int nextFailureCount = failureCount + 1;

            if (nextFailureCount >= FAILURE_THRESHOLD) {
                Instant lockedUntil =
                        Instant.now().plus(LOCK_DURATION);

                session.setAttribute(
                        FAILURE_COUNT,
                        FAILURE_THRESHOLD
                );

                session.setAttribute(
                        LOCKED_UNTIL,
                        lockedUntil
                );

                return lockedUntil.toEpochMilli();
            }

            session.setAttribute(
                    FAILURE_COUNT,
                    nextFailureCount
            );

            return 0L;
        }
    }

    /**
     * 현재 세션의 잠금 종료 시각을 Epoch 밀리초로 반환한다.
     */
    public static long getLockedUntilEpochMillis(
            HttpSession session) {
        if (session == null) {
            return 0L;
        }

        synchronized (session) {
            return getLockedUntilEpochMillisInternal(session);
        }
    }

    /** 정상 로그인에 성공하면 세션 실패 기록을 초기화한다. */
    public static void reset(HttpSession session) {
        if (session == null) {
            return;
        }

        synchronized (session) {
            session.removeAttribute(FAILURE_COUNT);
            session.removeAttribute(LOCKED_UNTIL);
        }
    }

    private static long getLockedUntilEpochMillisInternal(
            HttpSession session) {
        Object lockedUntilValue =
                session.getAttribute(LOCKED_UNTIL);

        if (!(lockedUntilValue instanceof Instant lockedUntil)) {
            return 0L;
        }

        if (!lockedUntil.isAfter(Instant.now())) {
            session.removeAttribute(FAILURE_COUNT);
            session.removeAttribute(LOCKED_UNTIL);
            return 0L;
        }

        return lockedUntil.toEpochMilli();
    }
}