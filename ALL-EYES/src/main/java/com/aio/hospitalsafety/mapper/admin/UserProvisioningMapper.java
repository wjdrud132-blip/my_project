package com.aio.hospitalsafety.mapper.admin;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserProvisioningMapper {

    boolean existsUserId(
            @Param("userId") String userId
    );

    // [2026.09.27] 같은 병원에 이 번호를 쓰는 활성 직원이 있는지 (같은 번호로 SMS 가 두 번 가지 않게)
    boolean existsActivePhone(
            @Param("hospitalId") String hospitalId,
            @Param("phoneNumber") String phoneNumber
    );

    boolean existsWardInHospital(
            @Param("hospitalId") String hospitalId,
            @Param("wardId") Long wardId
    );

    Long findThirdFloorWardId(@Param("hospitalId") String hospitalId);

    int insertUser(
            @Param("userId") String userId,
            @Param("passwordHash") String passwordHash,
            @Param("hospitalId") String hospitalId,
            @Param("wardId") Long wardId,
            @Param("userName") String userName,
            @Param("phoneNumber") String phoneNumber
    );
}
