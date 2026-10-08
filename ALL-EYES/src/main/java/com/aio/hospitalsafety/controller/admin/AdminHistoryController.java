package com.aio.hospitalsafety.controller.admin;

import com.aio.hospitalsafety.config.HospitalUserDetails;
import com.aio.hospitalsafety.dto.admin.AdminHistoryResponse;
import com.aio.hospitalsafety.service.admin.AdminHistoryService;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * 관리자 감사 로그 조회 API를 제공한다.
 */
@RestController
@RequestMapping("/api/admin/account-audit-logs")
public class AdminHistoryController {

    private final AdminHistoryService adminHistoryService;

    public AdminHistoryController(
            AdminHistoryService adminHistoryService
    ) {
        this.adminHistoryService = adminHistoryService;
    }

    /**
     * 현재 로그인한 관리자의 병원 감사 로그를 최신순으로 조회한다.
     *
     * 요청 예시:
     * GET /api/admin/account-audit-logs?limit=50
     */
    @GetMapping
    public ResponseEntity<List<AdminHistoryResponse>> getRecentHistories(
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            @RequestParam(defaultValue = "50") Integer limit
    ) {
        HospitalUserDetails admin = requireAdmin(loginAdmin);

        List<AdminHistoryResponse> histories =
                adminHistoryService.getRecentHistories(
                        admin.getHospitalId(),
                        limit
                );

        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(histories);
    }

    /**
     * 현재 로그인 계정이 관리자인지 확인한다.
     */
    private HospitalUserDetails requireAdmin(
            HospitalUserDetails loginAdmin
    ) {
        if (loginAdmin == null) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "관리자 로그인 정보가 없습니다."
            );
        }

        boolean isAdmin = loginAdmin.getAuthorities()
                .stream()
                .anyMatch(authority ->
                        "ROLE_ADMIN".equals(
                                authority.getAuthority()
                        )
                );

        if (!isAdmin) {
            throw new AccessDeniedException(
                    "병원 관리자만 감사 로그를 조회할 수 있습니다."
            );
        }

        return loginAdmin;
    }
}