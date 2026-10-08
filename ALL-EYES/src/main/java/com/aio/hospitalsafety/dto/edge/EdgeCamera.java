package com.aio.hospitalsafety.dto.edge;

/** 등록된 카메라와 그 카메라가 설치된 위치 */
public record EdgeCamera(
        Long cameraId,
        Long locationId
) {
}
