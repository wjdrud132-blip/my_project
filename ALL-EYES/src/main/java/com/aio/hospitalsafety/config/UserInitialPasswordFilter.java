package com.aio.hospitalsafety.config;

import com.aio.hospitalsafety.service.UserService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 임시 비밀번호를 사용하는 직원이 비밀번호를 변경하기 전까지
 * 다른 업무 화면과 API에 접근하지 못하도록 제한한다.
 */
public class UserInitialPasswordFilter extends OncePerRequestFilter {
    private final UserService userService;

    public UserInitialPasswordFilter(UserService userService) {
        this.userService = userService;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {
        String path = request.getServletPath();

        var authentication = SecurityContextHolder
                .getContext()
                .getAuthentication();

        if (authentication == null
                || !(authentication.getPrincipal()
                instanceof HospitalUserDetails loginUser)
                || authentication.getAuthorities()
                .stream()
                .noneMatch(authority ->
                        "ROLE_USER".equals(
                                authority.getAuthority()))
                || path.startsWith("/css/")
                || path.startsWith("/JS/")
                || path.startsWith("/image/")
                || "/favicon.ico".equals(path)
                || "/error".equals(path)) {
            filterChain.doFilter(request, response);
            return;
        }

        boolean mustChangePassword =
                userService.isInitialUserPassword(
                        loginUser.getHospitalId(),
                        loginUser.getUsername()
                );

        if (!mustChangePassword) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setHeader("Cache-Control", "no-store");

        boolean passwordPage =
                "GET".equals(request.getMethod())
                && "/user/password".equals(path);

        boolean passwordRequest =
                "POST".equals(request.getMethod())
                && (
                    "/user/password".equals(path)
                    || "/user/password/verify".equals(path)
                    || "/logout".equals(path)
                );

        if (passwordPage || passwordRequest) {
            filterChain.doFilter(request, response);
            return;
        }

        if (path.startsWith("/api/")
                || !"GET".equals(request.getMethod())) {
            response.setStatus(
                    HttpServletResponse.SC_FORBIDDEN
            );
            response.setContentType(
                    "application/json;charset=UTF-8"
            );
            response.getWriter().write(
                    "{\"code\":\"INITIAL_PASSWORD_CHANGE_REQUIRED\","
                    + "\"message\":\"임시 비밀번호를 변경한 후 이용해 주세요.\"}"
            );
            return;
        }

        response.sendRedirect(
                request.getContextPath() + "/user/password"
        );
    }
}