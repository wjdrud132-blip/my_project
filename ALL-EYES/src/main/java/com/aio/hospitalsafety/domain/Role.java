// PGH
package com.aio.hospitalsafety.domain;

/**
 * TB_EMP.ROLE_CD에 저장할 수 있는 직원 역할을 제한하는 enum이다.
 * 문자열을 직접 사용하면 "ADMN" 같은 오타가 생길 수 있지만 enum은 정해진 값만 허용한다.
 * 가입 기본값은 USER이며 ADMIN은 회원 관리 등의 관리자 권한에 사용한다.
 */
public enum Role {
    ADMIN, // 관리자
    USER   // 일반 직원
}
