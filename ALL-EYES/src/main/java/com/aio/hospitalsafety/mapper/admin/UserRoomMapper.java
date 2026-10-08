package com.aio.hospitalsafety.mapper.admin;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.aio.hospitalsafety.dto.admin.RoomLocation;

/**
 * [2026.09.30 추가] 간호사(job_cd = 'GENERAL') 담당 병실(tb_emp_location → tb_location).
 * 간병인(TB_CAREGIVER.LOCATION_ID)과 같이 병실은 TB_LOCATION 으로 가리킨다.
 * 한 간호사가 여러 병실을, 한 병실을 여러 간호사가 담당할 수 있다. 담당 병실은 선택 사항이다.
 */
@Mapper
public interface UserRoomMapper {

    // 병동 이름(예: '3병동'). 병실 번호의 백의 자리를 병동 번호와 맞춰 볼 때 쓴다.
    String findWardName(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("wardId") Long wardId
    );

    // 병동의 병실 위치(TB_LOCATION, ROOM) 중 이름이 주어진 것들(예: '301호')
    List<RoomLocation> findRoomLocations(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("wardId") Long wardId,
            @Param("locationNames") List<String> locationNames
    );

    // 이 간호사의 지금 담당 병실 이름(예: '301호'), 관리 이력의 변경 전 값
    List<String> findUserRoomNames(
            @Param("userId") String userId
    );

    // 이 간호사의 담당 병실 모두 지우기
    int deleteUserRooms(
            @Param("userId") String userId
    );

    // 담당 병실 한 개 저장
    int insertUserRoom(
            @Param("userId") String userId,
            @Param("locationId") Long locationId
    );
}
