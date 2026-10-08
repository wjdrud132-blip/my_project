package com.aio.hospitalsafety.service.sms;

import com.aio.hospitalsafety.common.SeoulTimes;
import com.aio.hospitalsafety.dto.sms.FallSmsRequest;
import com.aio.hospitalsafety.dto.sms.SmsRecipient;
import com.aio.hospitalsafety.mapper.sms.SmsMapper;
import com.solapi.sdk.SolapiClient;
import com.solapi.sdk.message.model.Message;
import com.solapi.sdk.message.service.DefaultMessageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;

/**
 * 확정 낙상 SMS 발송 (요구사항 AIO_035, FR-AD-600, FR-AD-601).
 *
 * 처리 순서
 * 1. 받는 사람을 찾는다. [2026.09.30 변경] 병실이면 그 병실 담당 간호사 전원 + 담당 간병인,
 *    담당 간호사가 없으면(병실 담당을 두지 않는 병원 등) 병동 간호사 전원 + 담당 간병인. 복도 같은 공용 공간이면 병동 간호사 전원.
 * 2. 요구사항 정의서의 형식으로 문자 내용을 만든다.
 * 3. 한 사람에게 1회씩 SOLAPI 로 보내고 성공·실패를 TB_SMS_SEND_HISTORY 에 기록한다.
 *    이미 기록이 있는 사람은 건너뛴다. 실패해도 다시 보내지 않는다.
 *    (서버가 도중에 꺼져 일부만 보냈으면, 다시 켤 때 SmsRecoveryService 가 나머지 사람에게 보낸다)
 *
 * 낙상 의심과 침대 이탈에는 이 서비스를 부르지 않는다.
 *
 * SOLAPI 키, 비밀키, 발신번호는 코드에 넣지 않고 환경변수로 받는다(application.properties 참고).
 * 셋 중 하나라도 없으면 실제로 보내지 않고 실패로 기록한다.
 * [2026.09.28] SOLAPI_DRY_RUN=true 이면 키가 있어도 보내지 않고, 보낼 내용을 로그([문자 시험 모드])로만 남긴다.
 */
@Service
public class SmsService {

    private static final Logger log = LoggerFactory.getLogger(SmsService.class);

    private final SmsMapper smsMapper;
    private final String senderNumber;

    // SOLAPI 설정이 없으면 null 이다. null 이면 보내지 않고 실패로 기록한다.
    private final DefaultMessageService messageService;

    // [2026.09.28 추가] 문자 시험 모드(SOLAPI_DRY_RUN=true). SOLAPI 를 부르지 않고 보낼 내용을 로그로만 남긴다.
    // SOLAPI 사용량을 쓰지 않고 받는 사람·문자 내용을 확인하려는 시험용이다. 기록은 '보내지 않음'이라 FAILED 로 남는다.
    private final boolean dryRun;

    // 지금 SMS 를 보내고 있는 이벤트 ID. 같은 이벤트를 두 작업이 동시에 보내 중복 문자가 가는 것을 막는다.
    // (예: 서버가 켜지는 순간 젯슨이 보낸 낙상과, 켜질 때 도는 SmsRecoveryService 가 겹치는 경우)
    private final Set<String> sendingEventIds = ConcurrentHashMap.newKeySet();

    // [2026.09.29 추가] 중복·과다 발송 방지(application.properties 의 solapi.location-cooldown-seconds / max-sends / allowed-last4).
    // 같은 위치에서 쿨다운 안에 난 새 낙상, 최대 개수를 넘는 문자, 허용 목록 밖의 번호는 보내지 않고 FAILED 로 기록한다.
    // 기록을 남기는 이유: 서버를 다시 켤 때 SmsRecoveryService 가 '아직 안 보낸 사람'으로 보고 뒤늦게 보내지 않게 하려는 것이다.
    private final long locationCooldownMillis;
    private final int maxSends;
    private final Set<String> allowedLast4;
    private final AtomicInteger sendCount = new AtomicInteger();
    private final Map<String, Long> lastSentAtByLocation = new ConcurrentHashMap<>();

