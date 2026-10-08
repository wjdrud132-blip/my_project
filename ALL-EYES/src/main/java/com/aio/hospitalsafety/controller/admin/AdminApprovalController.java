package com.aio.hospitalsafety.controller.admin;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import com.aio.hospitalsafety.domain.UserJobType;

import com.aio.hospitalsafety.common.SessionConstants;
import com.aio.hospitalsafety.dto.UserDto;
import com.aio.hospitalsafety.service.admin.AdminService;

import jakarta.servlet.http.HttpSession;

@RestController
@RequestMapping("/api/admin/users")
public class AdminApprovalController {

    private final AdminService adminService;

    public AdminApprovalController(
            AdminService adminService
    ) {
        this.adminService = adminService;
    }

    // 가입 신청 및 승인 완료 사용자 목록 조회
    @GetMapping
    public ResponseEntity<List<UserDto>> findUsers(
            @RequestParam(defaultValue = "GENERAL") UserJobType jobType,
            HttpSession session
    ) {
        String hospitalDomain =
                findHospitalDomain(session);

        if (hospitalDomain == null) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .build();
        }

        return ResponseEntity.ok(
                adminService.findUsers(hospitalDomain, jobType.name())
        );
    }

    // 사용자 가입 승인
    @PatchMapping("/{userId}/approve")
    public ResponseEntity<Void> approveUser(
            @PathVariable String userId,
            HttpSession session
    ) {
        String hospitalDomain =
                findHospitalDomain(session);

        if (hospitalDomain == null) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .build();
        }

        boolean approved =
                adminService.approveUser(
                        hospitalDomain,
                        userId
                );

        if (!approved) {
            return ResponseEntity
                    .status(HttpStatus.CONFLICT)
                    .build();
        }

        return ResponseEntity.noContent().build();
    }

    // 사용자 가입 반려
    @DeleteMapping("/{userId}/reject")
    public ResponseEntity<Void> rejectUser(
            @PathVariable String userId,
            HttpSession session
    ) {
        String hospitalDomain =
                findHospitalDomain(session);

        if (hospitalDomain == null) {
            return ResponseEntity
                    .status(HttpStatus.UNAUTHORIZED)
                    .build();
        }

        boolean rejected =
                adminService.rejectUser(
                        hospitalDomain,
                        userId
                );

        if (!rejected) {
            return ResponseEntity
                    .status(HttpStatus.CONFLICT)
                    .build();
        }

        return ResponseEntity.noContent().build();
    }

    private String findHospitalDomain(
            HttpSession session
    ) {
        Object hospitalDomain =
                session.getAttribute(
                        SessionConstants.HOSPITAL_DOMAIN
                );

        if (!(hospitalDomain instanceof String value)
                || value.isBlank()) {
            return null;
        }

        return value;
    }
}
