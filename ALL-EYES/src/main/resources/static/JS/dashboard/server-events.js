"use strict";

/* [2026.09.26 추가] 대시보드와 서버의 감지 알림 연결입니다.
   1) 화면을 열면 GET /api/dashboard/events 로 우리 병동의 오늘 감지 이벤트를 불러와 상태를 되살립니다(음성 없음).
      [2026.09.27] 조치가 없는 확정 낙상은 어제 것이라도 24시간 안이면 함께 옵니다. 실패하면 5초 뒤 다시 불러옵니다.
      [2026.09.28] 24시간 안 확정 낙상은 조치가 있어도 함께 옵니다(끊긴 동안 다른 화면이 처리한 어제 경보를 끄려고).
   2) /ws 에 접속해 /topic/wards/{병동ID}/events 를 구독하고, 새 알림을 window.CareGuard.receiveServerEvent 로 넘깁니다.
   3) 연결이 끊기면 1초, 2초, 4초 … 최대 30초 뒤 다시 접속하고, 끊긴 동안 놓친 이벤트를 다시 불러와 채웁니다.
   STOMP 는 글자로 된 약속이라 별도 라이브러리 없이 필요한 명령(CONNECT, SUBSCRIBE)만 직접 보냅니다.
   하트비트는 쓰지 않습니다(heart-beat:0,0).
   Live Server 미리보기(서버 주소 없음)와 병동이 없는 계정에서는 아무것도 하지 않습니다.
   dashboard.js 가 window.CareGuard 를 만든 뒤에 실행되도록 dashboard.js 다음에 불러옵니다. */
