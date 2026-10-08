package com.aio.hospitalsafety.controller.admin;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.security.core.Authentication;

@Controller
public class AdminController {

    @GetMapping({"/admin", "/admin/"})
    public String adminHome(Authentication authentication, Model model) {
        String adminId = authentication == null ? "admin01" : authentication.getName();
        model.addAttribute("adminId", adminId);
        // [9.15] 추가내용: 기본 관리자 화면은 직원 관리 화면으로 표시한다.
        model.addAttribute("pageMode", "staff");
        return "html/admin/admin";
    }

    @GetMapping({"/admin/caregivers", "/admin/caregivers/"})
    public String adminCaregivers(Authentication authentication, Model model) {
        model.addAttribute("adminId", authentication == null ? "admin01" : authentication.getName());
        model.addAttribute("pageMode", "caregivers");
        return "html/admin/admin";
    }

    @GetMapping({"/admin/caregivers/inactive", "/admin/caregivers/inactive/"})
    public String adminInactiveCaregivers(Authentication authentication, Model model) {
        model.addAttribute("adminId", authentication == null ? "admin01" : authentication.getName());
        model.addAttribute("pageMode", "inactive-caregivers");
        return "html/admin/admin";
    }

    @GetMapping({"/admin/history", "/admin/history/"})
    public String adminHistory(Authentication authentication, Model model) {
        String adminId = authentication == null ? "admin01" : authentication.getName();
        model.addAttribute("adminId", adminId);
        // [9.15] 추가내용: 관리 이력은 직원 관리와 분리된 조회 전용 화면으로 표시한다.
        model.addAttribute("pageMode", "history");
        return "html/admin/admin";
    }

    @GetMapping({"/admin/caregivers/history", "/admin/caregivers/history/"})
    public String adminCaregiverHistory(Authentication authentication, Model model) {
        model.addAttribute("adminId", authentication == null ? "admin01" : authentication.getName());
        // [2026-09-22 추가] 간병인 계정 작업만 확인하는 별도 관리 이력 화면을 제공합니다.
        model.addAttribute("pageMode", "history-caregivers");
        return "html/admin/admin";
    }

    @GetMapping({"/admin/admin_de", "/admin/admin_de/"})
    public String adminDeactivatedUsers() {
        return "html/admin/admin-inactive-users";
    }

    @GetMapping({"/admin/records", "/admin/records/"})
    public String adminActionRecords(Authentication authentication, Model model) {
        // [2026.09.17] 고친 내용: 새로고침해도 관리자 공통 상단 바와 전체화면 전환 구조를 유지합니다.
        String adminId = authentication == null ? "admin01" : authentication.getName();
        model.addAttribute("adminId", adminId);
        model.addAttribute("pageMode", "records");
        return "html/admin/admin";
    }

    @GetMapping("/admin/records/content")
    public String adminActionRecordsContent(Model model) {
        // [2026.09.17] 추가한 내용: 관리자 화면 내부에 표시할 조치 이력 본문을 별도 주소로 제공합니다.
        model.addAttribute("adminRecordPage", true);
        return "html/record/record";
    }

    @GetMapping({"/admin/accidents", "/admin/accidents/"})
    public String adminAccidentRecords(Authentication authentication, Model model) {
        // [2026.09.29 변경] 사고 기록을 새로고침해도 관리자 공통 상단 메뉴와 내부 화면 전환을 유지합니다.
        model.addAttribute("adminId", authentication == null ? "admin01" : authentication.getName());
        model.addAttribute("pageMode", "accidents");
        return "html/admin/admin";
    }
}
