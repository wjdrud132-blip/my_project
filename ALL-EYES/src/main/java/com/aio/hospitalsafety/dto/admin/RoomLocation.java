package com.aio.hospitalsafety.dto.admin;

/**
 * [2026.09.30 추가] 병실 위치(TB_LOCATION, LOCATION_TYPE = 'ROOM'). 이름은 '301호' 모양이다.
 */
public record RoomLocation(
        Long locationId,
        String locationName
) {
}
