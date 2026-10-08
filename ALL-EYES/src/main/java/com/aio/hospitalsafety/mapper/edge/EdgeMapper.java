package com.aio.hospitalsafety.mapper.edge;

import com.aio.hospitalsafety.dto.edge.DetectionAlert;
import com.aio.hospitalsafety.dto.edge.EdgeCamera;
import com.aio.hospitalsafety.dto.edge.ModelBundleRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * 젯슨 실행 세션과 감지 이벤트 저장에 쓰는 매퍼.
 * UUID 와 JSON 값은 문자열로 넘기고 SQL 에서 CAST 한다.
 */
@Mapper
public interface EdgeMapper {

    /** 사용 중인 장치를 이름으로 찾는다. */
    List<Long> findEnabledEdgeDeviceIds(@Param("deviceName") String deviceName);

    /** 장치가 마지막으로 연락한 시각을 지금으로 바꾼다. */
    int updateEdgeDeviceLastSeen(@Param("edgeDeviceId") Long edgeDeviceId);

    /** 장치에 연결된 카메라를 카메라 경로(/dev/video0 등)로 찾는다. */
    EdgeCamera findEnabledCamera(
            @Param("edgeDeviceId") Long edgeDeviceId,
            @Param("sourceRef") String sourceRef);

    /** 모델 묶음을 이름으로 찾는다. */
    ModelBundleRow findModelBundle(@Param("bundleName") String bundleName);

    /** 저장된 모델 묶음의 특징 버전과 설정(JSON)이 이번 값과 같은지 */
    boolean isSameModelSettings(
            @Param("modelBundleId") Long modelBundleId,
            @Param("featureVersion") String featureVersion,
            @Param("modelConfigJson") String modelConfigJson);

    /** 모델 묶음을 새로 저장한다. */
    int insertModelBundle(
            @Param("bundleName") String bundleName,
            @Param("poseModelName") String poseModelName,
            @Param("poseModelSha256") String poseModelSha256,
            @Param("fallModelName") String fallModelName,
            @Param("fallModelSha256") String fallModelSha256,
            @Param("featureVersion") String featureVersion,
            @Param("modelConfigJson") String modelConfigJson);

    /**
     * 카메라의 가장 최근 설정이 이번 설정과 같으면 그 버전을 돌려준다.
     * 다르거나 설정이 하나도 없으면 null 이다.
     */
    Integer findLatestSameConfigVer(
            @Param("cameraId") Long cameraId,
            @Param("captureConfigJson") String captureConfigJson,
            @Param("bedRoiJson") String bedRoiJson,
            @Param("bedExitConfigJson") String bedExitConfigJson);

    /** 카메라 설정의 가장 큰 버전. 없으면 0 */
    int findMaxConfigVer(@Param("cameraId") Long cameraId);

    /** 카메라 설정 새 버전을 저장한다. */
    int insertCameraConfig(
            @Param("cameraId") Long cameraId,
            @Param("configVer") int configVer,
            @Param("captureConfigJson") String captureConfigJson,
            @Param("bedRoiJson") String bedRoiJson,
            @Param("bedExitConfigJson") String bedExitConfigJson);

    /** 실행 세션을 저장한다. 같은 세션 ID 가 이미 있으면 저장하지 않고 0 을 돌려준다. */
    int insertCameraSession(
            @Param("cameraSessionId") String cameraSessionId,
            @Param("cameraId") Long cameraId,
            @Param("modelBundleId") Long modelBundleId,
            @Param("configVer") int configVer,
            @Param("startedAt") OffsetDateTime startedAt);

    /** 실행 세션이 어느 카메라·위치의 것인지 찾는다. */
    EdgeCamera findSessionCamera(@Param("cameraSessionId") String cameraSessionId);

    /** 감지 이벤트를 저장한다. 같은 이벤트 ID 가 이미 있으면 저장하지 않고 0 을 돌려준다. */
    int insertDetectionEvent(
            @Param("eventId") String eventId,
            @Param("cameraId") Long cameraId,
            @Param("cameraSessionId") String cameraSessionId,
            @Param("locationId") Long locationId,
            @Param("trackId") Integer trackId,
            @Param("eventType") String eventType,
            @Param("decisionSt") String decisionSt,
            @Param("eventAt") OffsetDateTime eventAt,
            @Param("decisionScore") Double decisionScore,
            @Param("eventDetailJson") String eventDetailJson);

    /** 저장된 이벤트에 위치·병동·병원 정보를 붙여 조회한다. */
    DetectionAlert findDetectionAlert(@Param("eventId") String eventId);
}