    public SmsService(
            SmsMapper smsMapper,
            @Value("${solapi.api-key:}") String apiKey,
            @Value("${solapi.api-secret:}") String apiSecret,
            @Value("${solapi.sender-number:}") String senderNumber,
            @Value("${solapi.dry-run:false}") boolean dryRun,
            @Value("${solapi.location-cooldown-seconds:60}") long locationCooldownSeconds,
            @Value("${solapi.max-sends:0}") int maxSends,
            @Value("${solapi.allowed-last4:}") String allowedLast4) {
        this.smsMapper = smsMapper;
        this.dryRun = dryRun;
        this.locationCooldownMillis = Math.max(0, locationCooldownSeconds) * 1000L;
        this.maxSends = Math.max(0, maxSends);
        this.allowedLast4 = Arrays.stream(allowedLast4.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).collect(Collectors.toUnmodifiableSet());
        if (dryRun) {
            log.warn("[문자 시험 모드] 켜짐: 낙상 SMS 를 실제로 보내지 않고, 보낼 내용을 로그로만 남깁니다(SOLAPI_DRY_RUN=true).");
        }
        log.info("문자 중복·과다 발송 방지: 같은 위치 {}초 안 재발송 막음, 최대 개수 {}, 허용 번호 {}",
                locationCooldownSeconds, this.maxSends == 0 ? "제한 없음" : this.maxSends + "통",
                this.allowedLast4.isEmpty() ? "전체" : "끝자리 " + this.allowedLast4.size() + "개");
        // 발신번호는 "010-1234-5678" 처럼 넣어도 되게 숫자만 남긴다(SOLAPI 는 숫자만 받는다).
        this.senderNumber = senderNumber.replace("-", "").trim();

        if (apiKey.isBlank() || apiSecret.isBlank() || senderNumber.isBlank()) {
            this.messageService = null;
            log.warn("SOLAPI 설정(키, 비밀키, 발신번호)이 없어 낙상 SMS 는 보내지 않고 실패로 기록합니다.");
        } else {
            this.messageService = SolapiClient.INSTANCE.createInstance(apiKey, apiSecret);
        }
    }

    /**
     * 확정 낙상 SMS 를 보낸다.
     *
     * 이 메서드는 예외를 밖으로 던지지 않는다. SMS 가 실패해도 대시보드 알림은 정상으로
     * 나가야 하기 때문이다(AIO_035 예외 흐름).
     * @Async: 따로 도는 작업으로 실행해서 젯슨에게 보내는 응답을 늦추지 않는다(AsyncConfig).
     */
    @Async
    public void sendFallSms(FallSmsRequest request) {
        String eventId = request.eventId().toString();

        // 같은 이벤트를 다른 작업이 보내고 있으면 그쪽에 맡긴다.
        if (!sendingEventIds.add(eventId)) {
            return;
        }
        try {
            List<SmsRecipient> recipients = findRecipients(request);
            if (recipients.isEmpty()) {
                // 받는 사람이 없으면 TB_SMS_SEND_HISTORY 에 넣을 사람(USER_ID, PHONE_NO NOT NULL)이 없어 로그만 남긴다.
                // 확정 낙상인데 아무도 문자를 못 받는 상황이라 ERROR 로 남긴다(간호사 전화번호 미등록 등).
                log.error("낙상 SMS 를 받을 사람이 없습니다. eventId={} 위치={} {}",
                        eventId, request.wardName(), request.locationName());
                return;
            }
            // [2026.09.29] 같은 위치에서 쿨다운 안에 이미 보냈으면 이번 낙상은 보내지 않고 FAILED 로만 기록한다.
            String locationKey = request.hospitalId() + "/" + request.wardId() + "/" + request.locationName();
            long now = System.currentTimeMillis();
            Long lastSentAt = lastSentAtByLocation.get(locationKey);
            boolean inCooldown = locationCooldownMillis > 0 && lastSentAt != null && now - lastSentAt < locationCooldownMillis;
            if (!inCooldown) {
                lastSentAtByLocation.put(locationKey, now);
            } else {
                log.info("같은 위치에 {}초 전 문자를 보내 이번 낙상 문자는 보내지 않습니다. eventId={} 위치={} {}",
                        (now - lastSentAt) / 1000, eventId, request.wardName(), request.locationName());
            }
            sendToEachOnce(eventId, recipients, buildFallMessage(request), inCooldown);
        } catch (RuntimeException exception) {
            // 예외 전체를 남기면 DB 오류 설명에 전화번호가 섞일 수 있어 종류만 남긴다.
            log.error("낙상 SMS 처리 중 오류가 났습니다. eventId={} 오류={}",
                    eventId, exception.getClass().getSimpleName());
        } finally {
            sendingEventIds.remove(eventId);
        }
    }

