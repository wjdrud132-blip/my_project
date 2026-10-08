package com.aio.hospitalsafety.common;

import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/**
 * 화면과 알림에 쓰는 한국 시각 문자열.
 * DB 에서 읽은 시각(TIMESTAMPTZ)은 UTC 로 올 수 있어서, 항상 Asia/Seoul 로 바꿔서 만든다.
 */
public final class SeoulTimes {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    // 조치 이력 화면 형식: 2026-09-25T14:30
    private static final DateTimeFormatter SCREEN_MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");

    // 낙상 SMS 형식(요구사항 AIO_035): 2026.09.21 14:30
    private static final DateTimeFormatter SMS_MINUTE = DateTimeFormatter.ofPattern("yyyy.MM.dd HH:mm");

    private SeoulTimes() {
    }

    /** 대시보드 알림용: 2026-09-25T14:30:12.345+09:00 */
    public static String withOffset(OffsetDateTime time) {
        return time.atZoneSameInstant(SEOUL).toOffsetDateTime().toString();
    }

    /** 낙상 SMS 용: 2026.09.21 14:30 */
    public static String smsMinute(OffsetDateTime time) {
        return time.atZoneSameInstant(SEOUL).format(SMS_MINUTE);
    }

    /** 조치 이력 화면용: 2026-09-25T14:30 (없으면 빈 문자열) */
    public static String screenMinute(OffsetDateTime time) {
        return time == null ? "" : time.atZoneSameInstant(SEOUL).format(SCREEN_MINUTE);
    }
}
