package com.aio.hospitalsafety.controller;

import com.aio.hospitalsafety.common.SessionConstants;
import com.aio.hospitalsafety.dto.HospitalDto;
import com.aio.hospitalsafety.service.HospitalService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Controller;
import org.springframework.security.core.Authentication;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class HomeController {

    private static final String HOSPITAL_DOMAIN_COOKIE = "hospitalDomain";
    private static final int HOSPITAL_DOMAIN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

    private final HospitalService hospitalService;

    public HomeController(HospitalService hospitalService) {
        this.hospitalService = hospitalService;
    }

    @GetMapping("/")
    public String home(Authentication authentication) {
        // [2026.09.16] 고친 내용: 로그인된 사용자가 루트 주소를 새로고침해도 도메인 입력 화면으로 돌아가지 않게 합니다.
        if (authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN"))) {
            return "redirect:/admin";
        }

        if (authentication != null && authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_USER"))) {
            return "redirect:/dashboard";
        }

        // [2026.09.16] 고친 내용: 루트 주소는 저장된 도메인 쿠키와 관계없이 항상 병원 도메인 입력 화면을 표시합니다.
        return "html/auth/index";
    }

    // 기존 유형 선택 주소로 접근해도 공통 로그인 화면으로 이동합니다.
    @GetMapping("/role")
    public String roleSelection(HttpSession session) {
        // 병원 도메인을 먼저 확인합니다.
        if (session.getAttribute(SessionConstants.HOSPITAL_DOMAIN) == null) {
            return "redirect:/";
        }
        return "redirect:/login";
    }

    @PostMapping("/domain")
    public String selectHospital(@RequestParam(defaultValue = "") String hospitalDomain,
                                 HttpSession session,
                                 HttpServletResponse response,
                                 Model model) {
        session.removeAttribute(SessionConstants.HOSPITAL_DOMAIN);
        // [2026.09.16] 고친 내용: 새 도메인 확인을 시작하면 이전에 저장한 도메인 쿠키도 함께 비웁니다.
        clearHospitalDomainCookie(response);
        model.addAttribute("hospitalDomain", hospitalDomain);
        if (hospitalDomain.isBlank()) {
            model.addAttribute("domainError", "병원 도메인을 입력해 주세요.");
            return "html/auth/index";
        }
        try {
            HospitalDto hospital = hospitalService.findHospitalByDomain(hospitalDomain);
            if (hospital == null) {
                model.addAttribute("domainError", "등록되지 않은 병원 도메인입니다. 다시 확인해 주세요.");
                return "html/auth/index";
            }
            session.setAttribute(SessionConstants.HOSPITAL_DOMAIN, hospital.hospitalDomain());
            // [2026.09.16] 추가한 내용: 병원 도메인을 브라우저 쿠키에 저장해 새 세션에서도 도메인 입력을 반복하지 않게 합니다.
            saveHospitalDomainCookie(response, hospital.hospitalDomain());
            // 도메인 확인 후 공통 로그인 화면으로 바로 이동합니다.
            return "redirect:/login";
        } catch (DataAccessException exception) {
            model.addAttribute("domainError", "병원 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
            return "html/auth/index";
        }
    }

    @GetMapping("/login")
    public String login(HttpSession session,
                        HttpServletRequest request,
                        HttpServletResponse response,
                        Model model) {
        String hospitalDomain = (String) session.getAttribute(SessionConstants.HOSPITAL_DOMAIN);
        // [2026.09.16] 추가한 내용: 서버 재시작 뒤에는 저장된 병원 도메인 쿠키로 로그인 화면의 세션 정보를 복원합니다.
        if (hospitalDomain == null || hospitalDomain.isBlank()) {
            restoreHospitalDomainFromCookie(session, request);
            hospitalDomain = (String) session.getAttribute(SessionConstants.HOSPITAL_DOMAIN);
        }
        if (hospitalDomain == null || hospitalDomain.isBlank()) return "redirect:/";
        try {
            HospitalDto hospital = hospitalService.findHospitalByDomain(hospitalDomain);
            if (hospital != null) {
                model.addAttribute("hospitalName", hospital.hospitalName());
                model.addAttribute("hospitalId", hospital.hospitalDomain());
                return "html/auth/login";
            }
        } catch (DataAccessException exception) {
            model.addAttribute("domainError", "병원 정보를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.");
            return "html/auth/index";
        }
        session.removeAttribute(SessionConstants.HOSPITAL_DOMAIN);
        clearHospitalDomainCookie(response);
        return "redirect:/";
    }

    // [2026.09.16] 추가한 내용: 병원 구분용 도메인만 HttpOnly 쿠키로 보관하고 인증 정보는 저장하지 않습니다.
    private void saveHospitalDomainCookie(HttpServletResponse response, String hospitalDomain) {
        Cookie cookie = new Cookie(HOSPITAL_DOMAIN_COOKIE, hospitalDomain);
        cookie.setPath("/");
        cookie.setMaxAge(HOSPITAL_DOMAIN_COOKIE_MAX_AGE);
        cookie.setHttpOnly(true);
        response.addCookie(cookie);
    }

    private boolean restoreHospitalDomainFromCookie(
            HttpSession session,
            HttpServletRequest request
    ) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return false;
        }

        for (Cookie cookie : cookies) {
            if (HOSPITAL_DOMAIN_COOKIE.equals(cookie.getName())
                    && cookie.getValue() != null
                    && !cookie.getValue().isBlank()) {
                session.setAttribute(SessionConstants.HOSPITAL_DOMAIN, cookie.getValue());
                return true;
            }
        }

        return false;
    }

    private void clearHospitalDomainCookie(HttpServletResponse response) {
        Cookie cookie = new Cookie(HOSPITAL_DOMAIN_COOKIE, "");
        cookie.setPath("/");
        cookie.setMaxAge(0);
        cookie.setHttpOnly(true);
        response.addCookie(cookie);
    }
}
