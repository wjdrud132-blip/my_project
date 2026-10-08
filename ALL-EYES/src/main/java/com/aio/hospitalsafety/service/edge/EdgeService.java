package com.aio.hospitalsafety.service.edge;

import com.aio.hospitalsafety.common.EventTypes;
import com.aio.hospitalsafety.dto.edge.DetectionAlert;
import com.aio.hospitalsafety.dto.edge.EdgeCamera;
import com.aio.hospitalsafety.dto.edge.EdgeEventRequest;
import com.aio.hospitalsafety.dto.edge.EdgeSessionRequest;
import com.aio.hospitalsafety.dto.edge.ModelBundleRow;
import com.aio.hospitalsafety.mapper.edge.EdgeMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import java.util.List;
import java.util.Map;

/**
 * 젯슨이 보낸 실행 세션과 감지 이벤트를 저장한다.
 *
 * 저장 순서
 * 1. 세션: 장치 → 카메라 → 모델 묶음 → 카메라 설정 버전 → 실행 세션
 * 2. 이벤트: 실행 세션으로 카메라·위치를 찾고 TB_DETECTION_EVENT 에 저장
 *
 * 카메라와 위치(TB_LOCATION, TB_EDGE_DEVICE, TB_CAMERA)는 미리 등록돼 있어야 한다.
 */
@Service
public class EdgeService {

    private static final Logger log = LoggerFactory.getLogger(EdgeService.class);

    private final EdgeMapper edgeMapper;
    private final JsonMapper jsonMapper;

    public EdgeService(EdgeMapper edgeMapper, JsonMapper jsonMapper) {
        this.edgeMapper = edgeMapper;
        this.jsonMapper = jsonMapper;
    }

    /**
     * 실행 세션이 처음 온 것이면 등록한다.
     *
     * @return 새로 등록했으면 true, 같은 세션이 이미 있어서 아무것도 안 했으면 false
     */
    @Transactional
    public boolean registerSessionIfNew(EdgeSessionRequest request) {
        // 0. 같은 세션이 이미 있으면(젯슨이 응답을 못 받고 다시 보낸 경우) 아무것도 저장하지 않는다.
        if (edgeMapper.findSessionCamera(request.cameraSessionId().toString()) != null) {
            return false;
        }

        // 1. 장치
        List<Long> deviceIds = edgeMapper.findEnabledEdgeDeviceIds(request.deviceName());
        if (deviceIds.isEmpty()) {
            throw badRequest("등록되지 않았거나 사용 중지된 장치입니다: " + request.deviceName());
        }
        if (deviceIds.size() > 1) {
            throw badRequest("같은 이름의 장치가 여러 대 등록돼 있습니다: " + request.deviceName());
        }
        Long edgeDeviceId = deviceIds.get(0);
        // 마지막 연락 시각은 새 세션을 등록할 때만 바꾼다(이벤트마다 바꾸지 않는다).
        edgeMapper.updateEdgeDeviceLastSeen(edgeDeviceId);

        // 2. 카메라 (카메라와 설치 위치는 미리 등록해 둔다)
        EdgeCamera camera = edgeMapper.findEnabledCamera(edgeDeviceId, request.sourceRef());
        if (camera == null) {
            throw badRequest("이 장치에 등록되지 않은 카메라입니다: " + request.sourceRef());
        }

        // 3. 모델 묶음: 처음 보는 이름이면 저장, 같은 이름이면 같은 모델인지 확인
        Long modelBundleId = findOrSaveModelBundle(request.modelBundle());

        // 4. 카메라 설정: 가장 최근 설정과 같으면 그 버전, 다르면 새 버전
        int configVer = findOrSaveCameraConfig(camera.cameraId(), request.cameraConfig());

        // 5. 실행 세션
        int inserted = edgeMapper.insertCameraSession(
                request.cameraSessionId().toString(),
                camera.cameraId(),
                modelBundleId,
                configVer,
                request.startedAt());
        return inserted == 1;
    }

