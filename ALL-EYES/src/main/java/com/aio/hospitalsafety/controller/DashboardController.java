package com.aio.hospitalsafety.controller;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class DashboardController {

    private final com.aio.hospitalsafety.mapper.UserMapper userMapper;

    public DashboardController(com.aio.hospitalsafety.mapper.UserMapper userMapper) {
        this.userMapper = userMapper;
    }

    public record DashboardWard(Long wardId, String wardName, int wardNumber) {}

    private DashboardWard currentWard(Authentication authentication) {
        var user = (com.aio.hospitalsafety.config.HospitalUserDetails) authentication.getPrincipal();
        var ward = userMapper.findUserWard(user.getHospitalId(), user.getUsername());
        if (ward == null || ward.wardName() == null) {
            return new DashboardWard(null, "병동 미배정", 0);
        }
        var match = java.util.regex.Pattern.compile("^([123])\\s*병동$")
                .matcher(ward.wardName().trim());
        int number = match.matches() ? Integer.parseInt(match.group(1)) : 0;
        return new DashboardWard(ward.wardId(), ward.wardName(), number);
    }

    private String wardDashboard(Authentication authentication, Model model) {
        DashboardWard ward = currentWard(authentication);
        model.addAttribute("dashboardWard", ward);
        return switch (ward.wardNumber()) {
            case 1 -> "html/dashboard/dashboard-ward1";
            case 2 -> "html/dashboard/dashboard-ward2";
            default -> "html/dashboard/dashboard";
        };
    }

    // [수정완료] 대시보드와 설정 화면에 현재 로그인에서 입력한 이름을 전달합니다.
    @org.springframework.web.bind.annotation.ModelAttribute("displayName")
    public String displayName(jakarta.servlet.http.HttpSession session) {
        Object name = session.getAttribute(com.aio.hospitalsafety.config.UserDisplaySession.DISPLAY_NAME);
        return name instanceof String && !((String) name).isBlank() ? (String) name : "이름 미입력";
    }

    @GetMapping("/dashboard")
    public String dashboard(Authentication authentication, Model model, HttpServletResponse response) {

        boolean admin = authentication.getAuthorities().stream()
                .anyMatch(authority ->
                        authority.getAuthority().equals("ROLE_ADMIN"));

        // 관리자는 관리자 페이지로 이동
        if (admin) {
            return "redirect:/admin";
        }

        response.setHeader("Cache-Control", "no-store");

        boolean approved = authentication.getAuthorities().stream()
                .anyMatch(authority ->
                        authority.getAuthority().equals("STATUS_APPROVED"));

        model.addAttribute("userId", authentication.getName());
        model.addAttribute("approved", approved);

        // [09.13]수정내용: 이동한 대시보드 HTML 경로를 반환하도록 경로를 갱신했습니다.
        return wardDashboard(authentication, model);
    }

    @GetMapping("/Record")
    public String record(Authentication authentication, Model model, HttpServletResponse response) {
        boolean admin = authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("ROLE_ADMIN"));
        if (admin) {
            return "redirect:/admin";
        }
        // [2026.09.17] 추가한 내용: 새로고침해도 간호사 대시보드 공통 상단 바 안에서 조치 이력을 표시합니다.
        response.setHeader("Cache-Control", "no-store");
        boolean approved = authentication.getAuthorities().stream()
                .anyMatch(authority -> authority.getAuthority().equals("STATUS_APPROVED"));
        model.addAttribute("userId", authentication.getName());
        model.addAttribute("approved", approved);
        model.addAttribute("recordMode", "records");
        return wardDashboard(authentication, model);
    }

    // 대시보드를 열어 둔 동안의 요청으로 기존 인증 세션의 유휴 시간을 갱신합니다.
    @GetMapping("/api/dashboard/session")
    public ResponseEntity<DashboardWard> keepDashboardSession(Authentication authentication) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(currentWard(authentication));
    }

    // [수정완료] 대시보드 메뉴에서 설정 HTML 화면으로 연결합니다.
    @GetMapping("/settings")
    public String settings(Authentication authentication, @RequestParam(defaultValue = "all") String filter, Model model) {
        model.addAttribute("filter", filter);
        model.addAttribute("userId", authentication == null ? "사용자" : authentication.getName());
        // [09.13]수정내용: 설정 화면을 settings 폴더의 화면 파일로 연결합니다.
        return "html/settings/settings";
    }
}
