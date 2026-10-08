package com.aio.hospitalsafety.dto.sms;

/**
 * 낙상 SMS 를 받을 사람 한 명.
 *
 * userType 은 TB_SMS_SEND_HISTORY.USER_TYPE 값과 같다.
 * EMP: 병동 간호사, CAREGIVER: 병실 담당 간병인
 * userId: EMP 는 tb_emp.emp_id, CAREGIVER 는 'cg:' + TB_CAREGIVER.CAREGIVER_ID 다([2026.09.30 변경] 간병인은 명세 TB_CAREGIVER).
 */
public record SmsRecipient(
        String userType,
        String userId,
        String phoneNumber
) {
}
