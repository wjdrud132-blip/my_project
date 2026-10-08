package com.aio.hospitalsafety.mapper.admin;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.aio.hospitalsafety.dto.UserDto;
import com.aio.hospitalsafety.dto.admin.ApprovedUserResponse;
import com.aio.hospitalsafety.dto.admin.CaregiverInsert;
import com.aio.hospitalsafety.dto.admin.CaregiverRow;
import com.aio.hospitalsafety.dto.admin.InactiveUserResponse;

/**
 * [2026.09.30 추가] 간병인(명세 TB_CAREGIVER). 병실은 LOCATION_ID(TB_LOCATION)로 가리키고,
 * 병실 하나의 활성 간병인은 1명이다(uk_caregiver_active_location). 사용 여부는 USE_YN(Y/N).
 * 관리자 화면에는 userId 를 'cg:' + CAREGIVER_ID 로 준다(CaregiverIds).
 */
@Mapper
public interface CaregiverMapper {

    // 1번 API 모양(간병인 목록)
    List<UserDto> findCaregiverUsers(
            @Param("hospitalDomain") String hospitalDomain
    );

    // 2번 API 모양(활성 간병인 상세)
    List<ApprovedUserResponse> findCaregivers(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("keyword") String keyword
    );

    // 비활성 간병인
    List<InactiveUserResponse> findInactiveCaregivers(
            @Param("hospitalDomain") String hospitalDomain
    );

    CaregiverRow findCaregiver(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("caregiverId") long caregiverId
    );

    // 병동 번호(3)와 병실 위치 이름('302호')으로 병실 위치 ID 찾기
    Long findRoomLocationId(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("wardNumber") int wardNumber,
            @Param("locationName") String locationName
    );

    // 병실 위치 이름(예: '302호'), 관리 이력의 변경 전·후 값
    String findLocationName(
            @Param("locationId") Long locationId
    );

    Long findWardIdByLocation(
            @Param("locationId") Long locationId
    );

    // 이 병실에 (이 간병인 말고) 활성 간병인이 있는지
    boolean existsActiveCaregiverAt(
            @Param("locationId") Long locationId,
            @Param("caregiverId") Long caregiverId
    );

    // 같은 번호를 쓰는 (이 간병인 말고) 활성 간병인이 있는지
    boolean existsActiveCaregiverPhone(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("phoneNumber") String phoneNumber,
            @Param("caregiverId") Long caregiverId
    );

    int insertCaregiver(CaregiverInsert caregiver);

    int updateCaregiverLocation(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("caregiverId") long caregiverId,
            @Param("locationId") Long locationId
    );

    int updateCaregiverPhone(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("caregiverId") long caregiverId,
            @Param("phoneNumber") String phoneNumber
    );

    int updateCaregiverUse(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("caregiverId") long caregiverId,
            @Param("fromUseYn") String fromUseYn,
            @Param("toUseYn") String toUseYn
    );

    int deleteInactiveCaregiver(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("caregiverId") long caregiverId
    );
}
