package com.aio.hospitalsafety.common;

/**
 * 감지 이벤트에 쓰는 코드 값. 테이블 명세(TB_DETECTION_EVENT, TB_LOCATION)의 값과 같다.
 * 문자열을 여러 곳에 직접 쓰면 오타가 나도 모르므로 여기 한 곳에 둔다.
 */
public final class EventTypes {

    // TB_DETECTION_EVENT.EVENT_TYPE
    public static final String FALL = "FALL";
    public static final String BED_EXIT = "BED_EXIT";

    // TB_DETECTION_EVENT.DECISION_ST
    public static final String CONFIRMED = "CONFIRMED";
    public static final String SUSPECTED = "SUSPECTED";

    // TB_LOCATION.LOCATION_TYPE
    public static final String ROOM = "ROOM";

    private EventTypes() {
    }

    /** 테이블 제약(CK_DETECTION_EVENT_DECISION)과 같은 규칙: 낙상은 확정·의심, 침대 이탈은 확정만 */
    public static boolean isAllowed(String eventType, String decisionSt) {
        if (FALL.equals(eventType)) {
            return CONFIRMED.equals(decisionSt) || SUSPECTED.equals(decisionSt);
        }
        if (BED_EXIT.equals(eventType)) {
            return CONFIRMED.equals(decisionSt);
        }
        return false;
    }

    /** 확정 낙상인지 (SMS 를 보내는 유일한 경우) */
    public static boolean isConfirmedFall(String eventType, String decisionSt) {
        return FALL.equals(eventType) && CONFIRMED.equals(decisionSt);
    }
}