    /**
     * 감지 이벤트가 처음 온 것이면 저장한다.
     *
     * @return 새로 저장했으면 대시보드·SMS 에 쓸 정보, 같은 이벤트가 이미 있으면 null
     */
    @Transactional
    public DetectionAlert saveEventIfNew(EdgeEventRequest request) {
        if (!EventTypes.isAllowed(request.eventType(), request.decisionSt())) {
            throw badRequest("이벤트 종류와 판정 상태 조합이 올바르지 않습니다: "
                    + request.eventType() + "/" + request.decisionSt());
        }

        String sessionId = request.cameraSessionId().toString();
        EdgeCamera camera = edgeMapper.findSessionCamera(sessionId);
        if (camera == null) {
            // 400 을 주면 젯슨이 이 이벤트를 보류 파일로 빼 버린다.
            // 428 을 주면 젯슨 전송기가 세션을 다시 등록한 뒤 같은 이벤트를 다시 보낸다(서버 DB 를 새로 만든 경우 등).
            throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED,
                    "등록되지 않은 실행 세션입니다. 세션을 먼저 등록해 주세요: " + sessionId);
        }

        String eventId = request.eventId().toString();
        int inserted = edgeMapper.insertDetectionEvent(
                eventId,
                camera.cameraId(),
                sessionId,
                camera.locationId(),
                request.trackId(),
                request.eventType(),
                request.decisionSt(),
                request.eventAt(),
                request.decisionScore(),
                toJson(request.eventDetail()));

        if (inserted == 0) {
            // 젯슨이 응답을 못 받고 같은 이벤트를 다시 보낸 경우
            return null;
        }
        return edgeMapper.findDetectionAlert(eventId);
    }

    private Long findOrSaveModelBundle(EdgeSessionRequest.ModelBundle bundle) {
        String modelConfigJson = toJson(bundle.modelConfig() == null ? Map.of() : bundle.modelConfig());

        ModelBundleRow saved = edgeMapper.findModelBundle(bundle.bundleName());
        if (saved == null) {
            edgeMapper.insertModelBundle(
                    bundle.bundleName(),
                    bundle.poseModelName(),
                    bundle.poseModelSha256(),
                    bundle.fallModelName(),
                    bundle.fallModelSha256(),
                    bundle.featureVersion(),
                    modelConfigJson);
            return edgeMapper.findModelBundle(bundle.bundleName()).modelBundleId();
        }

        boolean sameModelFiles = saved.poseModelSha256().equalsIgnoreCase(bundle.poseModelSha256())
                && saved.fallModelSha256().equalsIgnoreCase(bundle.fallModelSha256());
        if (!sameModelFiles) {
            // 이름은 같은데 모델 파일이 다르다. 새 모델이면 묶음 이름을 바꿔서 보내야 한다.
            throw badRequest("같은 이름의 모델 묶음이 다른 모델로 이미 등록돼 있습니다: " + bundle.bundleName());
        }

        // 모델 파일은 같은데 설정(임계값 등)만 다르면 막지 않고 경고만 남긴다.
        // 막으면 젯슨이 이벤트를 하나도 못 보내게 되기 때문이다. 정확히 남기려면 젯슨에서 묶음 이름을 바꿔 보낸다.
        if (!edgeMapper.isSameModelSettings(saved.modelBundleId(), bundle.featureVersion(), modelConfigJson)) {
            log.warn("모델 묶음 '{}' 의 설정이 처음 등록한 것과 다릅니다. DB 에는 처음 설정이 남아 있습니다.",
                    bundle.bundleName());
        }
        return saved.modelBundleId();
    }

    private int findOrSaveCameraConfig(Long cameraId, EdgeSessionRequest.CameraConfig config) {
        // 침대 영역과 침대 이탈 설정은 둘 다 있거나 둘 다 없어야 한다(CK_CAMERA_BED_CONFIG_PAIR).
        if ((config.bedRoi() == null) != (config.bedExitConfig() == null)) {
            throw badRequest("침대 영역과 침대 이탈 설정은 함께 보내야 합니다.");
        }

        String captureJson = toJson(config.captureConfig());
        String bedRoiJson = config.bedRoi() == null ? null : toJson(config.bedRoi());
        String bedExitJson = config.bedExitConfig() == null ? null : toJson(config.bedExitConfig());

        Integer sameVer = edgeMapper.findLatestSameConfigVer(cameraId, captureJson, bedRoiJson, bedExitJson);
        if (sameVer != null) {
            return sameVer;
        }

        int newVer = edgeMapper.findMaxConfigVer(cameraId) + 1;
        edgeMapper.insertCameraConfig(cameraId, newVer, captureJson, bedRoiJson, bedExitJson);
        return newVer;
    }

    private String toJson(Map<String, Object> value) {
        return jsonMapper.writeValueAsString(value);
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