    /**
     * 받는 사람 (전화번호가 있는 활성 직원만)
     * [2026.09.30 변경] 병실: 그 병실 담당 간호사 전원 + 담당 간병인. 담당 간호사가 없으면 병동 간호사 전원 + 담당 간병인.
     *                  복도 같은 공용 공간: 병동 간호사 전원.
     */
    private List<SmsRecipient> findRecipients(FallSmsRequest request) {
        // [2026.09.30 변경] 담당 간호사(tb_emp_location)와 담당 간병인(TB_CAREGIVER)은 모두 병실 위치(TB_LOCATION)로 찾는다.
        // 이벤트의 위치와 같은 병동·같은 위치 이름('302호')이면 같은 병실이다.
        if (!request.room()) {
            return new ArrayList<>(smsMapper.findWardUsers(request.hospitalId(), request.wardId()));
        }

        List<SmsRecipient> recipients = new ArrayList<>(
                smsMapper.findRoomUsers(request.hospitalId(), request.wardId(), request.locationName()));
        if (recipients.isEmpty()) {
            // 놓친 알림이 가장 위험하므로, 담당 간호사가 없으면 병동 간호사 전원에게 보낸다.
            recipients.addAll(smsMapper.findWardUsers(request.hospitalId(), request.wardId()));
        }
        recipients.addAll(smsMapper.findRoomCaregivers(request.hospitalId(), request.wardId(), request.locationName()));
        return recipients;
    }

    /**
     * 한 사람씩 1회 보내고 결과를 기록한다.
     * 이 사람에게 이미 기록(성공·실패)이 있으면 건너뛴다. 실패한 사람에게 다시 보내지 않는다(FR-AD-601).
     * 한 사람에서 DB 오류가 나도 나머지 사람에게는 계속 보낸다.
     */
    private void sendToEachOnce(String eventId, List<SmsRecipient> recipients, String content, boolean skipAll) {
        for (SmsRecipient recipient : recipients) {
            try {
                if (smsMapper.existsSmsHistory(eventId, recipient.userType(), recipient.userId())) {
                    continue;
                }
                boolean sent = !skipAll && allowedToSend(recipient) && sendOne(recipient, content);
                smsMapper.insertSmsHistory(
                        eventId,
                        recipient.userType(),
                        recipient.userId(),
                        recipient.phoneNumber(),
                        content,
                        sent ? "SUCCESS" : "FAILED"
                );
            } catch (RuntimeException exception) {
                // 사람 ID(간병인은 ID 에 전화번호가 들어 있다)와 예외 설명은 로그에 남기지 않는다.
                log.error("낙상 SMS 한 사람 처리 실패, 다음 사람으로 넘어갑니다. eventId={} 구분={} 오류={}",
                        eventId, recipient.userType(), exception.getClass().getSimpleName());
            }
        }
    }

