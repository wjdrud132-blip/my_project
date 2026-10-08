package com.aio.hospitalsafety.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;

/**
 * 젯슨 엣지 장비 전용 보안 필터체인. /api/edge/** 만 담당한다.
 *
 * 기존 SecurityConfig 의 필터체인(직원 로그인, CSRF, 세션)은 그대로 두고 이 체인을 먼저 적용한다.
 * 기존 체인은 @Order 가 없어 가장 뒤에 선다.
 *
 * - CSRF: 젯슨은 브라우저가 아니라 토큰을 받을 수 없으므로 이 경로에서만 끈다.
 * - 세션: 요청마다 세션이 쌓이지 않도록 만들지 않는다.
 * - 인증: X-Edge-Key 헤더(EdgeApiKeyFilter). 키는 환경변수 EDGE_API_KEY 로 받는다.
 */
@Configuration
public class EdgeSecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain edgeFilterChain(
            HttpSecurity http,
            @Value("${edge.api-key:}") String apiKey) throws Exception {

        http
                .securityMatcher("/api/edge/**")
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .requestCache(cache -> cache.disable())
                .formLogin(form -> form.disable())
                .httpBasic(basic -> basic.disable())
                .logout(logout -> logout.disable())
                .addFilterBefore(
                        new EdgeApiKeyFilter(apiKey),
                        AnonymousAuthenticationFilter.class)
                .authorizeHttpRequests(auth -> auth
                        .anyRequest().hasAuthority(EdgeApiKeyFilter.ROLE));

        return http.build();
    }
}
