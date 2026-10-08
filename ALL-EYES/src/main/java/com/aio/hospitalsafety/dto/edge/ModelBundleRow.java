package com.aio.hospitalsafety.dto.edge;

/** 이미 등록된 모델 묶음. 같은 이름으로 다른 모델이 오는지 해시로 확인한다. */
public record ModelBundleRow(
        Long modelBundleId,
        String poseModelSha256,
        String fallModelSha256
) {
}
