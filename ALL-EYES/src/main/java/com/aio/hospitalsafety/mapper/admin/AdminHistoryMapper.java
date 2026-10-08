package com.aio.hospitalsafety.mapper.admin;

import com.aio.hospitalsafety.dto.admin.AdminHistoryResponse;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

/**
 * 관리자 감사 로그 저장과 조회를 담당한다.
 */
@Mapper
public interface AdminHistoryMapper {

    /**
     * 관리자가 직원 계정에 수행한 작업을 저장한다.
     */
    int insertHistory(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("adminId") String adminId,
            @Param("userId") String userId,
            @Param("actionCode") String actionCode,
            @Param("actionDetail") String actionDetail
    );

    /**
     * 현재 병원의 최근 감사 로그를 조회한다.
     */
    List<AdminHistoryResponse> findRecentHistories(
            @Param("hospitalDomain") String hospitalDomain,
            @Param("limit") int limit
    );
}