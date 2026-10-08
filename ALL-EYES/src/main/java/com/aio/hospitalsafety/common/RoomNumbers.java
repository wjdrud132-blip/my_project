package com.aio.hospitalsafety.common;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 위치 이름에서 병실 번호를 꺼낸다. 대시보드 알림과 간병인 SMS 가 같은 규칙을 쓰도록 한 곳에 둔다.
 * 예: "305호" → "305", "305호 (1인실)" → "305", "간호사실" → null
 */
public final class RoomNumbers {

    // 위치 이름 맨 앞의 숫자
    private static final Pattern LEADING_NUMBER = Pattern.compile("^(\\d+)");

    private RoomNumbers() {
    }

    /** 위치 이름 맨 앞의 숫자. 없으면 null (간병인 SMS 의 tb_emp.room_no 와 비교할 때 쓴다) */
    public static String fromLocationName(String locationName) {
        if (locationName == null) {
            return null;
        }
        Matcher matcher = LEADING_NUMBER.matcher(locationName.trim());
        return matcher.find() ? matcher.group(1) : null;
    }

    /**
     * 대시보드에 보낼 병실 번호. 병실(ROOM)이면 숫자(305), 공용 공간(COMMON)이면 null.
     * 대시보드는 병실 번호로 칸을 찾기 때문에 공용 공간은 번호를 보내지 않는다.
     */
    public static Integer forDashboard(String locationType, String locationName) {
        if (!EventTypes.ROOM.equals(locationType)) {
            return null;
        }
        String number = fromLocationName(locationName);
        return number == null ? null : Integer.valueOf(number);
    }
}
