// PGH
package com.aio.hospitalsafety.config;

import com.aio.hospitalsafety.domain.User;
import com.aio.hospitalsafety.mapper.UserMapper;
import com.aio.hospitalsafety.service.UserService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.authentication.LockedException;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.session.SessionRegistry;
import org.springframework.security.core.session.SessionRegistryImpl;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.SimpleUrlAuthenticationFailureHandler;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.session.HttpSessionEventPublisher;

@Configuration
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            SessionRegistry sessionRegistry,
            UserService userService) throws Exception {

        http
                .authorizeHttpRequests(auth -> auth
                        .requestMatchers(
                                "/",
                                "/domain",
                                "/role",
                                "/login",
                                "/login/user",
                                "/css/**",
                                "/JS/**",
                                "/image/**",
                                "/error"
                        ).permitAll()
                        .requestMatchers(
                                "/admin/**",
                                "/api/admin/**"
                        ).hasRole("ADMIN")
                        .requestMatchers("/api/dashboard/session").hasRole("USER")
                        .anyRequest().authenticated()
                )
                .formLogin(form -> form
                        .loginPage("/login")
                        .loginProcessingUrl("/login/user")
                        .usernameParameter("userLoginKey")

                        .successHandler((
                                request,
                                response,
                                authentication) -> {

                            HospitalUserDetails loginUser =
                                    authentication.getPrincipal()
                                            instanceof HospitalUserDetails details
                                            ? details
                                            : null;

                            /*
                             * 정상 로그인에 성공하면 계정 실패 횟수와
                             * 존재하지 않는 아이디의 세션 실패 횟수를
                             * 모두 초기화한다.
                             */
                            if (loginUser != null) {
                                userService.resetFailedLogin(
                                        loginUser.getHospitalId(),
                                        loginUser.getUsername()
                                );
                            }

                            UserLoginSessionLimiter.reset(
                                    request.getSession(false)
                            );

                            String displayName =
                                    loginUser != null
                                            ? loginUser.getUserName()
                                            : authentication.getName();

                            displayName =
                                    displayName == null
                                            || displayName.isBlank()
                                            ? authentication.getName()
                                            : displayName.strip();

                            request.getSession().setAttribute(
                                    UserDisplaySession.DISPLAY_NAME,
                                    displayName.substring(
                                            0,
                                            Math.min(
                                                    displayName.length(),
                                                    50
                                            )
                                    )
                            );

                            request.getSession().setAttribute(
                                    UserDisplaySession.LOGIN_TIME,
                                    java.time.ZonedDateTime.now(
                                            java.time.ZoneId.of(
                                                    "Asia/Seoul"
                                            )
                                    ).format(
                                            java.time.format
                                                    .DateTimeFormatter
                                                    .ofPattern(
                                                            "yyyy-MM-dd HH:mm:ss"
                                                    )
                                    )
                            );

                            boolean initialUserPassword =
                                    loginUser != null
                                    && authentication.getAuthorities()
                                            .stream()
                                            .anyMatch(authority ->
                                                    "ROLE_USER".equals(
                                                            authority
                                                                    .getAuthority()
                                                    )
                                            )
                                    && userService.isInitialUserPassword(
                                            loginUser.getHospitalId(),
                                            loginUser.getUsername()
                                    );

                            response.sendRedirect(
                                    request.getContextPath()
                                            + (
                                                initialUserPassword
                                                    ? "/user/password"
                                                    : "/dashboard"
                                            )
                            );
                        })

                        .failureHandler((
                                request,
                                response,
                                exception) -> {

                            String[] loginKeyParts =
                                    parseUserLoginKey(
                                            request.getParameter(
                                                    "userLoginKey"
                                            )
                                    );

                            String error;
                            long unlockAt = 0L;

                            /*
                             * 존재하지 않는 아이디는 특정 계정을 잠글 수
                             * 없으므로 현재 브라우저 세션에 실패 횟수를
                             * 누적한다.
                             */
                            if (exception
                                    instanceof UsernameNotFoundException) {

                                unlockAt =
                                        UserLoginSessionLimiter
                                                .registerUnknownUserFailure(
                                                        request.getSession(true)
                                                );

                                error = unlockAt > 0
                                        ? "locked"
                                        : "credentials";

                            /*
                             * 존재하는 계정에서 비밀번호가 틀렸다면
                             * TB_EMP의 실패 횟수를 증가시킨다.
                             */
                            } else if (exception
                                    instanceof BadCredentialsException) {

                                if (loginKeyParts != null) {
                                    unlockAt =
                                            userService.registerFailedLogin(
                                                    loginKeyParts[0],
                                                    loginKeyParts[1]
                                            );
                                }

                                error = unlockAt > 0
                                        ? "locked"
                                        : "credentials";

                            /*
                             * 이미 잠긴 계정으로 로그인한 경우 DB에 저장된
                             * 잠금 종료 시각을 화면으로 전달한다.
                             */
                            } else if (exception
                                    instanceof LockedException) {

                                if (loginKeyParts != null) {
                                    unlockAt =
                                            userService
                                                    .getLockedUntilEpochMillis(
                                                            loginKeyParts[0],
                                                            loginKeyParts[1]
                                                    );
                                }

                                error = "locked";

                            } else if (exception
                                    instanceof DisabledException) {
                                error = "disabled";

                            } else {
                                error = "unavailable";
                            }

                            String failureUrl =
                                    "/login?error=" + error;

                            if ("locked".equals(error)) {
                                if (unlockAt
                                        <= System.currentTimeMillis()) {
                                    unlockAt =
                                            System.currentTimeMillis()
                                                    + 1000L;
                                }

                                failureUrl +=
                                        "&unlockAt=" + unlockAt;
                            }

                            new SimpleUrlAuthenticationFailureHandler(
                                    failureUrl
                            ).onAuthenticationFailure(
                                    request,
                                    response,
                                    exception
                            );
                        })
                        .permitAll()
                )
                .logout(logout -> logout
                        .logoutSuccessHandler((
                                request,
                                response,
                                authentication) -> {

                            var oldSession =
                                    request.getSession(false);

                            String hospitalDomain =
                                    oldSession == null
                                            ? null
                                            : (String) oldSession.getAttribute(
                                                    com.aio.hospitalsafety
                                                            .common
                                                            .SessionConstants
                                                            .HOSPITAL_DOMAIN
                                            );

                            if (oldSession != null) {
                                oldSession.invalidate();
                            }

                            if (hospitalDomain != null
                                    && !hospitalDomain.isBlank()) {

                                request.getSession(true).setAttribute(
                                        com.aio.hospitalsafety
                                                .common
                                                .SessionConstants
                                                .HOSPITAL_DOMAIN,
                                        hospitalDomain
                                );

                                response.sendRedirect(
                                        request.getContextPath()
                                                + "/login"
                                );
                                return;
                            }

                            response.sendRedirect(
                                    request.getContextPath() + "/"
                            );
                        })
                        .invalidateHttpSession(false)
                        .clearAuthentication(true)
                )
                // [2026.09.27] 보안 토큰이 오래된 폼(서버 재시작 뒤 로그인·로그아웃 등)은 403 대신 처음 화면으로 보낸다.
                .exceptionHandling(exceptions -> exceptions
                        .accessDeniedHandler(new ExpiredFormAccessDeniedHandler())
                )
                .sessionManagement(session -> session
                        .maximumSessions(-1)
                        .expiredUrl("/")
                        .sessionRegistry(sessionRegistry)
                );

        /*
         * 세션이 잠긴 상태에서는 올바른 계정을 입력하더라도
         * 인증 처리 전에 로그인 요청을 차단한다.
         */
        http.addFilterBefore(
                new UserLoginSessionThrottleFilter(),
                UsernamePasswordAuthenticationFilter.class
        );
        // [2026.09.17] 추가한 내용: 관리자 문서 안에서 같은 사이트의 조치 이력 화면을 표시해도 전체화면이 유지되게 합니다.
        http.headers(headers -> headers.frameOptions(frameOptions -> frameOptions.sameOrigin()));

        http.addFilterAfter(
                new UserInitialPasswordFilter(userService),
                org.springframework.security.web
                        .access
                        .intercept
                        .AuthorizationFilter.class
        );

        return http.build();
    }

    @Bean
    UserDetailsService userDetailsService(
            UserMapper userMapper) {

        return userLoginKey -> {
            String[] parts =
                    userLoginKey.split("\\|", 2);

            if (parts.length != 2
                    || parts[0].isBlank()
                    || parts[1].isBlank()) {
                throw new UsernameNotFoundException(
                        "로그인 형식이 올바르지 않습니다."
                );
            }

            String hospitalId =
                    parts[0].trim();

            String userId =
                    parts[1].trim();

            if (hospitalId.length() > 30
                    || userId.length() > 20) {
                throw new UsernameNotFoundException(
                        "로그인 입력 길이가 올바르지 않습니다."
                );
            }

            User user =
                    userMapper.findByHospitalIdAndUserId(
                            hospitalId,
                            userId
                    ).orElseThrow(() ->
                            new UsernameNotFoundException(
                                    "사용자를 찾을 수 없습니다."
                            )
                    );

            return new HospitalUserDetails(user);
        };
    }

    @Bean
    DaoAuthenticationProvider userAuthenticationProvider(
            UserDetailsService userDetailsService,
            PasswordEncoder passwordEncoder) {

        DaoAuthenticationProvider provider =
                new DaoAuthenticationProvider(
                        userDetailsService
                );

        provider.setPasswordEncoder(passwordEncoder);

        /*
         * 내부에서는 존재하지 않는 아이디와 잘못된 비밀번호를
         * 구분하되, 화면에는 같은 문구를 표시한다.
         */
        provider.setHideUserNotFoundExceptions(false);

        return provider;
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    SessionRegistry sessionRegistry() {
        return new SessionRegistryImpl();
    }

    @Bean
    HttpSessionEventPublisher httpSessionEventPublisher() {
        return new HttpSessionEventPublisher();
    }

    /**
     * hidden input에 들어 있는 "병원ID|직원ID" 값을 분리한다.
     */
    private static String[] parseUserLoginKey(
            String userLoginKey) {

        if (userLoginKey == null
                || userLoginKey.isBlank()) {
            return null;
        }

        String[] parts =
                userLoginKey.split("\\|", 2);

        if (parts.length != 2
                || parts[0].isBlank()
                || parts[1].isBlank()) {
            return null;
        }

        return new String[]{
                parts[0].trim(),
                parts[1].trim()
        };
    }
}
