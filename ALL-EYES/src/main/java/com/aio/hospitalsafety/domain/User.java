// PGH
package com.aio.hospitalsafety.domain;

import java.time.Instant;

/**
 * 테이블 명세서의 TB_EMP 한 행을 표현하는 Domain 객체다.
 *
 * TB_EMP는 별도의 숫자 PK가 없고 직원 ID(EMP_ID)를 기본키로 사용한다.
 * record를 사용하면 생성자, equals/hashCode/toString과 값 조회 메서드가 자동 생성된다.
 * 프로젝트 네이밍 규칙에 따라 일반 사용자는 User로 표현한다.
 * DB의 EMP_ID, EMP_NM은 기존 물리 컬럼명이므로 유지하되 Java에서는 userId, userName으로 매핑한다.
 * record는 일반 getter인 getUserId() 대신 userId() 형태로 값을 읽는 점에 주의한다.
 *
 * 이 Domain에는 화면 전용 값인 PW 확인을 넣지 않는다.
 */
public record User(
        // EMP_ID: 로그인에 사용하는 중복 없는 직원 ID
        String userId,
        // EMP_PW: 원문 PW가 아닌 BCrypt 단방향 해시값
        String passwordHash,
        // HOSP_DIV_ID: 직원이 소속된 병원 구분 ID
        String hospitalId,
        // WARD_ID: TB_WARD.WARD_ID를 참조하는 병동 ID
        Long wardId,
        // EMP_NM: 직원명
        String userName,
        // ROLE_CD: ADMIN 또는 USER
        Role role,
        // AUTH_ST: 계정 상태. APPROVED(활성화) 또는 INACTIVE(비활성화)
        ApprovalStatus approvalStatus,
        // CRT_DT: 계정 생성 일시. DB DEFAULT NOW()로 처음 저장된다.
        Instant createdAt,
        // UPD_DT: 계정 정보가 변경될 때 갱신된다. 아직 수정 전이면 null일 수 있다.
        Instant updatedAt,
        // FAILED_LOGIN_COUNT: 로그인 연속 실패 횟수. 로그인 성공 시 0으로 초기화된다.
        // MyBatis의 resultMap 생성자 매핑이 원시타입 int와 매칭되지 않아 Integer로 선언한다.
        Integer failedLoginCount,
        // LOCKED_UNTIL: 이 시각까지는 비밀번호가 맞아도 로그인이 거부된다. null이면 잠기지 않은 상태다.
        Instant lockedUntil) {
}
