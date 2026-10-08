package com.aio.hospitalsafety.dto.admin;

import java.time.Instant;

/**
 * 관리자 감사 로그 조회 결과를 화면에 전달한다.
 *
 * TB_ADMIN_HISTORY에는 관리자 ID와 대상 직원 ID를 기록하고,
 * 직원 이름과 담당 병동 이름은 조회 시 TB_EMP와 TB_WARD에서 가져온다.
 *
 * 삭제된 직원은 TB_EMP에서 조회되지 않을 수 있으므로
 * userName과 wardName은 null일 수 있다.
 *
 * [2026.09.27] jobType(GENERAL/CAREGIVER)과 roomNumber 를 더했다.
 * 관리 이력 화면이 간호사·간병인 이력을 이 값으로 나눈다. 전에는 지금 활성·승인 대기 직원 목록과 맞춰 봐서
 * 비활성화·삭제된 직원의 이력이 빠졌다. 삭제된 직원은 둘 다 null 이다.
 * MyBatis 가 SELECT 순서대로 넣으므로 새 칸은 맨 끝에 둔다.
 */
public record AdminHistoryResponse(
        Long historyId,
        String adminId,
        String userId,
        String userName,
        String wardName,
        String actionCode,
        Instant createdAt,
        String jobType,
        String roomNumber,
        // [2026.09.30 추가] 처리 내용(변경 전 → 후). 이전 이력은 null
        String actionDetail
) {
}