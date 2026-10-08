package com.aio.hospitalsafety.service.action;

import com.aio.hospitalsafety.common.RoomNumbers;
import com.aio.hospitalsafety.common.SeoulTimes;
import com.aio.hospitalsafety.dto.action.ActionHistoryResponse;
import com.aio.hospitalsafety.dto.action.ActionHistoryRow;
import com.aio.hospitalsafety.dto.action.EventActionRequest;
import com.aio.hospitalsafety.dto.action.EventWard;
import com.aio.hospitalsafety.dto.action.TodayEventResponse;
import com.aio.hospitalsafety.mapper.action.EventActionMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Set;

/**
 * 조치 이력 조회와 대응 등록.
 * 병원·병동 범위는 브라우저 입력이 아니라 로그인 정보로 정한다.
 */
@Service
public class EventActionService {

    // 조치 이력 화면이 한 번에 받는 최대 건수
    private static final int HISTORY_LIMIT = 1000;

    // 조치 이력 화면의 종류 이름 (대시보드 상태 이름과 같다)
    private static final String FALL_CONFIRMED_LABEL = "낙상 감지";
    private static final String FALL_SUSPECTED_LABEL = "낙상 의심";

    // [2026.09.28] 대시보드 '확인' 버튼이 남기는 조치 문구(dashboard.js 의 FALSE_ALARM_BODY·confirmServerAlerts).
    // EventActionMapper.xml 의 dismissed 와 같은 규칙이다. 문구를 바꾸면 세 곳을 함께 바꾼다.
    private static final Set<String> DISMISS_PATIENT_NAMES = Set.of("오경보", "확인");
    private static final Set<String> DISMISS_ACTION_CONTENTS = Set.of("오경보 확인", "낙상 의심 확인", "침대 이탈 확인");

    private final EventActionMapper eventActionMapper;

    public EventActionService(EventActionMapper eventActionMapper) {
        this.eventActionMapper = eventActionMapper;
    }

    /**
     * 조치 이력 목록.
     * wardId 가 null 이면 병원 전체(관리자), 값이 있으면 그 병동만(간호사).
     */
    @Transactional(readOnly = true)
    public List<ActionHistoryResponse> findActionHistory(String hospitalId, Long wardId) {
        return findActionHistory(hospitalId, wardId, false);
    }

    /**
     * [2026.09.28] includeSuspected 가 true 면 조치가 등록된 낙상 의심도 함께 돌려준다(관리자 홈 사고 현황용).
     * 조치 이력 화면은 지금처럼 확정 낙상만 받는다(includeSuspected = false).
     */
    @Transactional(readOnly = true)
    public List<ActionHistoryResponse> findActionHistory(String hospitalId, Long wardId, boolean includeSuspected) {
        return eventActionMapper.findActionHistory(hospitalId, wardId, HISTORY_LIMIT, includeSuspected)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /** 대시보드를 새로 열었을 때 불러오는 병동의 오늘 감지 이벤트(+ 24시간 안의 확정 낙상, EventActionMapper.xml) */
    @Transactional(readOnly = true)
    public List<TodayEventResponse> findTodayEvents(String hospitalId, Long wardId) {
        return eventActionMapper.findTodayEvents(hospitalId, wardId)
                .stream()
                .map(row -> new TodayEventResponse(
                        row.eventId(),
                        RoomNumbers.forDashboard(row.locationType(), row.locationName()),
                        row.locationName(),
                        SeoulTimes.withOffset(row.eventAt()),
                        row.eventType(),
                        row.decisionSt(),
                        row.handled(),
                        row.dismissed()))
                .toList();
    }

    /**
     * [2026.09.28] 이 조치가 대시보드 '확인'(확정 낙상은 오경보) 기록인지.
     * 저장할 때와 같이 앞뒤 공백을 뺀 값으로 본다(registerAction 의 trim).
     */
    public static boolean isDismissal(String patientName, String actionContent) {
        return patientName != null && actionContent != null
                && DISMISS_PATIENT_NAMES.contains(patientName.trim())
                && DISMISS_ACTION_CONTENTS.contains(actionContent.trim());
    }

    /**
     * 대응 등록. 자기 병동에서 난 이벤트에만 등록할 수 있고, 이벤트당 1건이다.
     */
    @Transactional
    public void registerAction(
            String eventId,
            String hospitalId,
            Long userWardId,
            String userId,
            EventActionRequest request) {

        EventWard eventWard = eventActionMapper.findEventWard(eventId);
        if (eventWard == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "감지 이벤트를 찾을 수 없습니다.");
        }
        boolean sameWard = eventWard.hospitalId().equals(hospitalId)
                && eventWard.wardId().equals(userWardId);
        if (!sameWard) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "담당 병동의 이벤트만 조치를 등록할 수 있습니다.");
        }

        int inserted = eventActionMapper.insertEventAction(
                eventId,
                userId,
                request.patientName().trim(),
                request.actionContent().trim());
        if (inserted == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 조치가 등록된 이벤트입니다.");
        }
        // [2026.09.29 변경] 낙상 의심은 대응 등록이 완료된 경우에만 확정 낙상으로 바꿔 사고 영상 보관함에 남깁니다.
        // [2026.09.29 병합] 대시보드 '확인'(낙상 의심 확인)·오경보는 대응 등록이 아니므로 바꾸지 않는다(이때 영상도 지워진다).
        if (!isDismissal(request.patientName().trim(), request.actionContent().trim())) {
            eventActionMapper.promoteSuspectedFall(eventId);
        }
    }

    private ActionHistoryResponse toResponse(ActionHistoryRow row) {
        boolean done = row.actionAt() != null;
        return new ActionHistoryResponse(
                row.eventId(),
                SeoulTimes.screenMinute(row.eventAt()),
                row.locationName(),
                nullToEmpty(row.patientName()),
                // 기본은 확정 낙상만 조회하므로(EventActionMapper.xml) 종류는 "낙상 감지" 다. record.js 는 이 줄만 보여 준다.
                // [2026.09.28] 관리자 홈이 낙상 의심까지 부를 때는 "낙상 의심" 으로 표시한다.
                "SUSPECTED".equals(row.decisionSt()) ? FALL_SUSPECTED_LABEL : FALL_CONFIRMED_LABEL,
                nullToEmpty(row.staffName()),
                done ? "완료" : "미확인",
                SeoulTimes.screenMinute(row.actionAt()),
                nullToEmpty(row.actionContent()),
                nullToEmpty(row.wardName()),
                // [2026.09.29 변경] 영상이 없는 기존 사고도 동일한 API로 조회할 수 있도록 빈 값으로 반환합니다.
                nullToEmpty(row.videoUrl()),
                Boolean.TRUE.equals(row.videoViewed()),
                Boolean.TRUE.equals(row.dismissed()));
    }

    private String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