    /**
     * 요구사항 정의서 AIO_035 의 문자 형식.
     *
     * [ALLEYES 안전 알림]
     * 1병동 301호에서 낙상이 감지되었습니다.
     * 즉시 발생 위치를 확인해 주세요.
     * 발생 시각 : 2026.09.21 14:30
     */
    public String buildFallMessage(FallSmsRequest request) {
        return "[ALLEYES 안전 알림]\n"
                + request.wardName() + " " + request.locationName() + "에서 낙상이 감지되었습니다.\n"
                + "즉시 발생 위치를 확인해 주세요.\n"
                + "발생 시각 : " + SeoulTimes.smsMinute(request.eventAt());
    }

    /**
     * [2026.09.29] 허용 목록·최대 개수 검사. 통과하면 한 통을 쓴 것으로 센다(시험 모드도 같은 규칙으로 센다).
     * 번호는 끝 4자리만 로그에 남긴다.
     */
    private boolean allowedToSend(SmsRecipient recipient) {
        String digits = recipient.phoneNumber().replaceAll("[^0-9]", "");
        String tail = digits.length() >= 4 ? digits.substring(digits.length() - 4) : "????";
        if (!allowedLast4.isEmpty() && !allowedLast4.contains(tail)) {
            log.info("허용 목록에 없는 번호라 보내지 않습니다. 구분={} 번호 끝자리={}", recipient.userType(), tail);
            return false;
        }
        if (maxSends > 0 && sendCount.incrementAndGet() > maxSends) {
            log.warn("문자 최대 개수({}통)에 닿아 더 보내지 않습니다. 구분={} 번호 끝자리={}", maxSends, recipient.userType(), tail);
            return false;
        }
        return true;
    }

    /** SOLAPI 설정(키, 비밀키, 발신번호)이 모두 있어 실제로 보낼 수 있으면 true */
    public boolean isConfigured() {
        return messageService != null;
    }

    /**
     * 한 사람에게 보낸다. 성공하면 true.
     * 전화번호는 로그에 남기지 않는다. 간병인은 사람 ID(cg.전화번호)에도 번호가 있어 받는 사람 구분만 남긴다.
     */
    private boolean sendOne(SmsRecipient recipient, String content) {
        if (dryRun) {
            // [2026.09.28] 시험 모드: SOLAPI 를 부르지 않는다. 번호는 끝 4자리만 남긴다(전체 번호는 로그에 남기지 않는 원칙).
            String digits = recipient.phoneNumber().replaceAll("[^0-9]", "");
            String tail = digits.length() >= 4 ? digits.substring(digits.length() - 4) : "????";
            log.info("[문자 시험 모드] 보내지 않음. 받는 사람 구분={} 번호 끝자리={}\n{}", recipient.userType(), tail, content);
            return false;
        }
        if (messageService == null) {
            log.warn("SOLAPI 설정이 없어 보내지 않았습니다. 구분={}", recipient.userType());
            return false;
        }

        Message message = new Message();
        message.setFrom(senderNumber);
        message.setTo(recipient.phoneNumber().replace("-", ""));
        message.setText(content);

        try {
            messageService.send(message);
            return true;
        } catch (Exception | LinkageError exception) {
            // TB_SMS_SEND_HISTORY 에는 실패 사유를 적을 칸이 없어서 사유(예외 종류)는 로그에만 남긴다.
            // 예외 설명에는 받는 번호가 들어갈 수 있어 남기지 않는다.
            // LinkageError: SOLAPI 라이브러리가 쓰는 OkHttp 가 다른 버전과 부딪치는 경우. 실패로 기록하고 다음 사람으로 넘어간다.
            log.warn("낙상 SMS 발송 실패. 구분={} 사유={}",
                    recipient.userType(), exception.getClass().getSimpleName());
            return false;
        }
    }
}
