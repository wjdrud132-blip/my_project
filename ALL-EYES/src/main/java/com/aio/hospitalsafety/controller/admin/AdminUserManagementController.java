package com.aio.hospitalsafety.controller.admin;

import java.util.List;
import java.util.Map;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.aio.hospitalsafety.common.SessionConstants;
import com.aio.hospitalsafety.config.HospitalUserDetails;
import com.aio.hospitalsafety.dto.WardOption;
import com.aio.hospitalsafety.domain.UserJobType;
import com.aio.hospitalsafety.dto.admin.ApprovedUserResponse;
import com.aio.hospitalsafety.dto.admin.ChangeCaregiverRoomRequest;
import com.aio.hospitalsafety.dto.admin.ChangeUserPhoneRequest;
import com.aio.hospitalsafety.dto.admin.ChangeUserWardRequest;
import com.aio.hospitalsafety.dto.admin.InactiveUserResponse;
import com.aio.hospitalsafety.dto.admin.ResetUserPasswordResponse;
import com.aio.hospitalsafety.exception.UserNotFoundException;
import com.aio.hospitalsafety.service.UserSessionService;
import com.aio.hospitalsafety.service.admin.AdminPasswordService;
import com.aio.hospitalsafety.service.admin.AdminUserManagementService;

import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/admin")
public class AdminUserManagementController {

    private final AdminUserManagementService adminUserManagementService;
    private final AdminPasswordService adminPasswordService;
    private final UserSessionService userSessionService;

    public AdminUserManagementController(
            AdminUserManagementService adminUserManagementService,
            AdminPasswordService adminPasswordService,
            UserSessionService userSessionService
    ) {
        this.adminUserManagementService = adminUserManagementService;
        this.adminPasswordService = adminPasswordService;
        this.userSessionService = userSessionService;
    }

    // 승인 완료 사용자 목록 조회
    @GetMapping("/users/approved")
    public List<ApprovedUserResponse> getApprovedUsers(
            @RequestParam(defaultValue = "") String keyword,
            @RequestParam(defaultValue = "GENERAL") UserJobType jobType,
            HttpSession session
    ) {
        String hospitalDomain = requireHospitalDomain(session);

        return adminUserManagementService.getApprovedUsers(
                hospitalDomain,
                keyword,
                jobType.name()
        );
    }

    // 현재 병원의 병동 목록 조회
    @GetMapping("/wards")
    public List<WardOption> getWards(HttpSession session) {
        String hospitalDomain = requireHospitalDomain(session);

        return adminUserManagementService.getWards(hospitalDomain);
    }

    // 승인 완료 사용자의 담당 병동 변경
    @PatchMapping("/users/{userId}/ward")
    public ResponseEntity<Map<String, String>> changeUserWard(
            @PathVariable("userId") String userId,
            @Valid @RequestBody ChangeUserWardRequest request,
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            HttpSession session
    ) {
        String hospitalDomain = requireHospitalDomain(session);
        String adminId = requireAdminId(loginAdmin);

        try {
            adminUserManagementService.changeUserWard(
                    hospitalDomain,
                    adminId,
                    userId,
                    request.wardId(),
                    request.roomNumbers()
            );

            return ResponseEntity.ok(
                    Map.of(
                            "message",
                            "담당 병동이 변경되었습니다."
                    )
            );
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(
                    Map.of(
                            "message",
                            exception.getMessage()
                    )
            );
        }
    }

    // [2026.09.27] 간병인 담당 병실 변경 (확정 낙상 SMS 를 받을 간병인이 바뀐다)
    @PatchMapping("/users/{userId}/room")
    public ResponseEntity<Map<String, String>> changeCaregiverRoom(
            @PathVariable("userId") String userId,
            @Valid @RequestBody ChangeCaregiverRoomRequest request,
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            HttpSession session
    ) {
        String hospitalDomain = requireHospitalDomain(session);
        String adminId = requireAdminId(loginAdmin);

        try {
            adminUserManagementService.changeCaregiverRoom(hospitalDomain, adminId, userId, request.roomNumber());
            return ResponseEntity.ok(Map.of("message", "담당 병실이 변경되었습니다."));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(Map.of("message", exception.getMessage()));
        }
    }

    // [2026.09.27] 간호사·간병인 전화번호 수정 (확정 낙상 SMS 받는 번호)
    @PatchMapping("/users/{userId}/phone")
    public ResponseEntity<Map<String, String>> changeUserPhone(
            @PathVariable("userId") String userId,
            @Valid @RequestBody ChangeUserPhoneRequest request,
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            HttpSession session
    ) {
        String hospitalDomain = requireHospitalDomain(session);
        // [2026.09.30 변경] 전화번호 수정도 관리 이력(CHANGE_PHONE)에 작업 관리자를 남긴다.
        String adminId = requireAdminId(loginAdmin);

        try {
            adminUserManagementService.changeUserPhone(hospitalDomain, adminId, userId, request.phoneNumber());
            return ResponseEntity.ok(Map.of("message", "전화번호가 변경되었습니다."));
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(Map.of("message", exception.getMessage()));
        } catch (DataIntegrityViolationException exception) {
            // 간병인 번호는 DB 고유 인덱스(ux_emp_caregiver_phone)가 병원·상태와 상관없이 막는다
            // (비활성 간병인이나 다른 병원 간병인과 같은 번호). 500 대신 이유를 알려 준다.
            return ResponseEntity.badRequest().body(Map.of("message", "다른 직원이 이미 쓰는 전화번호입니다."));
        }
    }

