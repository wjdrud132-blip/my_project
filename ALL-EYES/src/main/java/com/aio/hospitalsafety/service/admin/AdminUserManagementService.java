package com.aio.hospitalsafety.service.admin;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.aio.hospitalsafety.common.CaregiverIds;
import com.aio.hospitalsafety.dto.WardOption;
import com.aio.hospitalsafety.dto.admin.ApprovedUserResponse;
import com.aio.hospitalsafety.dto.admin.CaregiverRow;
import com.aio.hospitalsafety.dto.admin.InactiveUserResponse;
import com.aio.hospitalsafety.mapper.admin.AdminUserManagementMapper;
import com.aio.hospitalsafety.mapper.admin.CaregiverMapper;

@Service
public class AdminUserManagementService {

    private final AdminUserManagementMapper adminUserManagementMapper;
    private final AdminHistoryService adminHistoryService;
    private final UserRoomService userRoomService;
    private final CaregiverMapper caregiverMapper;

    public AdminUserManagementService(
            AdminUserManagementMapper adminUserManagementMapper,
            AdminHistoryService adminHistoryService,
            UserRoomService userRoomService,
            CaregiverMapper caregiverMapper
    ) {
        this.adminUserManagementMapper = adminUserManagementMapper;
        this.adminHistoryService = adminHistoryService;
        this.userRoomService = userRoomService;
        this.caregiverMapper = caregiverMapper;
    }

    // 승인 완료 사용자 목록 조회
    @Transactional(readOnly = true)
    public List<ApprovedUserResponse> getApprovedUsers(
            String hospitalDomain,
            String keyword,
            String jobType
    ) {
        String normalizedKeyword =
                keyword == null ? "" : keyword.trim();

        // [2026.09.30 변경] 간병인은 명세의 TB_CAREGIVER 에서 읽는다(userId = 'cg:' + CAREGIVER_ID).
        if ("CAREGIVER".equals(jobType)) {
            return caregiverMapper.findCaregivers(hospitalDomain, normalizedKeyword);
        }

        return adminUserManagementMapper.findApprovedUsers(
                hospitalDomain,
                normalizedKeyword,
                jobType
        );
    }

    // 현재 병원의 병동 목록 조회
    @Transactional(readOnly = true)
    public List<WardOption> getWards(
            String hospitalDomain
    ) {
        return adminUserManagementMapper.findWardsByHospital(
                hospitalDomain
        );
    }

    // 승인 완료 사용자의 담당 병동 변경
    // [2026.09.30 변경] 간호사 담당 병실(roomNumbers, 선택 사항)도 함께 바꾼다.
    // roomNumbers 가 null 이면 병동만 바꾸고, 병동이 바뀐 경우 예전 병동의 담당 병실은 지운다.
    @Transactional
    public void changeUserWard(
            String hospitalDomain,
            String adminId,
            String userId,
            Long wardId,
            List<Integer> roomNumbers
    ) {
        boolean wardExists =
                adminUserManagementMapper.existsWardInHospital(
                        hospitalDomain,
                        wardId
                );
        // [2026.09.30 추가] 병동이 바뀌었는지 보려고 바꾸기 전 병동·담당 병실을 읽어 둔다(관리 이력의 변경 전 값).
        Long previousWardId = adminUserManagementMapper.findUserWardId(hospitalDomain, userId);
        List<String> previousRooms = userRoomService.roomNamesOf(userId);

        if (!wardExists) {
            throw new IllegalArgumentException(
                    "현재 병원에 속한 병동을 선택해 주세요."
            );
        }

        int updatedRows =
                adminUserManagementMapper.updateUserWard(
                        hospitalDomain,
                        userId,
                        wardId
                );

        if (updatedRows != 1) {
            throw new IllegalArgumentException(
                    "병동을 변경할 승인 완료 사용자를 찾을 수 없습니다."
            );
        }

        // [2026.09.30 추가] 담당 병실은 병동에 딸려 있으므로 병동과 같은 트랜잭션에서 바꾼다.
        if (roomNumbers != null) {
            userRoomService.replaceRooms(hospitalDomain, userId, wardId, roomNumbers);
        } else if (previousWardId == null || !previousWardId.equals(wardId)) {
            userRoomService.clearRooms(userId);
        }

        // [2026.09.30 변경] 병동이 바뀌면 '병동 변경', 병동은 그대로이고 담당 병실만 바뀌면 '병실 변경'으로 남기고,
        // 처리 내용에 변경 전 → 후를 적는다. 예: '3병동 → 2병동, 담당 병실 301호 → 없음' / '담당 병실 301호 → 301·302호'
        boolean wardChanged = previousWardId == null || !previousWardId.equals(wardId);
        String roomsBefore = UserRoomService.formatRooms(previousRooms);
        String roomsAfter = UserRoomService.formatRooms(userRoomService.roomNamesOf(userId));
        boolean roomsChanged = !roomsBefore.equals(roomsAfter);
        String roomDetail = "담당 병실 " + roomsBefore + " → " + roomsAfter;
        String detail = wardChanged
                ? userRoomService.wardNameOf(hospitalDomain, previousWardId) + " → "
                        + userRoomService.wardNameOf(hospitalDomain, wardId)
                        + (roomsChanged ? ", " + roomDetail : "")
                : roomsChanged ? roomDetail : "변경 사항 없음";

        // 담당 병동·병실 변경 성공 이력을 같은 트랜잭션으로 저장한다.
        adminHistoryService.record(
                hospitalDomain,
                adminId,
                userId,
                !wardChanged && roomsChanged ? AdminHistoryService.CHANGE_ROOM : AdminHistoryService.CHANGE_WARD,
                detail
        );
    }

