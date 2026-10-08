package com.aio.hospitalsafety.controller.admin;

import com.aio.hospitalsafety.config.HospitalUserDetails;
import com.aio.hospitalsafety.dto.admin.CreateUserRequest;
import com.aio.hospitalsafety.dto.admin.CreateCaregiverRequest;
import com.aio.hospitalsafety.dto.admin.CreateUserResponse;
import com.aio.hospitalsafety.service.admin.UserProvisioningService;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestParam;
import com.aio.hospitalsafety.domain.UserJobType;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin")
public class UserProvisioningController {

    private final UserProvisioningService userProvisioningService;

    public UserProvisioningController(
            UserProvisioningService userProvisioningService
    ) {
        this.userProvisioningService = userProvisioningService;
    }

    /**
     * 관리자가 현재 병원에 직원 계정을 생성한다.
     */
    @PostMapping("/users")
    public ResponseEntity<CreateUserResponse> createUser(
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            @RequestParam(defaultValue = "GENERAL") UserJobType jobType,
            @Valid @RequestBody CreateUserRequest request
    ) {
        HospitalUserDetails admin = requireAdmin(loginAdmin);
        if (jobType != UserJobType.GENERAL) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "간병인 계정은 간병인 생성 화면에서 등록해 주세요.");
        }

        CreateUserResponse response =
                userProvisioningService.createUser(
                        admin.getHospitalId(),
                        admin.getUsername(),
                        request,
                        jobType.name()
                );

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(response);
    }

    @PostMapping("/caregivers")
    public ResponseEntity<CreateUserResponse> createCaregiver(
            @AuthenticationPrincipal HospitalUserDetails loginAdmin,
            @Valid @RequestBody CreateCaregiverRequest request
    ) {
        HospitalUserDetails admin = requireAdmin(loginAdmin);
        CreateUserResponse response = userProvisioningService.createCaregiver(
                admin.getHospitalId(), admin.getUsername(), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .cacheControl(CacheControl.noStore())
                .body(response);
    }

    /**
     * 현재 로그인 계정이 관리자인지 확인한다.
     */
    private HospitalUserDetails requireAdmin(
            HospitalUserDetails loginAdmin
    ) {
        boolean isAdmin =
                loginAdmin != null
                && loginAdmin.getAuthorities()
                .stream()
                .anyMatch(authority ->
                        "ROLE_ADMIN".equals(
                                authority.getAuthority()
                        )
                );

        if (!isAdmin) {
            throw new AccessDeniedException(
                    "병원 관리자만 사용할 수 있습니다."
            );
        }

        return loginAdmin;
    }
}
