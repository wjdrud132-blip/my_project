package com.aio.hospitalsafety.config;

import java.util.Arrays;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.server.support.HttpSessionHandshakeInterceptor;

/**
 * 대시보드 실시간 알림(STOMP over WebSocket) 설정.
 *
 * - 접속 주소: /ws (로그인한 브라우저 세션으로 접속한다. 같은 사이트에서만 허용)
 * - 구독 주소: /topic/wards/{병동ID}/events
 * - 검사
 *   브라우저 → 서버: WebSocketInboundGuard  (접속·구독·구독 취소·끊기만 허락)
 *   서버 → 브라우저: WebSocketOutboundGuard (알림마다 로그인·담당 병동 재확인)
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final WebSocketInboundGuard inboundGuard;
    private final WebSocketOutboundGuard outboundGuard;
    private final String[] allowedOrigins;

    public WebSocketConfig(WebSocketInboundGuard inboundGuard, WebSocketOutboundGuard outboundGuard,
                           @Value("${app.websocket.allowed-origins:}") String allowedOrigins) {
        this.inboundGuard = inboundGuard;
        this.outboundGuard = outboundGuard;
        // "https://a.kr, https://b.kr" → ["https://a.kr", "https://b.kr"] (빈 칸은 뺀다)
        this.allowedOrigins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .toArray(String[]::new);
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        // HttpSessionHandshakeInterceptor: 접속할 때 로그인 세션 ID 를 연결 정보에 넣어 준다.
        var endpoint = registry.addEndpoint("/ws")
                .addInterceptors(new HttpSessionHandshakeInterceptor());
        // [2026.09.27] 배포 서버(https://allinone.xos.kr)는 Apache 가 https 를 받아 이 서버로 넘긴다.
        // 그러면 브라우저 주소(https)와 서버가 보는 주소(http)가 달라 '같은 사이트' 검사에서 접속이 거절(403)될 수 있다.
        // 환경변수 WS_ALLOWED_ORIGINS 에 주소를 적으면 그 주소에서 온 접속도 허락한다. 비워 두면 지금처럼 같은 사이트만.
        if (allowedOrigins.length > 0) {
            endpoint.setAllowedOrigins(allowedOrigins);
        }
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 서버 → 브라우저 알림만 쓴다. 브라우저가 보내는 메시지(SEND)는 받지 않는다(WebSocketInboundGuard).
        registry.enableSimpleBroker("/topic");
    }

    /** 브라우저 → 서버 메시지 검사 */
    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(inboundGuard);
    }

    /** 서버 → 브라우저 알림 검사 */
    @Override
    public void configureClientOutboundChannel(ChannelRegistration registration) {
        registration.interceptors(outboundGuard);
    }
}
