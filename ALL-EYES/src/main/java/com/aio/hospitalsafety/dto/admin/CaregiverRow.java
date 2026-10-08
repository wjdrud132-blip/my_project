package com.aio.hospitalsafety.dto.admin;

/**
 * [2026.09.30 추가] TB_CAREGIVER 한 행(재활성화 전 확인용).
 */
public record CaregiverRow(
        Long caregiverId,
        Long locationId,
        String phoneNumber,
        String useYn
) {
}
