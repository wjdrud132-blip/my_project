package com.aio.hospitalsafety.dto.action;

/**
 * 조치 이력 화면(record.js)이 받는 한 줄. 화면 계약에 맞춰 모두 문자열이다.
 *
 * occurredAt, completedAt: "2026-09-25T14:30" (한국 시각, 없으면 "")
 * type: "낙상 감지"(확정 낙상). 관리자 홈이 includeSuspected=true 로 부르면 대응 등록한 "낙상 의심"도 온다(조치 이력 화면은 낙상 감지만 받는다)
 * status: "완료"(조치 등록됨) / "미확인"
 */
public record ActionHistoryResponse(
        String eventId,
        String occurredAt,
        String room,
        String patient,
        String type,
        String staff,
        String status,
        String completedAt,
        String actionContent,
        // [2026.09.27] 병동 이름(예: "3병동"). 관리자 홈의 병동별 사고 현황에 쓴다. record.js 는 쓰지 않는다.
        String wardName,
        // [2026.09.29 변경] 사고 영상 보관함이 재생할 저장 영상 주소입니다. 없으면 빈 문자열입니다.
        String videoUrl,
        // [2026.09.29] 영상 보관함의 '확인 완료' 기준: 관리자가 재생 버튼을 누른 적이 있으면 true. status(조치 등록 기준)와 별개다.
        boolean videoViewed,
        // [2026.09.28] 대시보드 '확인' 버튼으로 처리한 기록이면 true(확정 낙상 = 오경보, 낙상 의심 = 확인). 관리자 홈 사고 현황에서 뺀다.
        boolean dismissed
) {
}
