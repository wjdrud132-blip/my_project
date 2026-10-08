package com.aio.hospitalsafety.dto.edge;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * 젯슨 프로그램이 켜질 때 보내는 실행 세션 등록 요청.
 * 이벤트보다 먼저 한 번 등록돼야 한다(TB_DETECTION_EVENT 가 세션을 참조하기 때문).
 */
public record EdgeSessionRequest(
        @NotNull(message = "실행 세션 ID가 필요합니다.")
        UUID cameraSessionId,

        @NotBlank(message = "장치 이름이 필요합니다.")
        String deviceName,

        @NotBlank(message = "카메라 경로가 필요합니다.")
        String sourceRef,

        @NotNull(message = "시작 시각이 필요합니다.")
        OffsetDateTime startedAt,

        @NotNull(message = "모델 정보가 필요합니다.")
        @Valid
        ModelBundle modelBundle,

        @NotNull(message = "카메라 설정이 필요합니다.")
        @Valid
        CameraConfig cameraConfig
) {

    /** TB_MODEL_BUNDLE 에 들어가는 모델 정보 */
    public record ModelBundle(
            @NotBlank(message = "모델 묶음 이름이 필요합니다.")
            String bundleName,

            @NotBlank(message = "포즈 모델 이름이 필요합니다.")
            String poseModelName,

            @NotNull(message = "포즈 모델 해시가 필요합니다.")
            @Pattern(regexp = "^[0-9a-fA-F]{64}$", message = "포즈 모델 해시는 64자리여야 합니다.")
            String poseModelSha256,

            @NotBlank(message = "낙상 모델 이름이 필요합니다.")
            String fallModelName,

            @NotNull(message = "낙상 모델 해시가 필요합니다.")
            @Pattern(regexp = "^[0-9a-fA-F]{64}$", message = "낙상 모델 해시는 64자리여야 합니다.")
            String fallModelSha256,

            @NotBlank(message = "특징 버전이 필요합니다.")
            String featureVersion,

            Map<String, Object> modelConfig
    ) {
    }

    /** TB_CAMERA_CONFIG 에 들어가는 카메라 설정. 침대 영역은 없으면 null 이다. */
    public record CameraConfig(
            @NotNull(message = "촬영 설정이 필요합니다.")
            Map<String, Object> captureConfig,

            Map<String, Object> bedRoi,

            Map<String, Object> bedExitConfig
    ) {
    }
}
