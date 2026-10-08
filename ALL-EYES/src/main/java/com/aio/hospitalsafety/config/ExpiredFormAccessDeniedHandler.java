package com.aio.hospitalsafety.config;

import java.io.IOException;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.access.AccessDeniedHandlerImpl;
import org.springframework.security.web.csrf.CsrfException;

import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * [2026.09.27] 보안 토큰(CSRF)이 오래된 폼 요청을 처음 화면으로 보낸다.
 *
 * 화면을 오래 열어 두었거나 서버가 다시 켜진 뒤(세션이 사라짐) 도메인 입력·로그인·로그아웃을 누르면
 * 토큰이 맞지 않아 403 오류 화면이 떴다. 이런 화면 요청은 처음 화면("/")으로 보내 다시 시작하게 한다.
 *
 * 바꾸지 않는 것
 * - API(/api/**) 요청: 지금처럼 403 을 돌려준다. 화면 JS 가 "새로 고친 뒤 다시" 안내를 띄운다.
 * - CSRF 가 아닌 권한 부족(예: 간호사가 관리자 주소를 연 경우): 지금처럼 403 이다.
 */
public class ExpiredFormAccessDeniedHandler implements AccessDeniedHandler {

    private final AccessDeniedHandler defaultHandler = new AccessDeniedHandlerImpl();

    @Override
    public void handle(
            HttpServletRequest request,
            HttpServletResponse response,
            AccessDeniedException exception
    ) throws IOException, ServletException {
        boolean apiRequest = request.getRequestURI().startsWith(request.getContextPath() + "/api/");
        if (exception instanceof CsrfException && !apiRequest) {
            response.sendRedirect(request.getContextPath() + "/");
            return;
        }
        defaultHandler.handle(request, response, exception);
    }
}
