package com.aio.hospitalsafety.common;

/**
 * [2026.09.30 추가] 간병인은 명세의 TB_CAREGIVER 에 저장한다(로그인 계정이 아니라 tb_emp 에 없다).
 * 관리자 화면은 간호사와 같은 userId 자리로 간병인을 구분하므로, 간병인은 'cg:' + CAREGIVER_ID 로 주고받는다.
 * ':' 는 직원 아이디에 쓸 수 없는 문자라(영문·숫자·._- 만 허용) 간호사 아이디와 겹치지 않는다.
 * 관리 이력(TB_ADMIN_HISTORY.USER_ID)과 SMS 기록(TB_SMS_SEND_HISTORY.USER_ID)에도 같은 값을 남긴다.
 */
public final class CaregiverIds {

    public static final String PREFIX = "cg:";

    private CaregiverIds() {
    }

    public static boolean isCaregiver(String userId) {
        return userId != null && userId.startsWith(PREFIX);
    }

    public static String of(long caregiverId) {
        return PREFIX + caregiverId;
    }

    public static long toId(String userId) {
        if (!isCaregiver(userId)) {
            throw new IllegalArgumentException("간병인 정보를 찾을 수 없습니다. 목록을 새로고침해 주세요.");
        }
        try {
            return Long.parseLong(userId.substring(PREFIX.length()));
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("간병인 정보를 찾을 수 없습니다. 목록을 새로고침해 주세요.");
        }
    }
}
