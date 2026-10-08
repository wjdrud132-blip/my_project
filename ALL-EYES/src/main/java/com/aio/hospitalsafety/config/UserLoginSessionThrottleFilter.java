package com.aio.hospitalsafety.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 존재하지 않는 아이디를 5회 입력해 세션이 잠긴 경우,
 * 로그인 요청이 인증 단계까지 들어가지 않도록 차단한다.
 */
public class UserLoginSessionThrottleFilter
        extends OncePerRequestFilter {

    @Override
    protected boolean shouldNotFilter(
            HttpServletRequest request) {
        return !"POST".equalsIgnoreCase(request.getMethod())
                || !"/login/user".equals(
                        request.getServletPath()
                );
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        HttpSession session =
                request.getSession(false);

        long unlockAt =
                UserLoginSessionLimiter
                        .getLockedUntilEpochMillis(session);

        if (unlockAt > System.currentTimeMillis()) {
            response.sendRedirect(
                    request.getContextPath()
                            + "/login?error=locked&unlockAt="
                            + unlockAt
            );
            return;
        }

        filterChain.doFilter(request, response);
    }
}