    // 관리자 비밀번호 초기화: 새 임시 비밀번호를 생성하고 기존 로그인 세션을 만료
    @PostMapping("/users/{userId}/reset-password")
    public ResponseEntity<?> resetUserPassword(
            @PathVariable("userId") String userId,
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            HttpSession session
    ) {
        String hospitalDomain = requireHospitalDomain(session);
        String adminId = requireAdminId(loginAdmin);

        try {
            ResetUserPasswordResponse result =
                    adminPasswordService.resetPassword(
                            hospitalDomain,
                            adminId,
                            userId
                    );

            // 비밀번호가 변경된 뒤 해당 직원의 기존 로그인 세션을 만료시킨다.
            userSessionService.expireUserSessions(
                    hospitalDomain,
                    userId
            );

            // 임시 비밀번호가 브라우저나 중간 캐시에 저장되지 않도록 한다.
            return ResponseEntity.ok()
                    .header("Cache-Control", "no-store")
                    .body(result);
        } catch (UserNotFoundException exception) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(
                            Map.of(
                                    "message",
                                    exception.getMessage()
                            )
                    );
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest()
                    .body(
                            Map.of(
                                    "message",
                                    exception.getMessage()
                            )
                    );
        }
    }

    // 계정 비활성화: APPROVED에서 INACTIVE로 변경하고 기존 세션 만료
    @PatchMapping("/users/{userId}/deactivate")
    public ResponseEntity<Map<String, String>> deactivateUser(
            @PathVariable("userId") String userId,
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            HttpSession session
    ) {
        String hospitalDomain = requireHospitalDomain(session);
        String adminId = requireAdminId(loginAdmin);

        try {
            // DB 상태를 INACTIVE로 변경한다.
            adminUserManagementService.deactivateUser(
                    hospitalDomain,
                    adminId,
                    userId
            );

            // DB 변경이 성공한 뒤 해당 사용자의 기존 로그인 세션을 만료시킨다.
            userSessionService.expireUserSessions(
                    hospitalDomain,
                    userId
            );

            return ResponseEntity.ok(
                    Map.of(
                            "message",
                            "계정이 비활성화되었습니다."
                    )
            );
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.badRequest().body(
                    Map.of(
                            "message",
                            exception.getMessage()
                    )
            );
        }
    }

    // 비활성화된 사용자 목록 조회
    @GetMapping("/users/inactive")
    public List<InactiveUserResponse> getInactiveUsers(
            @RequestParam(defaultValue = "GENERAL") UserJobType jobType,
            HttpSession session
    ) {
        return adminUserManagementService.getInactiveUsers(
                requireHospitalDomain(session),
                jobType.name()
        );
    }

    // 비활성화된 사용자 계정 재활성화
    @PatchMapping("/users/{userId}/activate")
    public ResponseEntity<Map<String, String>> activateUser(
            @PathVariable String userId,
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            HttpSession session
    ) {
        String hospitalDomain = requireHospitalDomain(session);
        String adminId = requireAdminId(loginAdmin);

        try {
            adminUserManagementService.activateUser(
                    hospitalDomain,
                    adminId,
                    userId
            );

            return ResponseEntity.ok(
                    Map.of(
                            "message",
                            "계정이 활성화되어 승인완료 목록으로 이동했습니다."
                    )
            );
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(
                            Map.of(
                                    "message",
                                    exception.getMessage()
                            )
                    );
        }
    }

    // 비활성화된 사용자 계정 영구 삭제
    @DeleteMapping("/users/{userId}/inactive")
    public ResponseEntity<Map<String, String>> deleteInactiveUser(
            @PathVariable String userId,
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            HttpSession session
    ) {
        String hospitalDomain = requireHospitalDomain(session);
        String adminId = requireAdminId(loginAdmin);

        try {
            adminUserManagementService.deleteInactiveUser(
                    hospitalDomain,
                    adminId,
                    userId
            );

            userSessionService.expireUserSessions(
                    hospitalDomain,
                    userId
            );

            return ResponseEntity.ok(
                    Map.of(
                            "message",
                            "계정이 삭제되었습니다."
                    )
            );
        } catch (IllegalArgumentException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(
                            Map.of(
                                    "message",
                                    exception.getMessage()
                            )
                    );
        } catch (DataIntegrityViolationException exception) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(
                            Map.of(
                                    "message",
                                    "연결된 업무 기록으로 인해 삭제할 수 없습니다. 관련 기록을 확인해 주세요."
                            )
                    );
        }
    }

    // 인증된 관리자 ID를 가져온다.
    private String requireAdminId(
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
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "병원 관리자만 사용할 수 있습니다."
            );
        }

        return loginAdmin.getUsername();
    }

    // 접속 병원과 인증된 관리자의 소속 병원이 같아야 한다.
    private String requireHospitalDomain(HttpSession session) {
        String hospitalDomain = (String) session.getAttribute(
                SessionConstants.HOSPITAL_DOMAIN
        );

        if (hospitalDomain == null || hospitalDomain.isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "병원 접속 정보가 없습니다."
            );
        }

        Object principal = SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        if (!(principal instanceof HospitalUserDetails admin)
                || !hospitalDomain.equals(admin.getHospitalId())) {
            throw new ResponseStatusException(
                    HttpStatus.FORBIDDEN,
                    "로그인한 관리자의 병원만 관리할 수 있습니다."
            );
        }

        return hospitalDomain;
    }
}
