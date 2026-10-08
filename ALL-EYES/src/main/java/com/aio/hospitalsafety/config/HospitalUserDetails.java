// PGH
package com.aio.hospitalsafety.config;

import com.aio.hospitalsafety.domain.User;
import org.springframework.security.core.authority.AuthorityUtils;
import com.aio.hospitalsafety.domain.ApprovalStatus;

import java.time.Instant;

/** 인증된 직원의 소속 병원을 로그인 정보와 함께 보관한다. */
public class HospitalUserDetails extends org.springframework.security.core.userdetails.User {
    private static final long serialVersionUID = 1L;
    private final String hospitalId;
    private final String userName;

    public HospitalUserDetails(User user) {
        super(user.userId(), user.passwordHash(), user.approvalStatus() == ApprovalStatus.APPROVED, true, true,
                isAccountNonLocked(user), AuthorityUtils.createAuthorityList(
                "ROLE_" + user.role().name(), "STATUS_" + user.approvalStatus().name()));
        this.hospitalId = user.hospitalId();
        this.userName = user.userName();
    }

    /** 로그인 브루트포스 방어: LOCKED_UNTIL이 지금보다 미래이면 잠긴 계정으로 취급한다. */
    private static boolean isAccountNonLocked(User user) {
        Instant lockedUntil = user.lockedUntil();
        return lockedUntil == null || !lockedUntil.isAfter(Instant.now());
    }

    public String getUserName() {
        return userName;
    }

    public String getHospitalId() {
        return hospitalId;
    }
}
