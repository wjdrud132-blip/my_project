package com.aio.hospitalsafety.service.admin;

import com.aio.hospitalsafety.dto.admin.ResetUserPasswordResponse;
import com.aio.hospitalsafety.exception.UserNotFoundException;
import com.aio.hospitalsafety.mapper.admin.AdminUserManagementMapper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 관리자가 직원 계정의 비밀번호를 초기화하는 업무를 처리한다.
 *
 * 임시 비밀번호 원문은 DB에 저장하지 않고 관리자 응답으로 한 번만 반환한다.
 * DB에는 PasswordEncoder로 생성한 BCrypt 해시만 저장한다.
 */
@Service
public class AdminPasswordService {

    // 직원 계정의 비밀번호와 최초 변경 필요 상태를 수정하는 Mapper
    private final AdminUserManagementMapper adminUserManagementMapper;

    // 계정 생성에서도 사용하는 보안 임시 비밀번호 생성기
    private final TemporaryPasswordGenerator temporaryPasswordGenerator;

    // 임시 비밀번호를 BCrypt 해시로 변환하는 Encoder
    private final PasswordEncoder passwordEncoder;

    // 비밀번호 초기화 성공 이력을 저장하는 Service
    private final AdminHistoryService adminHistoryService;

    /**
     * 필요한 객체는 생성자 주입 방식으로 전달받는다.
     */
    public AdminPasswordService(
            AdminUserManagementMapper adminUserManagementMapper,
            TemporaryPasswordGenerator temporaryPasswordGenerator,
            PasswordEncoder passwordEncoder,
            AdminHistoryService adminHistoryService
    ) {
        this.adminUserManagementMapper = adminUserManagementMapper;
        this.temporaryPasswordGenerator = temporaryPasswordGenerator;
        this.passwordEncoder = passwordEncoder;
        this.adminHistoryService = adminHistoryService;
    }

    /**
     * 현재 병원에 소속된 활성 직원의 비밀번호를 초기화한다.
     *
     * 처리 순서
     * 1. 안전한 임시 비밀번호를 생성한다.
     * 2. 임시 비밀번호를 BCrypt로 해시한다.
     * 3. DB 비밀번호를 변경하고 MUST_CHANGE_PASSWORD를 TRUE로 변경한다.
     * 4. RESET_PASSWORD 감사 로그를 저장한다.
     * 5. 관리자 화면에 표시할 임시 비밀번호 원문을 응답으로 반환한다.
     *
     * @param hospitalDomain 로그인한 관리자의 병원 구분 ID
     * @param adminId 작업을 수행한 관리자 ID
     * @param userId 비밀번호를 초기화할 직원 ID
     * @return 직원 ID, 임시 비밀번호, 비밀번호 변경 필요 여부
     */
    @Transactional
    public ResetUserPasswordResponse resetPassword(
            String hospitalDomain,
            String adminId,
            String userId
    ) {
        if (hospitalDomain == null || hospitalDomain.isBlank()) {
            throw new IllegalArgumentException(
                    "병원 정보가 없습니다."
            );
        }

        if (adminId == null || adminId.isBlank()) {
            throw new IllegalArgumentException(
                    "작업 관리자 정보가 없습니다."
            );
        }

        if (userId == null || userId.isBlank()) {
            throw new IllegalArgumentException(
                    "초기화할 직원 아이디가 없습니다."
            );
        }

        String normalizedHospitalDomain = hospitalDomain.trim();
        String normalizedAdminId = adminId.trim();
        String normalizedUserId = userId.trim();

        // 임시 비밀번호 원문은 이 메서드 밖에서 로그로 출력하거나 DB에 저장하지 않는다.
        String temporaryPassword =
                temporaryPasswordGenerator.generate();

        String passwordHash =
                passwordEncoder.encode(temporaryPassword);

        int updatedRows =
                adminUserManagementMapper.resetUserPassword(
                        normalizedHospitalDomain,
                        normalizedUserId,
                        passwordHash
                );

        // 현재 병원의 APPROVED 일반 직원이 아니면 UPDATE 결과가 0이다.
        if (updatedRows != 1) {
            throw new UserNotFoundException(
                    "초기화할 활성 직원 계정을 찾을 수 없습니다."
            );
        }

        // 비밀번호 초기화 성공 이력을 같은 트랜잭션으로 저장한다.
        adminHistoryService.record(
                normalizedHospitalDomain,
                normalizedAdminId,
                normalizedUserId,
                AdminHistoryService.RESET_PASSWORD
        );

        // 임시 비밀번호 원문은 관리자 화면에서 한 번 표시하기 위해서만 반환한다.
        return new ResetUserPasswordResponse(
                normalizedUserId,
                temporaryPassword,
                true
        );
    }
}