document.addEventListener("DOMContentLoaded", () => {
  const data = document.body.dataset;
  const careGuard = window.CareGuard;
  if (!data.sessionUrl || !data.wardId || !data.eventsUrl || !data.wsUrl || !careGuard?.receiveServerEvents) return;

  const topic = `/topic/wards/${data.wardId}/events`;
  const socketUrl = new URL(data.wsUrl, window.location.href);
  socketUrl.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

  let socket = null;
  let retryDelay = 1000;
  let retryTimer = null;
  let active = true;
  let restored = false;
  let reloadTimer = null;
  let connectedAt = 0;
  // 오늘 이벤트 조회는 한 번에 하나씩 차례로 실행합니다. 첫 조회(음성 없음)보다 다시 채우기가 먼저 끝나지 않게 합니다.
  let loading = Promise.resolve();

  function loadTodayEvents() {
    loading = loading.then(async () => {
      let ok = false;
      try {
        const response = await fetch(data.eventsUrl, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" }
        });
        const events = response.ok && !response.redirected ? await response.json() : null;
        if (Array.isArray(events)) {
          // 처음 불러온 이전 경보는 음성 없이 되살리고, 다시 접속한 뒤 새로 찾은 경보는 새 알림처럼 알립니다.
          careGuard.receiveServerEvents(events, { restore: !restored });
          ok = true;
        }
      } catch (error) {
        console.warn("오늘 감지 이벤트를 불러오지 못했습니다.", error);
      }
      // [2026.09.27] 첫 '시도'가 끝나면 복원은 끝난 것으로 봅니다. 첫 조회가 실패해도 그 뒤에 찾은 경보는 새 경보처럼 알립니다.
      restored = true;
      // [2026.09.27] 실패하면 5초 뒤 다시 불러옵니다. 이 조회가 끊긴 동안 놓친 경보를 채우는 유일한 길입니다.
      if (!ok && active) {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(loadTodayEvents, 5000);
      }
    });
    return loading;
  }

  // [2026.09.29] 조치 이력(대시보드 안의 iframe)은 실시간 알림을 직접 받지 않으므로, 알림이 오면 여기서 다시 불러오게 합니다.
  // 서버가 이벤트를 저장한 뒤 알리지만 여러 건이 몰릴 수 있어 1초 모아서 한 번만 부릅니다. 닫혀 있으면 다시 열 때 dashboard.js 가 불러옵니다.
  let recordReloadTimer = null;
  function scheduleRecordReload() {
    clearTimeout(recordReloadTimer);
    recordReloadTimer = setTimeout(() => {
      const recordView = document.getElementById("dashboard-record-view");
      const recordFrame = document.getElementById("dashboard-record-frame");
      if (!recordView || recordView.hidden || !recordFrame?.dataset.loaded) return;
      recordFrame.contentWindow?.CareGuardRecordPage?.reload({ silent: true });
    }, 1000);
  }

  function frame(command, headers) {
    return `${command}\n${Object.entries(headers).map(([name, value]) => `${name}:${value}`).join("\n")}\n\n\u0000`;
  }

  function handleFrame(text) {
    const headerEnd = text.indexOf("\n\n");
    const head = (headerEnd < 0 ? text : text.slice(0, headerEnd)).replace(/\r/g, "").split("\n");
    const command = head[0];
    const body = headerEnd < 0 ? "" : text.slice(headerEnd + 2);

    if (command === "CONNECTED") {
      socket.send(frame("SUBSCRIBE", { id: "ward-events", destination: topic }));
      connectedAt = Date.now();
      // 구독한 뒤 오늘 이벤트를 다시 불러와, 접속하기 전이나 끊긴 동안 생긴 이벤트를 채웁니다(같은 ID는 한 번만 반영).
      loadTodayEvents();
      // [2026.09.27] 서버가 구독을 등록하는 순간과 조회가 겹치는 틈을 메우려고 3초 뒤 한 번 더 불러옵니다.
      setTimeout(() => { if (socket && active) loadTodayEvents(); }, 3000);
    } else if (command === "MESSAGE") {
      try {
        const event = JSON.parse(body);
        careGuard.receiveServerEvent(event);
        // [2026.09.29] 조치 이력 화면이 열려 있으면 새 낙상·조치 등록 알림 때 목록을 바로 다시 불러옵니다(침대 이탈은 조치 이력에 없어서 제외).
        if (event?.eventType !== "BED_EXIT") scheduleRecordReload();
      } catch (error) {
        console.warn("감지 알림을 읽지 못했습니다.", error);
      }
    } else if (command === "ERROR") {
      // 서버가 접속이나 구독을 거절했습니다(로그아웃, 병동 변경 등). 연결을 닫고 잠시 뒤 다시 시도합니다.
      console.warn("대시보드 알림 연결이 거절되었습니다.", head.find(line => line.startsWith("message:")) ?? "");
      socket.close();
    }
  }

  function connect() {
    clearTimeout(retryTimer);
    if (!active || socket) return;
    const current = new WebSocket(socketUrl.href, ["v12.stomp"]);
    socket = current;
    current.onopen = () => current.send(frame("CONNECT", { "accept-version": "1.2", host: window.location.hostname, "heart-beat": "0,0" }));
    current.onmessage = event => {
      // 한 메시지에 여러 프레임이 올 수 있어 끝 표시(\0)로 나눕니다. 빈 줄만 있는 것은 연결 유지 신호입니다.
      for (const text of String(event.data).split("\u0000")) {
        if (text.trim()) handleFrame(text.replace(/^\n+/, ""));
      }
    };
    current.onclose = () => {
      if (socket !== current) return;
      socket = null;
      if (!active) return;
      // [2026.09.27] 10초 넘게 잘 붙어 있다가 끊긴 경우만 1초부터 다시 시작합니다.
      // 접속 직후 구독이 거절되는 경우(병동 변경 등)에는 간격을 계속 늘려 매초 반복하지 않게 합니다.
      if (connectedAt && Date.now() - connectedAt > 10_000) retryDelay = 1000;
      connectedAt = 0;
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30_000);
    };
  }

  window.addEventListener("pagehide", () => {
    active = false;
    clearTimeout(retryTimer);
    socket?.close();
  });
  window.addEventListener("pageshow", event => {
    // 뒤로 가기로 복원된 화면은 다시 접속하고 빠진 이벤트를 채웁니다.
    if (!event.persisted) return;
    active = true;
    retryDelay = 1000;
    connect();
  });
  window.addEventListener("online", () => {
    retryDelay = 1000;
    connect();
  });

  // [2026.09.28 추가] 대시보드가 409(다른 직원이 먼저 조치 등록) 뒤 오늘 기록을 서버와 맞출 때 부릅니다(dashboard.js reloadAfterConflict).
  window.CareGuardServerEvents = { reload: loadTodayEvents };

  loadTodayEvents();
  connect();
});
