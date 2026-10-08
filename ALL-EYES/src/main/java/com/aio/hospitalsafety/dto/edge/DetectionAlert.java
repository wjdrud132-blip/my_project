package com.aio.hospitalsafety.dto.edge;

import com.aio.hospitalsafety.common.EventTypes;

import java.time.OffsetDateTime;

/**
 * 저장된 감지 이벤트에 위치·병동 정보를 붙인 것.
 * 대시보드 실시간 알림과 낙상 SMS 에 같이 쓴다.
 *
 * duplicateOf: 젯슨이 "10초 안에 같은 사람(또는 아주 가까운 위치)에서 다시 난 확정 낙상"이라고
 * 표시한 경우 처음 이벤트의 ID. 처음 난 낙상이면 null 이다(젯슨 integrated_events.py).
 */
public record DetectionAlert(
        String eventId,
        String eventType,
        String decisionSt,
        OffsetDateTime eventAt,
        String hospitalId,
        Long wardId,
        String wardName,
        String locationName,
        String locationType,
        String duplicateOf
) {

    /** 확정 낙상이면 true */
    public boolean isConfirmedFall() {
        return EventTypes.isConfirmedFall(eventType, decisionSt);
    }

    /**
     * SMS 를 보내야 하는지. 확정 낙상이면서, 같은 낙상의 반복 알림이 아닐 때만 보낸다.
     * (환자가 바닥에 누워 있는 동안 몇 초마다 확정 알림이 반복돼도 문자는 한 번만 가게 한다)
     */
    public boolean needsFallSms() {
        return isConfirmedFall() && duplicateOf == null;
    }

    /** 병실이면 true, 복도 같은 공용 공간이면 false */
    public boolean isRoom() {
        return EventTypes.ROOM.equals(locationType);
    }
}
