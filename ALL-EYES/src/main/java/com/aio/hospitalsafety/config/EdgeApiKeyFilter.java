package com.aio.hospitalsafety.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * 젯슨 요청의 X-Edge-Key 헤더를 서버 설정의 장치 키와 비교한다.
 *
 * 키가 설정되지 않았거나 다르면 401 JSON으로 거절한다. 비교는 시간 차이로 키가 새지 않도록
 * MessageDigest.isEqual 로 한다. 키 원문은 로그에 남기지 않는다.
 */
public class EdgeApiKeyFilter extends OncePerRequestFilter {

    public static final String HEADER = "X-Edge-Key";
    public static final String ROLE = "ROLE_EDGE";

    private final byte[] expectedKey;

    public EdgeApiKeyFilter(String apiKey) {
        this.expectedKey = apiKey == null ? new byte[0] : apiKey.getBytes(StandardCharsets.UTF_8);
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        String key = request.getHeader(HEADER);

        boolean configured = expectedKey.length > 0;
        boolean matches = configured
                && key != null
                && MessageDigest.isEqual(expectedKey, key.getBytes(StandardCharsets.UTF_8));

        if (!matches) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"message\":\"장치 인증에 실패했습니다.\"}");
            return;
        }

        // 어느 장치인지는 요청 본문의 장치 이름(deviceName)으로 찾는다(EdgeService). 여기서는 키가 맞는지만 본다.
        var authentication = new UsernamePasswordAuthenticationToken(
                "edge",
                null,
                AuthorityUtils.createAuthorityList(ROLE)
        );
        SecurityContextHolder.getContext().setAuthentication(authentication);

        filterChain.doFilter(request, response);
    }
}