    /**
     * [2026.09.27] 간병인 담당 병실 변경.
     * 확정 낙상 SMS 는 병실 번호(room_no)로 담당 간병인을 찾으므로, 화면에서만 바꾸면 문자가 예전 간병인에게 간다.
     * 병실 번호의 백의 자리가 병동 번호다(305호 → 3병동). 병동도 함께 바꾼다.
     * 이력은 CHANGE_WARD 로 남긴다. 간병인 이력 화면은 이 코드를 '병실 변경'으로 보여 준다(admin-history.js).
     */
    @Transactional
    public void changeCaregiverRoom(
            String hospitalDomain,
            String adminId,
            String userId,
            int roomNumber
    ) {
        int wardNumber = roomNumber / 100;
        int roomOrder = roomNumber % 100;
        if (wardNumber < 1 || wardNumber > 3 || roomOrder < 1 || roomOrder > 17) {
            throw new IllegalArgumentException("101~117호, 201~217호, 301~317호 중에서 선택해 주세요.");
        }

        // [2026.09.30 변경] 간병인은 TB_CAREGIVER.LOCATION_ID(병실 위치)를 바꾼다. 병실 하나의 활성 간병인은 1명이다.
        long caregiverId = CaregiverIds.toId(userId);
        CaregiverRow before = caregiverMapper.findCaregiver(hospitalDomain, caregiverId);
        Long locationId = caregiverMapper.findRoomLocationId(hospitalDomain, wardNumber, roomNumber + "호");
        if (locationId == null) {
            throw new IllegalArgumentException("병실 위치로 등록되지 않은 병실입니다: " + roomNumber + "호");
        }
        if (caregiverMapper.existsActiveCaregiverAt(locationId, caregiverId)) {
            throw new IllegalArgumentException(roomNumber + "호에는 이미 다른 담당 간병인이 있습니다.");
        }

        int updatedRows = caregiverMapper.updateCaregiverLocation(hospitalDomain, caregiverId, locationId);
        if (updatedRows != 1) {
            throw new IllegalArgumentException("병실을 변경할 간병인을 찾을 수 없습니다.");
        }

        // [2026.09.30 변경] '병실 변경'과 처리 내용(예: '302호 → 305호')을 남긴다.
        String roomBefore = before == null ? null : caregiverMapper.findLocationName(before.locationId());
        adminHistoryService.record(hospitalDomain, adminId, userId, AdminHistoryService.CHANGE_ROOM,
                (roomBefore == null ? "없음" : roomBefore) + " → " + roomNumber + "호");
    }

