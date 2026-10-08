// PGH
package com.aio.hospitalsafety.domain;

/**
 * TB_EMP.AUTH_ST에 저장되는 계정 상태다.
 * APPROVED는 활성화, INACTIVE는 비활성화이며 활성 계정만 로그인할 수 있다.
 */
public enum ApprovalStatus {
    APPROVED, // 승인 완료
    INACTIVE  // 비활성화
}
