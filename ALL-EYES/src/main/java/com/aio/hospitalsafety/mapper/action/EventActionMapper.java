package com.aio.hospitalsafety.mapper.action;

import com.aio.hospitalsafety.dto.action.ActionHistoryRow;
import com.aio.hospitalsafety.dto.action.EventWard;
import com.aio.hospitalsafety.dto.action.TodayEventRow;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/** 감지 이벤트의 조치 이력(TB_EVENT_ACTION) 조회와 저장 */
@Mapper
public interface EventActionMapper {

    /**
     * 확정 낙상과 그 조치 이력을 최신순으로 조회한다(조치 이력 화면은 낙상 감지만 보여 준다).
     * wardId 가 null 이면 병원 전체(관리자 화면), 값이 있으면 그 병동만(간호사 화면).
     */
    List<ActionHistoryRow> findActionHistory(
            @Param("hospitalId") String hospitalId,
            @Param("wardId") Long wardId,
            @Param("limit") int limit,
            // [2026.09.28] true 면 낙상 의심 가운데 조치가 등록된 것도 함께 돌려준다(관리자 홈 사고 현황용)
            @Param("includeSuspected") boolean includeSuspected);

    /** 병동의 오늘(한국 시각 0시부터) 감지 이벤트, 오래된 순 */
    List<TodayEventRow> findTodayEvents(
            @Param("hospitalId") String hospitalId,
            @Param("wardId") Long wardId);

    /** 이벤트가 난 병원·병동. 없는 이벤트면 null */
    EventWard findEventWard(@Param("eventId") String eventId);

    /** 조치를 저장한다. 이벤트당 1건이라 이미 있으면 저장하지 않고 0 을 돌려준다. */
    int insertEventAction(
            @Param("eventId") String eventId,
            @Param("handlerId") String handlerId,
            @Param("patientName") String patientName,
            @Param("actionContent") String actionContent);

    /** 낙상 의심 경보에 대응 등록하면 확정 낙상으로 승격해 사고 영상 보관함에 남긴다. */
    int promoteSuspectedFall(@Param("eventId") String eventId);
}