    /**
     * [2026.09.27] 간호사·간병인 전화번호 수정 (확정 낙상 SMS 받는 번호).
     * 같은 번호를 쓰는 다른 활성 직원이 있으면 막는다(한 번호로 문자가 두 번 가지 않게).
     * [2026.09.30 변경] 공용 DB 작업 코드에 CHANGE_PHONE 을 추가해 '전화번호 수정' 이력을 남긴다.
     * 처리 내용에는 변경 전·후 전체 전화번호를 적는다(예: '010-1234-5678 → 010-9876-5432').
     */
    @Transactional
    public void changeUserPhone(
            String hospitalDomain,
            String adminId,
            String userId,
            String phoneNumber
    ) {
        String digits = phoneNumber.replace("-", "");
        String previousPhone;
        // [2026.09.30 추가] 간병인(TB_CAREGIVER)
        if (CaregiverIds.isCaregiver(userId)) {
            long caregiverId = CaregiverIds.toId(userId);
            CaregiverRow caregiver = caregiverMapper.findCaregiver(hospitalDomain, caregiverId);
            previousPhone = caregiver == null ? null : caregiver.phoneNumber();
            if (caregiverMapper.existsActiveCaregiverPhone(hospitalDomain, digits, caregiverId)) {
                throw new IllegalArgumentException("다른 간병인이 이미 쓰는 전화번호입니다.");
            }
            if (caregiverMapper.updateCaregiverPhone(hospitalDomain, caregiverId, digits) != 1) {
                throw new IllegalArgumentException("전화번호를 바꿀 간병인을 찾을 수 없습니다.");
            }
        } else {
            previousPhone = adminUserManagementMapper.findUserPhone(hospitalDomain, userId);
            if (adminUserManagementMapper.existsOtherUserPhone(hospitalDomain, userId, digits)) {
                throw new IllegalArgumentException("다른 직원이 이미 쓰는 전화번호입니다.");
            }

            int updatedRows = adminUserManagementMapper.updateUserPhone(hospitalDomain, userId, digits);
            if (updatedRows != 1) {
                throw new IllegalArgumentException("전화번호를 바꿀 직원을 찾을 수 없습니다.");
            }
        }

        adminHistoryService.record(hospitalDomain, adminId, userId, AdminHistoryService.CHANGE_PHONE,
                formatPhoneForHistory(previousPhone) + " → " + formatPhoneForHistory(digits));
    }

    // [2026.10.01 변경] 전화번호 수정 이력에는 비교 확인이 가능하도록 전체 번호를 남깁니다.
    private static String formatPhoneForHistory(String phoneNumber) {
        if (phoneNumber == null || phoneNumber.isBlank()) {
            return "없음";
        }
        String digits = phoneNumber.replaceAll("[^0-9]", "");
        if (digits.length() == 11) {
            return digits.substring(0, 3) + "-" + digits.substring(3, 7) + "-" + digits.substring(7);
        }
        if (digits.length() == 10) {
            return digits.substring(0, 3) + "-" + digits.substring(3, 6) + "-" + digits.substring(6);
        }
        return digits.isBlank() ? "없음" : digits;
    }

    // 비활성화된 일반 사용자 목록 조회
    @Transactional(readOnly = true)
    public List<InactiveUserResponse> getInactiveUsers(
            String hospitalDomain,
            String jobType
    ) {
        // [2026.09.30 변경] 간병인은 TB_CAREGIVER(USE_YN = 'N')에서 읽는다.
        if ("CAREGIVER".equals(jobType)) {
            return caregiverMapper.findInactiveCaregivers(hospitalDomain);
        }
        return adminUserManagementMapper.findInactiveUsers(
                hospitalDomain,
                jobType
        );
    }

