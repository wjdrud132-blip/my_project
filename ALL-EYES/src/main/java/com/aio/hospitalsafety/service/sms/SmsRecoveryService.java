package com.aio.hospitalsafety.service.sms;

import com.aio.hospitalsafety.dto.edge.DetectionAlert;
import com.aio.hospitalsafety.dto.sms.FallSmsRequest;
import com.aio.hospitalsafety.mapper.edge.EdgeMapper;
import com.aio.hospitalsafety.mapper.sms.SmsMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 서버를 다시 켤 때, 최근 확정 낙상 중 SMS 를 아직 못 받은 사람에게 이어서 보낸다.
 *
 * 확정 낙상은 DB 에 먼저 저장된 뒤 SMS 를 보낸다. 그 사이에 서버가 꺼지면 젯슨이 다시 보내도
 * "이미 받은 이벤트(409)" 라서 SMS 가 다시 시작되지 않는다. 그래서 켜질 때 한 번 확인한다.
 *
 * - 대상: 최근 RECOVERY_MINUTES 분 안에 저장된 확정 낙상 (오래된 낙상 문자를 뒤늦게 보내지 않도록 짧게 둔다)
 * - 기록(성공·실패)이 이미 있는 사람은 건너뛴다(SmsService). 실패한 사람에게 다시 보내는 것이 아니다.
 * - 켜지는 순간 젯슨이 보낸 낙상과 겹쳐도, SmsService 가 같은 이벤트를 한 번에 하나만 보내므로 중복 문자가 가지 않는다.
 * - SOLAPI 설정이 없는 서버에서는 하지 않는다(아래 resumeRecentFallSms 참고).
 */
@Service
public class SmsRecoveryService {

    private static final Logger log = LoggerFactory.getLogger(SmsRecoveryService.class);

    // 이어 보낼 최근 시간(분)
    private static final int RECOVERY_MINUTES = 10;

    private final SmsMapper smsMapper;
    private final EdgeMapper edgeMapper;
    private final SmsService smsService;

    public SmsRecoveryService(SmsMapper smsMapper, EdgeMapper edgeMapper, SmsService smsService) {
        this.smsMapper = smsMapper;
        this.edgeMapper = edgeMapper;
        this.smsService = smsService;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void resumeRecentFallSms() {
        // SOLAPI 설정이 없는 서버(팀원 개발 서버 등)는 이어 보내기를 하지 않는다.
        // 같은 공용 DB 를 쓰는 다른 서버가 보낼 사람을, 이 서버가 먼저 '실패'로 기록해 막지 않기 위해서다.
        if (!smsService.isConfigured()) {
            log.info("SOLAPI 설정이 없어 서버 시작 SMS 이어 보내기를 하지 않습니다.");
            return;
        }
        try {
            List<String> eventIds = smsMapper.findRecentConfirmedFallIds(RECOVERY_MINUTES);
            for (String eventId : eventIds) {
                DetectionAlert alert = edgeMapper.findDetectionAlert(eventId);
                if (alert != null) {
                    smsService.sendFallSms(FallSmsRequest.from(alert));
                }
            }
            if (!eventIds.isEmpty()) {
                log.info("서버 시작: 최근 {}분 확정 낙상 {}건의 SMS 누락 여부를 확인했습니다.", RECOVERY_MINUTES, eventIds.size());
            }
        } catch (RuntimeException exception) {
            // 테이블이 아직 없는 DB 등. 서버 시작은 막지 않는다.
            log.warn("서버 시작 SMS 확인을 건너뜁니다: {}", exception.getMessage());
        }
    }
}
