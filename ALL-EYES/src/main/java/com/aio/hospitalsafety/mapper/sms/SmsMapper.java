package com.aio.hospitalsafety.mapper.sms;

import com.aio.hospitalsafety.dto.sms.SmsRecipient;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 낙상 SMS 받는 사람 조회와 발송 이력(TB_SMS_SEND_HISTORY) 저장.
 */
@Mapper
public interface SmsMapper {

    /** 해당 병동에 소속된 비활성화되지 않은 일반 직원(JOB_CD=GENERAL, 전화번호가 있는 사람만). */
    List<SmsRecipient> findWardUsers(
            @Param("hospitalId") String hospitalId,
            @Param("wardId") Long wardId
    );

    /** [2026.09.30 추가] 해당 병실의 담당 간호사 전원(tb_emp_location → tb_location, 활성·전화번호가 있는 사람만). */
    List<SmsRecipient> findRoomUsers(
            @Param("hospitalId") String hospitalId,
            @Param("wardId") Long wardId,
            @Param("locationName") String locationName
    );

    /** [2026.09.30 변경] 해당 병실의 활성 담당 간병인(TB_CAREGIVER, 병실당 1명). 병실은 병동 + 위치 이름('302호')으로 찾는다. */
    List<SmsRecipient> findRoomCaregivers(
            @Param("hospitalId") String hospitalId,
            @Param("wardId") Long wardId,
            @Param("locationName") String locationName
    );

    /**
     * 같은 감지 이벤트로 이 사람에게 이미 SMS 를 보냈는지(성공·실패 상관없이 기록이 있는지).
     * 사람 단위로 확인해야 몇 명에게만 보내고 멈춘 경우 나머지를 이어서 보낼 수 있다.
     */
    boolean existsSmsHistory(
            @Param("eventId") String eventId,
            @Param("userType") String userType,
            @Param("userId") String userId
    );

    /** 최근 N분 안에 저장된 확정 낙상 이벤트 ID (서버 재시작 뒤 SMS 이어 보내기용) */
    List<String> findRecentConfirmedFallIds(@Param("minutes") int minutes);

    /** 발송 결과 한 건을 기록한다. sendStatus 는 SUCCESS 또는 FAILED. */
    int insertSmsHistory(
            @Param("eventId") String eventId,
            @Param("userType") String userType,
            @Param("userId") String userId,
            @Param("phoneNumber") String phoneNumber,
            @Param("messageContent") String messageContent,
            @Param("sendStatus") String sendStatus
    );
}
