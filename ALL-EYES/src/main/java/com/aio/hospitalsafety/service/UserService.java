// PGH
package com.aio.hospitalsafety.service;

import com.aio.hospitalsafety.domain.User;
import com.aio.hospitalsafety.mapper.UserMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
public class UserService {

    private final UserMapper userMapper;
    private final PasswordEncoder passwordEncoder;

    public UserService(
            UserMapper userMapper,
            PasswordEncoder passwordEncoder) {
        this.userMapper = userMapper;
        this.passwordEncoder = passwordEncoder;
    }

    /** 최초 로그인 비밀번호 변경이 필요한 계정인지 확인한다. */
    @Transactional(readOnly = true)
    public boolean isInitialUserPassword(
            String hospitalId,
            String userId) {
        return Boolean.TRUE.equals(
                userMapper.isInitialUserPassword(
                        hospitalId,
                        userId
                )
        );
    }

    /**
     * 존재하는 계정의 비밀번호가 틀렸을 때 실패 횟수를 증가시킨다.
     * 연속 5회 실패하면 계정을 1분 동안 잠근다.
     *
     * @return 잠금 종료 시각의 Epoch 밀리초.
     *         계정이 아직 잠기지 않았으면 0.
     */
    @Transactional
    public long registerFailedLogin(
            String hospitalId,
            String userId) {
        userMapper.registerFailedLogin(
                hospitalId,
                userId
        );

        return getLockedUntilEpochMillis(
                hospitalId,
                userId
        );
    }

    /**
     * 현재 계정의 잠금 종료 시각을 Epoch 밀리초로 반환한다.
     *
     * @return 잠금 중이면 종료 시각, 잠기지 않았으면 0.
     */
    @Transactional(readOnly = true)
    public long getLockedUntilEpochMillis(
            String hospitalId,
            String userId) {
        long currentTime = System.currentTimeMillis();

        return userMapper.findByHospitalIdAndUserId(
                        hospitalId,
                        userId
                )
                .map(User::lockedUntil)
                .filter(lockedUntil ->
                        lockedUntil.isAfter(Instant.now())
                )
                .map(Instant::toEpochMilli)
                .filter(lockedUntil ->
                        lockedUntil > currentTime
                )
                .orElse(0L);
    }

    /** 로그인에 성공하면 실패 횟수와 잠금을 초기화한다. */
    @Transactional
    public void resetFailedLogin(
            String hospitalId,
            String userId) {
        userMapper.resetFailedLogin(
                hospitalId,
                userId
        );
    }

    /** 로그인한 계정의 임시 비밀번호와 사용자가 입력한 값이 일치하는지 확인한다. */
    @Transactional(readOnly = true)
    public boolean verifyInitialPassword(
            String hospitalId,
            String userId,
            String initialPassword) {
        if (initialPassword == null
                || initialPassword.isBlank()
                || initialPassword.getBytes(
                        java.nio.charset.StandardCharsets.UTF_8
                ).length > 72) {
            return false;
        }

        return userMapper.findByHospitalIdAndUserId(
                        hospitalId,
                        userId
                )
                .map(user -> passwordEncoder.matches(
                        initialPassword,
                        user.passwordHash()
                ))
                .orElse(false);
    }

    /** 현재 비밀번호를 확인하고 새 비밀번호로 변경한다. */
    @Transactional
    public PasswordChangeResult changePassword(
            String hospitalId,
            String userId,
            String currentPassword,
            String newPassword) {
        User user = userMapper.findByHospitalIdAndUserId(
                hospitalId,
                userId
        ).orElse(null);

        if (user == null) {
            return PasswordChangeResult.USER_NOT_FOUND;
        }

        if (!passwordEncoder.matches(
                currentPassword,
                user.passwordHash()
        )) {
            return PasswordChangeResult.CURRENT_PASSWORD_MISMATCH;
        }

        if (passwordEncoder.matches(
                newPassword,
                user.passwordHash()
        )) {
            return PasswordChangeResult.SAME_PASSWORD;
        }

        String newPasswordHash =
                passwordEncoder.encode(newPassword);

        if (userMapper.updatePassword(
                user.userId(),
                newPasswordHash
        ) != 1) {
            throw new IllegalStateException(
                    "비밀번호 변경에 실패했습니다."
            );
        }

        return PasswordChangeResult.SUCCESS;
    }

    public enum PasswordChangeResult {
        SUCCESS,
        SAME_PASSWORD,
        CURRENT_PASSWORD_MISMATCH,
        USER_NOT_FOUND
    }
}