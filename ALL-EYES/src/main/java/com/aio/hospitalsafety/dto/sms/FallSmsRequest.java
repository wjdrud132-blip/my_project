package com.aio.hospitalsafety.dto.sms;

import com.aio.hospitalsafety.dto.edge.DetectionAlert;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * 확정 낙상 한 건에 대해 SMS 를 보낼 때 필요한 정보.
 *
 * 감지 이벤트를 저장하는 쪽(TB_DETECTION_EVENT + TB_LOCATION + TB_WARD 조회)에서 만들어 넘긴다.
 *
 * @param eventId      TB_DETECTION_EVENT.EVENT_ID (중복 발송 확인에 쓴다)
 * @param hospitalId   병원 구분 ID
 * @param wardId       발생 병동 ID (간호사 조회에 쓴다)
 * @param wardName     발생 병동 이름. 예: 3병동
 * @param locationName 발생 위치 이름. 예: 301호, 중앙 복도
 * @param room         병실(ROOM)이면 true, 복도 같은 공용 공간(COMMON)이면 false
 * @param eventAt      낙상이 감지된 시각
 */
public record FallSmsRequest(
        UUID eventId,
        String hospitalId,
        Long wardId,
        String wardName,
        String locationName,
        boolean room,
        OffsetDateTime eventAt
) {

    /** 저장된 감지 이벤트(위치·병동 포함)로 SMS 요청을 만든다. */
    public static FallSmsRequest from(DetectionAlert alert) {
        return new FallSmsRequest(
                UUID.fromString(alert.eventId()),
                alert.hospitalId(),
                alert.wardId(),
                alert.wardName(),
                alert.locationName(),
                alert.isRoom(),
                alert.eventAt());
    }
}
