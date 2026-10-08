package com.aio.hospitalsafety.service.admin;

import java.util.List;

import com.aio.hospitalsafety.common.CaregiverIds;
import com.aio.hospitalsafety.domain.ApprovalStatus;
import com.aio.hospitalsafety.domain.Role;
import com.aio.hospitalsafety.dto.admin.CaregiverInsert;
import com.aio.hospitalsafety.dto.admin.CreateUserRequest;
import com.aio.hospitalsafety.dto.admin.CreateCaregiverRequest;
import com.aio.hospitalsafety.dto.admin.CreateUserResponse;
import com.aio.hospitalsafety.exception.UserConflictException;
import com.aio.hospitalsafety.mapper.admin.CaregiverMapper;
import com.aio.hospitalsafety.mapper.admin.UserProvisioningMapper;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserProvisioningService {

    private final UserProvisioningMapper userProvisioningMapper;
    private final TemporaryPasswordGenerator temporaryPasswordGenerator;
    private final PasswordEncoder passwordEncoder;
    private final AdminHistoryService adminHistoryService;
    private final UserRoomService userRoomService;
    private final CaregiverMapper caregiverMapper;

    public UserProvisioningService(
            UserProvisioningMapper userProvisioningMapper,
            TemporaryPasswordGenerator temporaryPasswordGenerator,
            PasswordEncoder passwordEncoder,
            AdminHistoryService adminHistoryService,
            UserRoomService userRoomService,
            CaregiverMapper caregiverMapper
    ) {
        this.userProvisioningMapper = userProvisioningMapper;
        this.temporaryPasswordGenerator = temporaryPasswordGenerator;
        this.passwordEncoder = passwordEncoder;
        this.adminHistoryService = adminHistoryService;
        this.userRoomService = userRoomService;
        this.caregiverMapper = caregiverMapper;
    }

    /**
     * 관리자가 현재 병원에 직원 계정을 생성한다.
     *
     * 계정 생성과 감사 로그 저장은 같은 트랜잭션에서 처리한다.
     * 감사 로그 저장에 실패하면 계정 생성도 함께 취소된다.
     */
    @Transactional
    public CreateUserResponse createUser(
            String hospitalId,
            String adminId,
            CreateUserRequest request,
            String jobType
    ) {
        // [2026.09.27] 간호사 번호도 간병인처럼 하이픈을 빼고 저장한다(확정 낙상 SMS 받는 번호).
        String phoneNumber = request.phoneNumber().replace("-", "");
        CreateUserResponse response = createAccount(hospitalId, adminId, request.userId(), request.userName(),
                request.wardId(), phoneNumber);
        // [2026.09.30 추가] 담당 병실(선택 사항)을 같은 트랜잭션에서 저장한다. 병실 번호가 잘못되면 계정 생성도 취소된다.
        userRoomService.replaceRooms(hospitalId, response.userId(), request.wardId(), request.roomNumbers());
        // [2026.09.30 변경] 계정 생성 이력(CREATE)을 담당 병실 저장 뒤에 남기고, 처리 내용에 병동·담당 병실을 적는다.
        // 예: '3병동 · 담당 병실 301·302호' / 담당 병실이 없으면 '3병동'
        List<String> rooms = userRoomService.roomNamesOf(response.userId());
        String wardName = userRoomService.wardNameOf(hospitalId, request.wardId());
        adminHistoryService.record(hospitalId, adminId, response.userId(), AdminHistoryService.CREATE,
                rooms.isEmpty() ? wardName : wardName + " · 담당 병실 " + UserRoomService.formatRooms(rooms));
        return response;
    }

    /**
     * [2026.09.30 변경] 간병인은 명세대로 TB_CAREGIVER 에 등록한다(로그인 계정이 아니므로 tb_emp 에 만들지 않는다).
     * 병실은 TB_LOCATION 의 병실 위치(예: 3병동 '302호')로 가리키고, 병실 하나의 활성 간병인은 1명이다.
     */
    @Transactional
    public CreateUserResponse createCaregiver(
            String hospitalId,
            String adminId,
            CreateCaregiverRequest request
    ) {
        String hospitalDomain = requireText(hospitalId, "병원 정보가 없습니다.");
        String caregiverName = requireText(request.userName(), "간병인 이름을 입력해 주세요.");
        String phoneNumber = request.phoneNumber().replace("-", "");
        int roomNumber = request.roomNumber();

        Long locationId = caregiverMapper.findRoomLocationId(hospitalDomain, roomNumber / 100, roomNumber + "호");
        if (locationId == null) {
            throw new IllegalArgumentException("병실 위치로 등록되지 않은 병실입니다: " + roomNumber + "호");
        }
        if (caregiverMapper.existsActiveCaregiverAt(locationId, null)) {
            throw new UserConflictException("이 병실에는 이미 담당 간병인이 있습니다. 기존 간병인의 병실을 바꾸거나 비활성화해 주세요.");
        }
        if (caregiverMapper.existsActiveCaregiverPhone(hospitalDomain, phoneNumber, null)) {
            throw new UserConflictException("이미 등록된 전화번호입니다. 비활성화된 간병인 목록도 확인해 주세요.");
        }

        CaregiverInsert caregiver = new CaregiverInsert(hospitalDomain, caregiverName, locationId, phoneNumber);
        if (caregiverMapper.insertCaregiver(caregiver) != 1 || caregiver.getCaregiverId() == null) {
            throw new IllegalStateException("간병인을 등록하지 못했습니다.");
        }
        String userId = CaregiverIds.of(caregiver.getCaregiverId());

        adminHistoryService.record(hospitalDomain, requireText(adminId, "작업 관리자 정보가 없습니다."),
                userId, AdminHistoryService.CREATE, caregiverMapper.findLocationName(locationId));

        // 간병인은 로그인하지 않으므로 임시 비밀번호가 없다(화면도 간병인은 비밀번호 줄을 숨긴다).
        return new CreateUserResponse(
                userId,
                caregiverName,
                caregiverMapper.findWardIdByLocation(locationId),
                Role.USER,
                ApprovalStatus.APPROVED,
                false,
                ""
        );
    }

    private CreateUserResponse createAccount(
            String hospitalId,
            String adminId,
            String userId,
            String userName,
            Long wardId,
            String phoneNumber
    ) {
        String normalizedHospitalId = requireText(
                hospitalId,
                "병원 정보가 없습니다."
        );

        String normalizedAdminId = requireText(
                adminId,
                "작업 관리자 정보가 없습니다."
        );

        String normalizedUserId = requireText(
                userId,
                "직원 아이디를 입력해 주세요."
        );

        String normalizedUserName = requireText(
                userName,
                "직원 이름을 입력해 주세요."
        );

        // [2026.09.27] 같은 번호를 쓰는 활성 직원이 있으면 막는다(전화번호 수정과 같은 규칙, 한 번호로 SMS 두 번 방지).
        if (phoneNumber != null
                && userProvisioningMapper.existsActivePhone(normalizedHospitalId, phoneNumber)) {
            throw new UserConflictException(
                    "다른 직원이 이미 쓰는 전화번호입니다."
            );
        }

        if (userProvisioningMapper.existsUserId(normalizedUserId)) {
            throw new UserConflictException(
                    "이미 사용 중인 직원 아이디입니다."
            );
        }

        if (!userProvisioningMapper.existsWardInHospital(
                normalizedHospitalId,
                wardId
        )) {
            throw new IllegalArgumentException(
                    "현재 병원에 속한 병동을 선택해 주세요."
            );
        }

        String temporaryPassword =
                temporaryPasswordGenerator.generate();

        String passwordHash =
                passwordEncoder.encode(temporaryPassword);

        try {
            int inserted = userProvisioningMapper.insertUser(
                    normalizedUserId,
                    passwordHash,
                    normalizedHospitalId,
                    wardId,
                    normalizedUserName,
                    phoneNumber
            );

            if (inserted != 1) {
                throw new IllegalStateException(
                        "직원 계정을 생성하지 못했습니다."
                );
            }
        } catch (DuplicateKeyException exception) {
            // [2026.09.30 변경] 간병인은 TB_CAREGIVER 로 옮겨 여기서는 간호사 아이디 중복만 남는다.
            throw new UserConflictException("이미 사용 중인 직원 아이디입니다.");
        }

        // [2026.09.30 변경] CREATE 감사 로그는 담당 병실까지 저장한 뒤 createUser 가 처리 내용과 함께 남긴다(같은 트랜잭션).

        return new CreateUserResponse(
                normalizedUserId,
                normalizedUserName,
                wardId,
                Role.USER,
                ApprovalStatus.APPROVED,
                true,
                temporaryPassword
        );
    }

    private String requireText(
            String value,
            String message
    ) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }

        return value.trim();
    }
}
