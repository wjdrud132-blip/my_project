package com.aio.hospitalsafety.config;

// [수정완료] 로그인 표시 이름의 세션 키를 공통으로 관리합니다.
public final class UserDisplaySession {
    public static final String DISPLAY_NAME = "userDisplayName";
    // [수정완료] 로그인 성공 시각을 현재 세션에 저장합니다.
    public static final String LOGIN_TIME = "userLoginTime";
    private UserDisplaySession() {}
}
