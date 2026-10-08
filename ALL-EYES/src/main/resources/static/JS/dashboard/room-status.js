"use strict";

/* [09.13]추가내용: 병실 상태 데이터와 상태명을 대시보드 공통 설정으로 분리합니다. */
const dashboardWardNumber = Number(document.body.dataset.wardNumber);
const dashboardRoomStart = dashboardWardNumber * 100 + 1;
// [2026.09.26 추가] 서버로 연 화면(로그인 세션 주소가 주입됨)은 예시 경보 없이 모두 정상으로 시작하고,
// 서버의 오늘 감지 이벤트로 상태를 채웁니다(server-events.js). Live Server 미리보기는 기존 예시 상태를 유지합니다.
const dashboardServerMode = Boolean(document.body.dataset.sessionUrl);
window.CareGuardRoomStatus = {
  roomStart: dashboardRoomStart,
  serverMode: dashboardServerMode,
  rooms: new Map(Array.from({length:[1,2,3].includes(dashboardWardNumber)?17:0}, (_,i) => [dashboardRoomStart+i, {
    // [2026.09.22 추가] 8번째 병실을 보라색 '낙상 의심' 예시 상태로 표시합니다.
    number:dashboardRoomStart+i, status:dashboardServerMode?"normal":i===4?"urgent":i===7?"suspected":i===11?"caution":"normal", acknowledged:false
  }])),
  labels: {normal:"정상", caution:"침대 이탈", suspected:"낙상 의심", urgent:"낙상 감지"}
};

/* 현재 예시 경보와 수신 이벤트의 이력입니다. 서버 연결 시 당일 이력을 적재합니다. */
(() => {
  const state = window.CareGuardRoomStatus;
  const events = new Map();
  const dateFormat = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
  });
  state.dayKey = value => dateFormat.format(new Date(value));
  // [2026.09.17] 고친 내용: 가상 감지 기록을 구분하여 테스트 초기화 시 해당 기록만 제거합니다.
  // [2026.09.28 추가] handled: 조치가 등록됨, dismissed: 그 조치가 '확인'(확정 낙상은 오경보)이라 사고가 아님
  state.addEvent = ({id, room, type, occurredAt = Date.now(), test = false, handled = false, dismissed = false}) => {
    const time = new Date(occurredAt).getTime();
    if (id == null || !String(id).trim() || !state.rooms.has(Number(room)) ||
        !["urgent", "suspected", "caution"].includes(type) || !Number.isFinite(time)) return false;
    const key = String(id);
    if (events.has(key)) return false;
    events.set(key, {room: Number(room), type, occurredAt: time, test, handled: Boolean(handled), dismissed: Boolean(dismissed)});
    return true;
  };
  // [2026.09.28 추가] 이미 기억한 이벤트에 조치가 등록되면 표시를 바꿉니다. 모르는 이벤트면 false 입니다.
  // 이벤트당 조치는 1건뿐이라, 한 번 '확인'·오경보로 표시되면 뒤늦게 온 다른 값으로 되돌리지 않습니다
  // (서버 알림과 이 화면의 저장 응답이 오는 순서에 따라 결과가 바뀌지 않게).
  state.markHandled = (id, dismissed = false) => {
    const event = events.get(String(id));
    if (!event) return false;
    event.handled = true;
    event.dismissed = event.dismissed || Boolean(dismissed);
    return true;
  };
  state.clearTestEvents = () => {
    for (const [id, event] of events) if (event.test) events.delete(id);
  };
  // [2026.09.28 변경] 낙상 감지는 오경보, 낙상 의심은 '확인'으로 끈 것을 세지 않습니다(판정 문구는 관리자 홈 사고 현황과 같음).
  // 아직 처리하지 않은 경보는 판단 전이라 셉니다. 침대 이탈은 대응 등록 버튼이 없어 '확인'이 곧 헛경보라는 뜻이 아니므로 확인해도 계속 셉니다.
  state.todayCounts = (number, now = Date.now()) => {
    const counts = {urgent: 0, suspected: 0, caution: 0};
    const today = state.dayKey(now);
    for (const event of events.values()) {
      if (event.room === Number(number) && state.dayKey(event.occurredAt) === today && event.occurredAt <= now &&
          !(event.dismissed && event.type !== "caution")) {
        counts[event.type]++;
      }
    }
    return counts;
  };
  // [2026.09.28 추가] '최근 기록'에 띄우는 사고: 오경보가 아닌 낙상 감지, 또는 대응 등록한 낙상 의심(관리자 홈 사고 현황과 같은 기준)
  state.isIncident = event => Boolean(event) && !event.dismissed &&
    (event.type === "urgent" || (event.type === "suspected" && event.handled));
  state.latestTodayIncident = (number, now = Date.now()) => {
    let latest = null;
    const today = state.dayKey(now);
    for (const event of events.values()) {
      if (event.room === Number(number) && state.dayKey(event.occurredAt) === today && event.occurredAt <= now &&
          state.isIncident(event) && (!latest || event.occurredAt > latest.occurredAt)) latest = event;
    }
    return latest ? {...latest} : null;
  };
  // [2026.09.16] 추가한 내용: 선택 병실의 오늘 기록 중 실제 발생 시각이 가장 최근인 이벤트를 조회합니다.
  state.latestTodayEvent = (number, now = Date.now()) => {
    let latest = null;
    const today = state.dayKey(now);
    for (const event of events.values()) {
      if (event.room === Number(number) && state.dayKey(event.occurredAt) === today &&
          event.occurredAt <= now && (!latest || event.occurredAt > latest.occurredAt)) latest = event;
    }
    return latest ? {...latest} : null;
  };
  // 기존 화면 예시 경보만 오늘의 예시 이력으로 초기화합니다. 새로고침하면 예시 상태로 돌아갑니다.
  for (const room of state.rooms.values()) {
    if (room.status === "normal") continue;
    room.eventId = `demo-${room.number}-${state.dayKey(Date.now())}`;
    state.addEvent({id: room.eventId, room: room.number, type: room.status});
  }
})();
