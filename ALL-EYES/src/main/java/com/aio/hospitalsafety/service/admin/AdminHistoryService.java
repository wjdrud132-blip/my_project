package com.aio.hospitalsafety.service.admin;

import com.aio.hospitalsafety.dto.admin.AdminHistoryResponse;
import com.aio.hospitalsafety.mapper.admin.AdminHistoryMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

/**
 * 관리자 감사 로그 저장과 조회 업무를 처리한다.
 *
 * 비밀번호 원문이나 BCrypt 해시는 감사 로그에 전달하거나 저장하지 않는다.
 */
@Service
public class AdminHistoryService {

    public static final String CREATE = "CREATE";
    public static final String CHANGE_WARD = "CHANGE_WARD";
    // [2026.09.30 추가] 병실 변경, 전화번호 수정(공용 DB ck_admin_history_action 에 함께 추가함)
    public static final String CHANGE_ROOM = "CHANGE_ROOM";
    public static final String CHANGE_PHONE = "CHANGE_PHONE";
    public static final String RESET_PASSWORD = "RESET_PASSWORD";
    public static final String DEACTIVATE = "DEACTIVATE";
    public static final String ACTIVATE = "ACTIVATE";
    public static final String DELETE = "DELETE";

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 200;

    private static final Set<String> ALLOWED_ACTION_CODES = Set.of(
            CREATE,
            CHANGE_WARD,
            CHANGE_ROOM,
            CHANGE_PHONE,
            RESET_PASSWORD,
            DEACTIVATE,
            ACTIVATE,
            DELETE
    );

    private final AdminHistoryMapper adminHistoryMapper;

    public AdminHistoryService(AdminHistoryMapper adminHistoryMapper) {
        this.adminHistoryMapper = adminHistoryMapper;
    }

    /**
     * 관리자가 직원에게 수행한 작업을 감사 로그에 저장한다.
     */
    @Transactional
    public void record(
            String hospitalDomain,
            String adminId,
            String userId,
            String actionCode
    ) {
        record(hospitalDomain, adminId, userId, actionCode, null);
    }

    /**
     * [2026.09.30 추가] 처리 내용(변경 전 → 후)을 함께 남긴다. 예: '담당 병실 301호 → 301·302호'.
     * 전화번호는 끝 4자리만 넘긴다. 200자를 넘으면 자른다(TB_ADMIN_HISTORY.ACTION_DETAIL).
     */
    @Transactional
    public void record(
            String hospitalDomain,
            String adminId,
            String userId,
            String actionCode,
            String actionDetail
    ) {
        String normalizedHospitalDomain = requireText(
                hospitalDomain,
                "병원 정보가 없습니다."
        );

        String normalizedAdminId = requireText(
                adminId,
                "작업 관리자 정보가 없습니다."
        );

        String normalizedUserId = requireText(
                userId,
                "대상 직원 정보가 없습니다."
        );

        String normalizedActionCode = requireText(
                actionCode,
                "처리 내용이 없습니다."
        );

        if (!ALLOWED_ACTION_CODES.contains(normalizedActionCode)) {
            throw new IllegalArgumentException(
                    "지원하지 않는 감사 로그 처리 코드입니다."
            );
        }

        String normalizedDetail = actionDetail == null || actionDetail.isBlank() ? null
                : actionDetail.length() > 200 ? actionDetail.substring(0, 200) : actionDetail;

        int insertedRows = adminHistoryMapper.insertHistory(
                normalizedHospitalDomain,
                normalizedAdminId,
                normalizedUserId,
                normalizedActionCode,
                normalizedDetail
        );

        if (insertedRows != 1) {
            throw new IllegalStateException(
                    "감사 로그를 저장하지 못했습니다."
            );
        }
    }

    /**
     * 현재 병원의 최근 감사 로그를 조회한다.
     */
    @Transactional(readOnly = true)
    public List<AdminHistoryResponse> getRecentHistories(
            String hospitalDomain,
            Integer limit
    ) {
        String normalizedHospitalDomain = requireText(
                hospitalDomain,
                "병원 정보가 없습니다."
        );

        int safeLimit = limit == null
                ? DEFAULT_LIMIT
                : Math.min(Math.max(limit, 1), MAX_LIMIT);

        return adminHistoryMapper.findRecentHistories(
                normalizedHospitalDomain,
                safeLimit
        );
    }

    private String requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }

        return value.trim();
    }
}