package com.aio.hospitalsafety.config;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageDeliveryException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

import java.util.Map;

/**
 * 브라우저 → 서버 로 들어오는 WebSocket 메시지 검사.
 *
 * 대시보드는 "접속해서 구독하고 받기만" 한다. 그래서 아래 네 가지만 허락하고 나머지는 모두 막는다.
 * (SEND 같은 것을 허락하면 브라우저가 가짜 알림을 다른 간호사 화면에 띄울 수 있다)
 *
 *   CONNECT     접속: 로그인한 직원이면 명부(DashboardConnections)에 적는다.
 *   SUBSCRIBE   구독 신청: 로그인 중이고 자기 병동 주소일 때만 허락한다.
 *   UNSUBSCRIBE 구독 취소: 그대로 허락한다.
 *   DISCONNECT  연결 끊김: 명부에서 지운다.
 */
@Component
public class WebSocketInboundGuard implements ChannelInterceptor {

    private final DashboardConnections connections;

    public WebSocketInboundGuard(DashboardConnections connections) {
        this.connections = connections;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        StompCommand command = accessor.getCommand();
        String connectionId = accessor.getSessionId();

        if (command == null) {
            // 연결 유지용 신호(heartbeat) 등 명령이 없는 것
            return message;
        }

        switch (command) {
            case CONNECT -> addLoginUser(connectionId, accessor);
            case SUBSCRIBE -> {
                if (!connections.canReceive(connectionId, accessor.getDestination())) {
                    throw new MessageDeliveryException("로그인한 직원이 담당 병동 알림만 구독할 수 있습니다.");
                }
            }
            case UNSUBSCRIBE -> {
                // 허락
            }
            case DISCONNECT -> connections.remove(connectionId);
            default -> throw new MessageDeliveryException("지원하지 않는 메시지입니다 (" + command + ")");
        }
        return message;
    }

    /** 접속한 사람이 로그인한 직원이면 명부에 적는다. 아니면 접속을 거절한다. */
    private void addLoginUser(String connectionId, StompHeaderAccessor accessor) {
        // 로그인 세션 ID 는 접속할 때 HttpSessionHandshakeInterceptor(WebSocketConfig)가 넣어 준다.
        Map<String, Object> attributes = accessor.getSessionAttributes();
        Object httpSessionId = attributes == null
                ? null
                : attributes.get(HttpSessionHandshakeInterceptor.HTTP_SESSION_ID_ATTR_NAME);

        if (httpSessionId != null
                && accessor.getUser() instanceof Authentication authentication
                && authentication.getPrincipal() instanceof HospitalUserDetails loginUser) {
            connections.add(connectionId, httpSessionId.toString(), loginUser.getHospitalId(), loginUser.getUsername());
            return;
        }
        throw new MessageDeliveryException("로그인한 직원만 접속할 수 있습니다.");
    }
}
