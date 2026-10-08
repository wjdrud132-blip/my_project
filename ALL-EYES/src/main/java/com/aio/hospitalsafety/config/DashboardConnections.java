package com.aio.hospitalsafety.config;

import com.aio.hospitalsafety.dto.WardOption;
import com.aio.hospitalsafety.mapper.UserMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.session.SessionInformation;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 대시보드 실시간 알림에 접속한 사람 명부.
 *
 * WebSocketInboundGuard 가 접속할 때 적고 끊길 때 지운다.
 * 구독할 때(WebSocketInboundGuard)와 알림을 보낼 때(WebSocketOutboundGuard) 모두
 * canReceive 로 "지금도 받을 자격이 있는지" 확인한다.
 */
@Component
public class DashboardConnections {

    private static final Logger log = LoggerFactory.getLogger(DashboardConnections.class);

    // 구독할 수 있는 주소 모양: /topic/wards/{병동ID}/events
    private static final Pattern WARD_TOPIC = Pattern.compile("^/topic/wards/(\\d+)/events$");

    /** 접속한 사람 한 명 */
    private record Connection(String httpSessionId, String hospitalId, String userId) {
    }

    private final SessionRegistry sessionRegistry;
    private final UserMapper userMapper;

    // 연결 번호 → 접속한 사람. 여러 요청이 동시에 쓰므로 ConcurrentHashMap 을 쓴다.
    private final Map<String, Connection> connections = new ConcurrentHashMap<>();

    public DashboardConnections(SessionRegistry sessionRegistry, UserMapper userMapper) {
        this.sessionRegistry = sessionRegistry;
        this.userMapper = userMapper;
    }

    public void add(String connectionId, String httpSessionId, String hospitalId, String userId) {
        connections.put(connectionId, new Connection(httpSessionId, hospitalId, userId));
    }

    public void remove(String connectionId) {
        connections.remove(connectionId);
    }

    /**
     * 이 연결이 이 주소의 알림을 받아도 되는지.
     * 1) 명부에 있고  2) 로그인 세션이 아직 살아 있고  3) 주소의 병동이 지금 담당 병동이어야 한다.
     */
    public boolean canReceive(String connectionId, String destination) {
        Connection connection = connectionId == null ? null : connections.get(connectionId);
        if (connection == null || destination == null) {
            return false;
        }

        // 2) 로그인 세션: 로그아웃·만료면 SessionRegistry 에 없고, 관리자가 비활성화·삭제하면 만료 표시가 된다.
        //    같은 브라우저로 다시 로그인해도 세션 ID 가 바뀌어 여기서 걸린다(그때는 다시 접속하면 된다).
        SessionInformation loginSession = sessionRegistry.getSessionInformation(connection.httpSessionId());
        if (loginSession == null || loginSession.isExpired()) {
            log.info("로그인 세션이 끝난 연결입니다. connection={}", connectionId);
            return false;
        }

        // 3) 담당 병동: DB 의 지금 값과 비교한다(관리자가 병동을 바꿨을 수 있다).
        Matcher matcher = WARD_TOPIC.matcher(destination);
        if (!matcher.matches()) {
            return false;
        }
        Long topicWardId = Long.valueOf(matcher.group(1));
        WardOption ward;
        try {
            ward = userMapper.findUserWard(connection.hospitalId(), connection.userId());
        } catch (RuntimeException exception) {
            // DB 조회가 실패하면 확인할 수 없으므로 받지 못하게 한다.
            // 그러면 알림 대신 ERROR 가 가서 연결이 끊기고, 대시보드가 다시 접속한다(조용히 안 오는 것보다 낫다).
            log.error("담당 병동 조회 실패 connection={}", connectionId, exception);
            return false;
        }
        if (ward == null || !topicWardId.equals(ward.wardId())) {
            log.info("담당 병동이 아닌 알림입니다. connection={} ward={}", connectionId, topicWardId);
            return false;
        }
        return true;
    }
}