    // 비활성화된 일반 사용자 계정 재활성화
    @Transactional
    public void activateUser(
            String hospitalDomain,
            String adminId,
            String userId
    ) {
        // [2026.09.30 추가] 간병인(TB_CAREGIVER): 같은 번호의 활성 간병인, 같은 병실의 활성 간병인이 있으면 막는다.
        if (CaregiverIds.isCaregiver(userId)) {
            long caregiverId = CaregiverIds.toId(userId);
            CaregiverRow caregiver = caregiverMapper.findCaregiver(hospitalDomain, caregiverId);
            if (caregiver == null || !"N".equals(caregiver.useYn())) {
                throw new IllegalArgumentException("활성화할 비활성화 간병인을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
            }
            if (caregiverMapper.existsActiveCaregiverPhone(hospitalDomain, caregiver.phoneNumber(), caregiverId)) {
                throw new IllegalArgumentException("같은 전화번호를 쓰는 활성 간병인이 있습니다. 번호를 먼저 바꿔 주세요.");
            }
            if (caregiverMapper.existsActiveCaregiverAt(caregiver.locationId(), caregiverId)) {
                throw new IllegalArgumentException("이 간병인의 병실에 이미 다른 활성 간병인이 있습니다. 병실을 먼저 정리해 주세요.");
            }
            caregiverMapper.updateCaregiverUse(hospitalDomain, caregiverId, "N", "Y");
            adminHistoryService.record(hospitalDomain, adminId, userId, AdminHistoryService.ACTIVATE);
            return;
        }

        // [2026.09.27] 비활성인 동안 같은 번호로 새 직원을 만들었다면, 다시 활성화할 때 같은 번호의 활성 직원이 둘이 된다
        // (같은 휴대폰에 확정 낙상 문자가 두 번 감). 생성·번호 수정과 같은 규칙으로 막는다.
        String phoneNumber = adminUserManagementMapper.findUserPhone(hospitalDomain, userId);
        if (phoneNumber != null && !phoneNumber.isBlank()
                && adminUserManagementMapper.existsOtherUserPhone(hospitalDomain, userId, phoneNumber)) {
            throw new IllegalArgumentException("같은 전화번호를 쓰는 활성 직원이 있습니다. 번호를 먼저 바꿔 주세요.");
        }

        int updatedRows =
                adminUserManagementMapper.activateUser(
                        hospitalDomain,
                        userId
                );

        if (updatedRows != 1) {
            throw new IllegalArgumentException(
                    "활성화할 비활성화 사용자를 찾을 수 없습니다. 목록을 새로고침해 주세요."
            );
        }

        // 계정 재활성화 성공 이력을 같은 트랜잭션으로 저장한다.
        adminHistoryService.record(
                hospitalDomain,
                adminId,
                userId,
                AdminHistoryService.ACTIVATE
        );
    }

    // 비활성화된 일반 사용자 계정 영구 삭제
    @Transactional
    public void deleteInactiveUser(
            String hospitalDomain,
            String adminId,
            String userId
    ) {
        // [2026.09.30 변경] 간병인은 TB_CAREGIVER 의 비활성 행을 지운다.
        int deletedRows = CaregiverIds.isCaregiver(userId)
                ? caregiverMapper.deleteInactiveCaregiver(hospitalDomain, CaregiverIds.toId(userId))
                : adminUserManagementMapper.deleteInactiveUser(
                        hospitalDomain,
                        userId
                );

        if (deletedRows != 1) {
            throw new IllegalArgumentException(
                    "삭제할 비활성화 사용자를 찾을 수 없습니다. 목록을 새로고침해 주세요."
            );
        }

        // 직원 삭제 후에도 감사 테이블에 직원 ID를 보존한다.
        adminHistoryService.record(
                hospitalDomain,
                adminId,
                userId,
                AdminHistoryService.DELETE
        );
    }

    // 계정 비활성화: APPROVED에서 INACTIVE로 변경
    @Transactional
    public void deactivateUser(
            String hospitalDomain,
            String adminId,
            String userId
    ) {
        // [2026.09.30 변경] 간병인은 TB_CAREGIVER.USE_YN 을 'N' 으로 바꾼다.
        int updatedRows = CaregiverIds.isCaregiver(userId)
                ? caregiverMapper.updateCaregiverUse(hospitalDomain, CaregiverIds.toId(userId), "Y", "N")
                : adminUserManagementMapper.deactivateUser(
                        hospitalDomain,
                        userId
                );

        if (updatedRows != 1) {
            throw new IllegalArgumentException(
                    "비활성화할 승인 완료 사용자를 찾을 수 없습니다."
            );
        }

        // [2026.09.30 추가] 비활성화한 간호사의 담당 병실을 비운다(목록과 문자 대상에서 빠지게).
        userRoomService.clearRooms(userId);

        // 계정 비활성화 성공 이력을 같은 트랜잭션으로 저장한다.
        adminHistoryService.record(
                hospitalDomain,
                adminId,
                userId,
                AdminHistoryService.DEACTIVATE
        );
    }
}
