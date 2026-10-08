package com.aio.hospitalsafety.config;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageBuilder;
import org.springframework.stereotype.Component;

/**
 * 서버 → 브라우저 로 나가는 알림 검사.
 *
 * WebSocket 연결은 한 번 열리면 로그아웃·계정 비활성화·병동 변경이 있어도 저절로 끊기지 않는다.
 * 그래서 알림을 보내기 직전마다 "지금도 받을 자격이 있는지" 다시 확인한다(DashboardConnections).
 *
 * 자격이 없으면 알림 대신 ERROR 를 보내고 연결을 끊는다.
 * 조용히 버리기만 하면 화면은 연결된 것처럼 보이는데 알림이 안 오는 가장 나쁜 상태가 된다.
 * 연결이 끊기면 대시보드가 다시 접속하고, 그때 지금 로그인·병동 기준으로 다시 검사된다.
 */
@Component
public class WebSocketOutboundGuard implements ChannelInterceptor {

    private final DashboardConnections connections;

    public WebSocketOutboundGuard(DashboardConnections connections) {
        this.connections = connections;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor = StompHeaderAccessor.wrap(message);
        if (accessor.getMessageType() != SimpMessageType.MESSAGE) {
            // 접속 응답(CONNECTED), 오류(ERROR) 등 알림이 아닌 것
            return message;
        }

        String connectionId = accessor.getSessionId();
        if (connections.canReceive(connectionId, accessor.getDestination())) {
            return message;
        }

        connections.remove(connectionId);
        return errorMessage(connectionId, "로그인이 끝났거나 담당 병동이 바뀌었습니다. 다시 접속해 주세요.");
    }

    /** 이 연결에 보낼 STOMP ERROR (보내고 나면 연결이 끊긴다) */
    private Message<byte[]> errorMessage(String connectionId, String text) {
        StompHeaderAccessor error = StompHeaderAccessor.create(StompCommand.ERROR);
        error.setMessage(text);
        error.setSessionId(connectionId);
        return MessageBuilder.createMessage(new byte[0], error.getMessageHeaders());
    }
}
