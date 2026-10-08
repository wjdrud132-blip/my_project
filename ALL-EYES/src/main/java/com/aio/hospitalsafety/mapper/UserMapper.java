// PGH
package com.aio.hospitalsafety.mapper;

import com.aio.hospitalsafety.domain.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.Optional;

/**
 * TB_EMP 테이블에 접근하는 MyBatis Mapper 인터페이스다.
 */
@Mapper
public interface UserMapper {

    /** 로그인한 사용자의 현재 담당 병동을 DB에서 조회한다. */
    com.aio.hospitalsafety.dto.WardOption findUserWard(
            @Param("hospitalId") String hospitalId,
            @Param("userId") String userId);

    /** 최초 로그인 비밀번호 변경이 필요한 계정인지 조회한다. */
    Boolean isInitialUserPassword(
            @Param("hospitalId") String hospitalId,
            @Param("userId") String userId);

    /**
     * 병원 ID와 직원 ID가 모두 일치하는 직원 한 명을 조회한다.
     */
    Optional<User> findByHospitalIdAndUserId(
            @Param("hospitalId") String hospitalId,
            @Param("userId") String userId);

    /**
     * 직원 비밀번호를 변경하고 최초 비밀번호 변경 상태를 해제한다.
     */
    int updatePassword(
            @Param("userId") String userId,
            @Param("passwordHash") String passwordHash);

    /**
     * 존재하는 계정의 로그인 실패 횟수를 증가시킨다.
     * 연속 5회 실패하면 계정을 1분 동안 잠근다.
     */
    int registerFailedLogin(
            @Param("hospitalId") String hospitalId,
            @Param("userId") String userId);

    /**
     * 로그인 성공 시 실패 횟수와 계정 잠금을 초기화한다.
     */
    int resetFailedLogin(
            @Param("hospitalId") String hospitalId,
            @Param("userId") String userId);
}
