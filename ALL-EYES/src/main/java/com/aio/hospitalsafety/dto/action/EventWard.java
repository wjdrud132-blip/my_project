package com.aio.hospitalsafety.dto.action;

/** 감지 이벤트가 난 병원과 병동 (권한 확인용) */
public record EventWard(
        String hospitalId,
        Long wardId
) {
}
