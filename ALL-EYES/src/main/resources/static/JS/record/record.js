"use strict";

/* ==================================================
   기본 설정
   ================================================== */

/*
 * true: 화면 확인용 예시 데이터 사용
 * false: 서버 API 사용
 * [2026.09.27] 서버(Spring Boot)로 연 화면은 initializePage 에서 false 로 바꿉니다.
 *              Live Server 미리보기는 그대로 예시 데이터를 씁니다.
 */
const settings = {
  useDemoData: true,
  demoToday: "2026-08-25"
};

/*
 * 전체 병실 목록
 * 실제 병원 병실 구성에 맞게 수정하세요.
 */
// [2026.09.17] 고친 내용: 병실 필터를 317호까지 확장하고 두 화장실 앞 감지 위치를 추가합니다.
// [2026.09.27] 예시 데이터(Live Server)에서 쓰는 목록입니다. 서버 기록은 기록에 있는 병실로 목록을 만듭니다.
const defaultRoomNumbers = [
  "301호", "302호", "303호", "304호",
  "305호", "306호", "307호", "308호",
  "309호", "310호", "311호", "312호",
  "313호", "314호", "315호", "316호", "317호",
  "301호 화장실 앞", "310호 화장실 앞"
];

/*
 * 화면 확인용 예시 기록
 * 백엔드 연결 후에는 API 응답을 사용합니다.
 */
const demoRecords = [
  ["2026-08-25T14:41", "306호", "김OO", "낙상 감지", "", "미확인", ""],
  /* [2026.09.22] 조치 이력에는 낙상 감지 기록만 표시합니다. */
  ["2026-08-25T14:37", "307호", "박OO", "낙상 감지", "정OO", "완료", "2026-08-25T14:42", "[예시] 조치 등록에서 작성한 내용입니다.\n줄바꿈도 그대로 표시됩니다."],
  ["2026-08-25T14:10", "302호", "정OO", "낙상 감지", "임OO", "완료", "2026-08-25T14:17"],
  ["2026-08-24T18:32", "304호", "윤OO", "낙상 감지", "이OO", "완료", "2026-08-24T18:38"],
  ["2026-08-24T11:47", "301호", "오OO", "낙상 감지", "김OO", "완료", "2026-08-24T11:53"],
  ["2026-08-23T19:26", "308호", "배OO", "낙상 감지", "박OO", "완료", "2026-08-23T19:31"]
].map(([
  occurredAt,
  room,
  patient,
  type,
  staff,
  status,
  completedAt,
  /* [추가] 여덟 번째 배열 값은 작성 내용입니다. 없으면 빈 문자열입니다. */
  actionContent = ""
]) => ({
  occurredAt,
  room,
  patient,
  type,
  staff,
  status,
  completedAt,
  /* [추가] 기록 내용 아이콘에서 읽는 필드 */
  actionContent
}));

/* HTML을 모두 읽은 뒤 실행합니다. */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePage, {
    once: true
  });
} else {
  initializePage();
}

/* ==================================================
   화면 초기화
   ================================================== */

function initializePage() {
  /* 기본 화면 요소 */
  const historyPage = document.querySelector("#history-page");
  const searchForm = document.querySelector("#search-form");
  const recordList = document.querySelector("#record-list");
  const resultMessage = document.querySelector("#result-message");
  const tableScroll = document.querySelector(".table-scroll");
  const recordPagination = document.querySelector("#record-pagination");
  const periodFilter = document.querySelector("#period-filter");

  // [2026.09.27 추가] 서버가 그린 화면에만 data-server-mode 가 있습니다. 이때는 서버 기록을 불러옵니다.
  if (historyPage.dataset.serverMode === "true") {
    settings.useDemoData = false;
  }

  /* 기간 달력 */
  const calendarDialog = document.querySelector("#calendar-dialog");
  const calendarMonth = document.querySelector("#calendar-month");
  const calendarDays = document.querySelector("#calendar-days");
  const calendarHelp = document.querySelector("#calendar-help");
  const previousMonthButton = document.querySelector("#previous-month");
  const nextMonthButton = document.querySelector("#next-month");
  const cancelCalendarButton = document.querySelector("#calendar-cancel");
  const confirmCalendarButton = document.querySelector("#calendar-confirm");

  /* 내보내기 팝업 */
  const exportButton = document.querySelector("#export-button");
  const exportDialog = document.querySelector("#export-dialog");
  const exportForm = document.querySelector("#export-form");
  const exportCount = document.querySelector("#export-count");
  const exportNote = document.querySelector("#export-note");
  const exportError = document.querySelector("#export-error");
  const exportSubmit = document.querySelector("#export-submit");

  /* [수정] 삭제된 로그아웃 버튼은 조회하거나 이벤트를 연결하지 않습니다. */

  /* 전체 기록과 현재 검색 결과 */
  let allRecords = [];
  let filteredRecords = [];
  // [2026-09-18] 추가 내용: 페이지를 넘겨도 선택을 유지하고, 내보내기 팝업의 대상을 고정합니다.
  const selectedRecords = new Set();
  let exportRecords = [];
  const selectPageCheckbox = document.querySelector("#record-select-page");
  const exportButtonLabel = document.querySelector("#export-button-label");
  // [2026-09-18] 추가 내용: 검색 결과와 선택 목록을 분리하여 검색 밖의 선택도 유지합니다.
  let selectedOnly = false;
  let liveSearchTimer;
  const selectedViewButton = document.querySelector("#record-selected-view");
  const clearSelectionButton = document.querySelector("#record-clear-selection");
  const selectionSummary = document.querySelector("#record-selection-summary");

  // [2026.10.01 변경] 조치 이력은 미확인 기록을 항상 위에 고정하고, 각 그룹 안에서는 최신 발생시각부터 표시합니다.
  function sortRecordsByStatusAndTime(records) {
    return [...records].sort((a, b) => {
      const aPending = a.status === "미확인";
      const bPending = b.status === "미확인";

      if (aPending !== bPending) {
        return aPending ? -1 : 1;
      }

      return b.occurredAt.localeCompare(a.occurredAt);
    });
  }

  function getVisibleRecords() {
    return selectedOnly ? allRecords.filter(record => selectedRecords.has(record)) : filteredRecords;
  }

  function updateRecordSelection() {
    const pageRecords = getVisibleRecords().slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage);
    const selectedOnPage = pageRecords.filter(record => selectedRecords.has(record)).length;
    selectPageCheckbox.disabled = isLoading || loadFailed || pageRecords.length === 0;
    selectPageCheckbox.checked = pageRecords.length > 0 && selectedOnPage === pageRecords.length;
    selectPageCheckbox.indeterminate = selectedOnPage > 0 && selectedOnPage < pageRecords.length;
    exportButtonLabel.textContent = selectedRecords.size ? `선택한 ${selectedRecords.size}건 내보내기` : "내보내기";
    selectedViewButton.textContent = selectedOnly ? "검색 결과로 돌아가기" : `선택한 ${selectedRecords.size}건 모아보기`;
    selectedViewButton.setAttribute("aria-pressed", String(selectedOnly));
    clearSelectionButton.disabled = selectedRecords.size === 0;
    const matching = new Set(filteredRecords);
    const hiddenCount = [...selectedRecords].filter(record => !matching.has(record)).length;
    selectionSummary.textContent = selectedRecords.size
      ? `총 ${selectedRecords.size}건 선택${hiddenCount ? ` · 현재 검색 밖 ${hiddenCount}건 포함` : ""}`
      : "검색 초기화 후에도 선택한 기록은 유지됩니다.";
  }

  function clearRecordSelection() {
    selectedRecords.clear();
    selectedOnly = false;
    currentPage = 1;
    renderRecords(filteredRecords);
  }

  /* [2026.09.29 변경] 전체화면에서 목록 여백을 줄이고 충분한 기록을 한 번에 확인하도록 18건씩 표시합니다. */
  const recordsPerPage = 18;
  let currentPage = 1;

  /* 조회 상태 */
  let isLoading = false;
  let loadFailed = false;

  /* 직접 설정 기간 */
  let selectedStart = "";
  let selectedEnd = "";
  let draftStart = "";
  let draftEnd = "";
  let displayedMonth;

  /* 드롭다운 컨트롤 */
  const dropdownControls = [];
  let periodControl;

  /* ==================================================
     날짜와 시각
     ================================================== */

  /* 한국의 오늘 날짜를 YYYY-MM-DD로 반환합니다. */
  function getKoreanToday() {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      })
        .formatToParts(new Date())
        .map(part => [part.type, part.value])
    );

    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  /* 예시 또는 실제 데이터 기준 날짜 */
  function getReferenceDay() {
    return settings.useDemoData
      ? settings.demoToday
      : getKoreanToday();
  }

  /* 최근 N일의 시작 날짜 */
  function getPeriodStart(endDay, days) {
    const start = new Date(`${endDay}T00:00:00Z`);

    start.setUTCDate(
      start.getUTCDate() - (days - 1)
    );

    return start.toISOString().slice(0, 10);
  }

  /* 달력 날짜를 YYYY-MM-DD로 변환합니다. */
  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  /* 상단 현재 시각 */
  function updateClock() {
    const now = new Date();

    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
      })
        .formatToParts(now)
        .map(part => [part.type, part.value])
    );

    const clock = document.querySelector("#current-time");

    clock.dateTime = now.toISOString();
    clock.textContent =
      `${parts.year}년 ${parts.month}월 ${parts.day}일 ` +
      `${parts.hour}:${parts.minute}`;
  }

  /* 표에 표시할 시간 */
  function formatTime(value) {
    if (!value) {
      return "-";
    }

    return (
      `${value.slice(5, 7)}.${value.slice(8, 10)} ` +
      value.slice(11, 16)
    );
  }

  /* ==================================================
     병실 목록
     ================================================== */

  /* 병실 목록을 버튼으로 만듭니다. */
  // [2026.09.27] 서버 기록을 쓸 때는 기록에 있는 병실·위치 목록을 받아서 만듭니다.
  function renderRoomOptions(roomNumbers = defaultRoomNumbers) {
    const roomOptions = document.querySelector("#room-options");

    roomOptions.replaceChildren();

    const rooms = [
      {
        value: "all",
        // [2026-09-18] 고친 내용: 필터 생성 후에도 병실·위치 문구를 유지합니다.
        label: "전체 병실·위치"
      },
      ...roomNumbers.map(room => ({
        value: room,
        label: room
      }))
    ];

    rooms.forEach(room => {
      const button = document.createElement("button");

      button.type = "button";
      button.dataset.value = room.value;
      button.textContent = room.label;

      roomOptions.append(button);
    });
  }

  /* ==================================================
     드롭다운
     ================================================== */

  /*
   * 기간·병실·처리 상태·검색 대상에
   * 공통 드롭다운 기능을 연결합니다.
   */
  function createDropdown({
    root,
    trigger,
    menu,
    input,
    label,
    optionAttribute,
    onSelect
  }) {
    function getOptions() {
      return Array.from(
        menu.querySelectorAll(`button[${optionAttribute}]`)
      );
    }

    function getValue(option) {
      return option.getAttribute(optionAttribute);
    }

    function updateLabel() {
      const selected = getOptions().find(
        option => getValue(option) === input.value
      );

      if (selected) {
        label.textContent = selected.textContent.trim();
      }
    }

    function close(returnFocus = false) {
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");

      if (returnFocus) {
        trigger.focus();
      }
    }

    const controller = {
      root,
      trigger,
      close,
      updateLabel
    };

    function open() {
      dropdownControls.forEach(control => {
        if (control !== controller) {
          control.close();
        }
      });

      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");

      const selected = getOptions().find(
        option => getValue(option) === input.value
      );

      (selected || getOptions()[0])?.focus();
    }

    trigger.addEventListener("click", () => {
      if (menu.hidden) {
        open();
      } else {
        close();
      }
    });

    menu.addEventListener("click", event => {
      const option = event.target.closest(
        `button[${optionAttribute}]`
      );

      if (!option) {
        return;
      }

      const value = getValue(option);

      close(true);

      /*
       * 직접 설정은 달력에서 확인한 뒤 적용합니다.
       * false를 반환하면 현재 필터 값을 변경하지 않습니다.
       */
      if (onSelect && onSelect(value) === false) {
        return;
      }

      input.value = value;
      updateLabel();
      // [2026-09-18] 고친 내용: 조건 변경 시 결과만 갱신하고 선택은 그대로 둡니다.
      applyFilters();
    });

    root.addEventListener("keydown", event => {
      if (event.key === "Escape" && !menu.hidden) {
        event.preventDefault();
        close(true);
      }

      if (
        event.target === trigger &&
        event.key === "ArrowDown"
      ) {
        event.preventDefault();
        open();
      }
    });

    root.addEventListener("focusout", event => {
      if (!root.contains(event.relatedTarget)) {
        close();
      }
    });

    close();
    updateLabel();
    dropdownControls.push(controller);

    return controller;
  }

  /* 모든 버튼형 필터를 연결합니다. */
  function setupDropdowns() {
    periodControl = createDropdown({
      root: document.querySelector("#period-dropdown"),
      trigger: document.querySelector("#period-button"),
      menu: document.querySelector("#period-options"),
      input: periodFilter,
      label: document.querySelector("#period-label"),
      optionAttribute: "data-period",

      onSelect(value) {
        if (value === "custom") {
          openCalendar();
          return false;
        }

        return true;
      }
    });

    document.querySelectorAll(".choice-dropdown").forEach(root => {
      createDropdown({
        root,
        trigger: root.querySelector(".choice-button"),
        menu: root.querySelector(".choice-options"),
        input: root.querySelector("input[type='hidden']"),
        label: root.querySelector(".choice-label"),
        optionAttribute: "data-value"
      });
    });

    document.addEventListener("click", event => {
      dropdownControls.forEach(control => {
        if (!control.root.contains(event.target)) {
          control.close();
        }
      });
    });
  }

  /* ==================================================
     표 출력
     ================================================== */

  /* 텍스트 셀을 만듭니다. */
  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value;

    return cell;
  }

  /*
   * [추가] 기록 내용 열을 만듭니다.
   * [수정] 완료된 기록에는 내용 유무와 관계없이 아이콘을 표시합니다.
   * 미완료 행도 td를 생성하여 8개 열을 유지합니다.
   */
  function createRecordContentCell(record) {
    const cell = document.createElement("td");
    cell.className = "record-content-cell";

    /*
     * [추가] 실제 API가 조치 등록 내용을 actionContent로 반환해야 합니다.
     * 서버 필드명이 다르면 아래 record.actionContent를 변경하세요.
     * 누락된 내용은 빈 값으로 처리하며 임의의 조치 내용을 만들지 않습니다.
     */
    const content = typeof record.actionContent === "string"
      ? record.actionContent
      : "";

    /* [수정] 아이콘 표시 여부는 작성 내용이 아닌 완료 상태로 판단합니다. */
    if (record.status !== "완료") {
      const empty = document.createElement("span");
      empty.className = "record-content-empty";
      empty.textContent = "-";
      empty.setAttribute("aria-label", "조치 미완료");
      cell.append(empty);
      return cell;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "record-content-button";
    // [2026-09-18] 고친 내용: 상세 보기 버튼과 접근성 안내를 조치 내용으로 통일합니다.
    button.title = "조치 내용 보기";
    button.setAttribute("aria-label", `${record.room} ${record.patient} 조치 내용 보기`);
    button.setAttribute("aria-haspopup", "dialog");
    button.setAttribute("aria-controls", "record-content-dialog");

    /* [추가] 고정된 문서 아이콘입니다. 별도 이미지가 필요 없습니다. */
    button.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"
        aria-hidden="true" focusable="false">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"></path>
        <path d="M14 2v6h6"></path>
        <path d="M8 13h8M8 17h6"></path>
      </svg>
    `;

    button.addEventListener("click", () => {
      const dialog = document.querySelector("#record-content-dialog");
      const text = document.querySelector("#record-content-text");
      if (!dialog || !text) {
        window.alert("HTML에 조치 내용 팝업을 추가해주세요.");
        return;
      }

      /* [추가] 입력 내용을 HTML로 실행하지 않고 그대로 표시합니다. */
      /* [수정] 완료 상태라도 작성 내용이 비어 있으면 안내를 표시합니다. */
      text.textContent = content.trim()
        ? content
        : "등록된 조치 내용이 없습니다.";
      if (!dialog.open) {
        dialog.showModal();
      }
    });

    cell.append(button);
    return cell;
  }

  /* 표 안내 메시지 */
  function showTableMessage(message) {
    const row = document.createElement("tr");
    const cell = createCell(message);

    // [2026-09-18] 고친 내용: 선택 체크박스까지 9개 열에 안내를 표시합니다.
    cell.colSpan = 9;
    cell.className = "empty-message";

    row.append(cell);
    recordList.replaceChildren(row);
    resultMessage.textContent = message;
    updateRecordSelection();
  }

  /* 검색 결과를 표에 표시합니다. */
  function renderPagination(totalPages) {
    recordPagination.replaceChildren();

    if (totalPages <= 1) {
      return;
    }

    for (let page = 1; page <= totalPages; page++) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = page;
      button.setAttribute("aria-label", `${page}페이지`);

      if (page === currentPage) {
        button.setAttribute("aria-current", "page");
      }

      button.addEventListener("click", () => {
        currentPage = page;
        renderRecords(getVisibleRecords());
        tableScroll.scrollTop = 0;
      });

      recordPagination.append(button);
    }
  }

  function renderRecords(records) {
    if (records.length === 0) {
      showTableMessage(
        selectedOnly ? "선택한 조치 이력이 없습니다." : "검색 조건에 맞는 조치 이력이 없습니다."
      );
      recordPagination.replaceChildren();
      appendLimitNotice();
      return;
    }

    const totalPages = Math.ceil(records.length / recordsPerPage);
    currentPage = Math.min(currentPage, totalPages);
    const firstIndex = (currentPage - 1) * recordsPerPage;
    const pageRecords = records.slice(
      firstIndex,
      firstIndex + recordsPerPage
    );

    const rows = document.createDocumentFragment();

    pageRecords.forEach(record => {
      const row = document.createElement("tr");

      if (record.status === "완료") {
        row.className = "completed-row";
      }

      const typeCell = document.createElement("td");
      const badge = document.createElement("span");

      badge.className = "alert-badge";

      badge.classList.add("fall-badge");

      // [2026.09.28 변경] 오경보로 확인한 낙상은 일반 낙상과 구분할 수 있도록
      // 조치 이력의 표시 아이콘을 원형 대신 삼각형으로 보여줍니다.
      const isFalseAlarm = record.patient === "오경보" || record.actionContent === "오경보 확인";
      if (isFalseAlarm) {
        badge.classList.add("false-alarm-badge");
      }

      // [2026.09.20] 별도 점·배지 없이 유형명과 글자색만으로 구분합니다.
      badge.textContent = record.type;
      typeCell.append(badge);

      const statusCell = createCell(record.status);
      if (record.status === "완료") {
        const completeLabel = document.createElement("span");
        completeLabel.className = "record-complete-label";
        completeLabel.textContent = record.status;
        statusCell.replaceChildren(completeLabel);
      } else if (record.status === "미확인") {
        // [2026.10.01 변경] 완료와 미확인을 구분하기 위해 미확인 상태에는 별도 라벨 클래스를 적용합니다.
        const pendingLabel = document.createElement("span");
        pendingLabel.className = "record-pending-label";
        pendingLabel.textContent = record.status;
        statusCell.replaceChildren(pendingLabel);
      }

      row.append(
        // [2026-09-18] 추가 내용: 기록 객체별로 선택하여 같은 내용의 기록도 각각 선택할 수 있습니다.
        createRecordSelectionCell(record),
        createCell(formatTime(record.occurredAt)),
        createCell(record.room),
        createCell(record.patient),
        typeCell,
        createCell(record.staff),
        statusCell,
        createCell(formatTime(record.completedAt)),
        /* [추가] 완료된 모든 행에 문서 아이콘을 표시합니다. */
        createRecordContentCell(record)
      );

      rows.append(row);
    });

    recordList.replaceChildren(rows);
    renderPagination(totalPages);
    updateRecordSelection();

    resultMessage.textContent =
      selectedOnly ? `선택한 조치 이력 ${records.length}건입니다.` : `총 ${records.length}건의 조치 이력이 검색되었습니다.`;
    appendLimitNotice();
  }

  // [2026.09.27 추가] 서버는 최신 1000건까지만 돌려줍니다(EventActionService.HISTORY_LIMIT). 잘렸으면 알려 줍니다.
  // 결과가 0건일 때(오래된 기간을 고른 경우)에도 붙여서, 기록이 없던 것으로 오해하지 않게 합니다.
  function appendLimitNotice() {
    if (!settings.useDemoData && allRecords.length >= 1000) {
      resultMessage.textContent += " (최근 1000건까지만 불러와 그보다 오래된 기록은 보이지 않습니다.)";
    }
  }

  /* ==================================================
     검색
     ================================================== */

  /* 현재 필터 값을 읽습니다. */
  function readSearchConditions() {
    const formData = new FormData(searchForm);

    return {
      room: String(formData.get("room") || "all"),
      status: String(formData.get("status") || "all"),
      target: String(formData.get("target") || "all"),
      keyword: String(formData.get("keyword") || "")
        .trim()
        .toLocaleLowerCase()
    };
  }

  /* 병실·상태·이름 조건을 확인합니다. */
  function matchesConditions(record, conditions) {
    return window.CareGuardRecordFilter.matchesConditions(record, conditions);
  }

  /*
   * 화면 필터를 적용합니다.
   * 선택하지 않은 필터는 all이므로 전체로 처리됩니다.
   */
  function applyFilters({ keepView = false, keepPage = false } = {}) {
    clearTimeout(liveSearchTimer);
    if (isLoading || loadFailed) {
      return;
    }

    // [2026-09-18] 고친 내용: 검색·초기화는 조건만 바꾸며 선택 기록은 지우지 않습니다.
    if (!keepView) selectedOnly = false;

    const conditions = readSearchConditions();
    const period = periodFilter.value;

    const today = getReferenceDay();

    let startDay = "";
    let endDay = today;

    /*
     * 직접 설정을 선택한 경우에만
     * 시작일과 종료일을 검사합니다.
     */
    if (period === "custom") {
      if (!selectedStart || !selectedEnd) {
        return;
      }

      startDay = selectedStart;
      endDay = selectedEnd;
    } else if (period !== "all") {
      /*
       * 최근 7일 또는 최근 30일입니다.
       */
      startDay = getPeriodStart(
        endDay,
        Number(period)
      );
    }

    filteredRecords = sortRecordsByStatusAndTime(allRecords.filter(record => {
      const recordDate = record.occurredAt.slice(0, 10);

      const matchesPeriod =
        period === "all" ||
        (
          recordDate >= startDay &&
          recordDate <= endDay
        );

      return (
        matchesPeriod &&
        matchesConditions(record, conditions)
      );
    }));

    /* [9.15] 추가내용: 새 검색 결과는 항상 첫 페이지부터 표시합니다. */
    if (!keepPage) currentPage = 1;
    renderRecords(getVisibleRecords());

    /* 검색 후 스크롤을 맨 위로 이동합니다. */
    tableScroll.scrollTop = 0;
  }

  /* ==================================================
     기간 달력
     ================================================== */

  /* 달력에서 선택한 날짜를 표시합니다. */
  function updateCalendarSelection() {
    calendarDays
      .querySelectorAll("button")
      .forEach(button => {
        const date = button.dataset.date;

        const isEndpoint =
          date === draftStart ||
          date === draftEnd;

        const isInsideRange =
          draftEnd &&
          date > draftStart &&
          date < draftEnd;

        button.setAttribute(
          "aria-pressed",
          String(isEndpoint)
        );

        button.classList.toggle(
          "in-range",
          Boolean(isInsideRange)
        );
      });

    confirmCalendarButton.disabled =
      !draftStart || !draftEnd;

    if (!draftStart) {
      calendarHelp.textContent =
        "시작일과 종료일을 차례로 선택하세요.";
    } else if (!draftEnd) {
      calendarHelp.textContent =
        `${draftStart}부터 · 종료일을 선택하세요.`;
    } else {
      calendarHelp.textContent =
        `${draftStart} ~ ${draftEnd}`;
    }
  }

  /* 현재 달력의 날짜 버튼을 만듭니다. */
  function renderCalendar() {
    const year = displayedMonth.getFullYear();
    const month = displayedMonth.getMonth();

    calendarMonth.textContent =
      `${year}년 ${month + 1}월`;

    calendarDays.replaceChildren();

    const firstWeekday =
      new Date(year, month, 1).getDay();

    const lastDay =
      new Date(year, month + 1, 0).getDate();

    /* 월 시작 전 빈칸 */
    for (let i = 0; i < firstWeekday; i++) {
      const blank = document.createElement("span");

      blank.setAttribute("aria-hidden", "true");
      calendarDays.append(blank);
    }

    /* 날짜 버튼 */
    for (let day = 1; day <= lastDay; day++) {
      const key = dateKey(
        new Date(year, month, day)
      );

      const button = document.createElement("button");

      button.type = "button";
      button.textContent = day;
      button.dataset.date = key;

      button.setAttribute(
        "aria-label",
        `${year}년 ${month + 1}월 ${day}일`
      );

      button.addEventListener("click", () => {
        if (!draftStart || draftEnd) {
          draftStart = key;
          draftEnd = "";
        } else {
          [draftStart, draftEnd] =
            [draftStart, key].sort();
        }

        updateCalendarSelection();
      });

      calendarDays.append(button);
    }

    updateCalendarSelection();
  }

  /* 직접 설정 달력을 엽니다. */
  function openCalendar() {
    if (calendarDialog.open) {
      return;
    }

    draftStart = selectedStart;
    draftEnd = selectedEnd;

    const initialDate =
      selectedStart || getKoreanToday();

    const [year, month] =
      initialDate.split("-").map(Number);

    displayedMonth = new Date(
      year,
      month - 1,
      1
    );

    renderCalendar();
    calendarDialog.showModal();
  }

  /* 달력 취소 */
  function cancelCalendar() {
    calendarDialog.close();
    periodControl.trigger.focus();
  }

  /* 달력 확인 */
  function confirmCalendar() {
    if (!draftStart || !draftEnd) {
      return;
    }

    selectedStart = draftStart;
    selectedEnd = draftEnd;

    periodFilter.value = "custom";
    periodControl.updateLabel();

    calendarDialog.close();
    periodControl.trigger.focus();

    applyFilters();
  }

  /* ==================================================
     내보내기
     ================================================== */

  /* 현재 선택한 파일 형식을 반환합니다. */
  function getExportFormat() {
    return exportForm.querySelector(
      'input[name="format"]:checked'
    ).value;
  }

  /*
   * 내보내기 팝업을 엽니다.
   * 현재 화면의 filteredRecords만 사용합니다.
   */
  function openExportDialog() {
    if (isLoading || loadFailed) {
      window.alert(
        "기록을 정상적으로 불러온 뒤 다시 시도해주세요."
      );
      return;
    }

    // [2026-09-18] 고친 내용: 현재 검색에 보이지 않아도 선택한 기록 전체를 내보냅니다.
    applyFilters({ keepView: true, keepPage: true });
    exportRecords = selectedRecords.size
      ? allRecords.filter(record => selectedRecords.has(record))
      : [...filteredRecords];

    exportCount.textContent =
      `${selectedRecords.size ? "선택한 기록" : "검색 결과 전체"} ${exportRecords.length}건`;

    exportError.textContent = "";

    if (getExportFormat() === "pdf") {
      exportNote.textContent =
        "보고서 창에서 인쇄 후 PDF로 저장하세요.";
    } else {
      exportNote.textContent =
        "위에 표시된 내보내기 대상만 저장합니다.";
    }

    exportSubmit.disabled =
      exportRecords.length === 0;

    exportDialog.showModal();
  }

  /* CSV 특수문자 처리 */
  function escapeCsv(value) {
    return window.CareGuardRecordExport.escapeCsv(value);
  }

  /* [수정] Excel·CSV·PDF 공통 데이터에 아이콘 대신 실제 기록 내용을 포함합니다. */
  function makeExportRows(records) {
    return [
      [
        "발생 시각",
        // [2026-09-18] 고친 내용: 내보내기 열 제목을 화면의 병실·위치와 통일합니다.
        "병실·위치",
        "환자명",
        "알림 유형",
        "담당자",
        "처리 상태",
        "완료 시각",
        /* [추가] 내보내기의 여덟 번째 열 */
        // [2026-09-18] 고친 내용: 내보내기 열 제목도 조치 내용으로 통일합니다.
        "조치 내용"
      ],
      ...records.map(record => [
        record.occurredAt.replace("T", " "),
        record.room,
        record.patient,
        record.type,
        record.staff,
        record.status,
        record.completedAt
          ? record.completedAt.replace("T", " ")
          : "",
        /* [추가] 작성한 줄바꿈을 유지하며 내용이 없으면 빈칸으로 내보냅니다. */
        typeof record.actionContent === "string"
          ? record.actionContent
          : ""
      ])
    ];
  }

  /* CSV 다운로드 */
  function downloadCsv(records) {
    const csv = "\uFEFF" + makeExportRows(records)
      .map(row => row.map(escapeCsv).join(","))
      .join("\r\n");

    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "조치 이력.csv";

    document.body.append(link);
    link.click();
    link.remove();

    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /* Excel 다운로드 */
  function downloadExcel(records) {
    if (!window.XLSX) {
      throw new Error(
        "Excel 라이브러리를 불러오지 못했습니다."
      );
    }

    const worksheet = window.XLSX.utils.aoa_to_sheet(
      makeExportRows(records)
    );

    worksheet["!cols"] = [
      { wch: 20 },
      { wch: 10 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      /* [추가] Excel의 기록 내용 열을 넓게 설정합니다. */
      { wch: 60 }
    ];

    const workbook = window.XLSX.utils.book_new();

    window.XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "조치 이력"
    );

    window.XLSX.writeFile(
      workbook,
      "조치 이력.xlsx"
    );
  }

  /* PDF 보고서 창 */
  function openPdfReport(records) {
    const reportWindow = window.open(
      "",
      "_blank",
      "width=1100,height=800"
    );

    if (!reportWindow) {
      throw new Error(
        "팝업이 차단되었습니다."
      );
    }

    const doc = reportWindow.document;

    doc.documentElement.lang = "ko";
    doc.head.replaceChildren();
    doc.body.replaceChildren();

    const title = doc.createElement("title");
    title.textContent = "조치 이력 보고서";

    const charset = doc.createElement("meta");
    charset.setAttribute("charset", "UTF-8");

    const style = doc.createElement("style");

    style.textContent = `
      body {
        margin: 28px;
        color: #263a30;
        font-family: "Malgun Gothic", sans-serif;
        font-size: 12px;
      }

      h1 {
        font-size: 22px;
      }

      table {
        width: 100%;
        margin-top: 20px;
        border-collapse: collapse;
        /* [추가] 긴 기록 내용이 보고서 너비를 밀어내지 않도록 고정합니다. */
        table-layout: fixed;
      }

      th,
      td {
        padding: 8px;
        border: 1px solid #bbc7bf;
        text-align: center;
      }

      th {
        background: #e7eee8;
      }

      /* [추가] 모든 셀의 긴 문자열을 보고서 너비 안에서 줄바꿈합니다. */
      th, td {
        overflow-wrap: anywhere;
        vertical-align: top;
      }

      /* [추가] 기록 내용 열에 너비를 확보하고 입력한 줄바꿈을 유지합니다. */
      th:last-child {
        width: 30%;
      }

      td:last-child {
        text-align: left;
        white-space: pre-wrap;
      }

      button {
        padding: 10px 16px;
        border: 0;
        border-radius: 6px;
        background: #3b574a;
        color: white;
      }

      @page {
        size: A4 landscape;
        margin: 12mm;
      }

      @media print {
        .print-controls {
          display: none;
        }
      }
    `;

    doc.head.append(charset, title, style);

    const controls = doc.createElement("div");
    controls.className = "print-controls";

    const printButton = doc.createElement("button");
    printButton.textContent = "인쇄 / PDF로 저장";
    printButton.addEventListener("click", () => {
      reportWindow.print();
    });

    controls.append(printButton);

    const heading = doc.createElement("h1");
    heading.textContent = "안전 조치 이력 보고서";

    const count = doc.createElement("p");
    count.textContent =
      // [2026-09-18] 고친 내용: PDF에는 실제 내보낸 선택 대상 건수를 표시합니다.
      `내보낸 조치 이력 ${records.length}건`;

    const table = doc.createElement("table");
    const thead = doc.createElement("thead");
    const tbody = doc.createElement("tbody");

    makeExportRows(records).forEach((values, index) => {
      const row = doc.createElement("tr");

      values.forEach(value => {
        const cell = doc.createElement(
          index === 0 ? "th" : "td"
        );

        cell.textContent = value;
        row.append(cell);
      });

      if (index === 0) {
        thead.append(row);
      } else {
        tbody.append(row);
      }
    });

    table.append(thead, tbody);
    doc.body.append(
      controls,
      heading,
      count,
      table
    );

    reportWindow.focus();
    reportWindow.print();
  }

  /* 파일 형식에 따라 현재 결과를 저장합니다. */
  function submitExport(event) {
    event.preventDefault();

    if (!exportRecords.length) {
      exportError.textContent =
        "현재 필터 조건에 해당하는 기록이 없습니다.";
      return;
    }

    const format = getExportFormat();

    try {
      if (format === "xlsx") {
        downloadExcel(exportRecords);
      } else if (format === "csv") {
        downloadCsv(exportRecords);
      } else {
        openPdfReport(exportRecords);
      }

      exportDialog.close();
      exportButton.focus();
    } catch (error) {
      exportError.textContent = error.message;
    }
  }

  /* ==================================================
     서버 데이터 조회
     ================================================== */

  // [2026.09.29] silent=true: 대시보드가 새 낙상·조치 알림을 받아 부를 때. 로딩 문구 없이 다시 불러오고 보던 페이지·보기를 유지합니다.
  async function loadRecords({ silent = false } = {}) {
    isLoading = true;
    loadFailed = false;

    if (!silent) {
      showTableMessage(
        "조치 이력을 불러오는 중입니다."
      );
    }

    try {
      let records = demoRecords;

      if (!settings.useDemoData) {
        const response = await fetch(
          historyPage.dataset.apiUrl,
          {
            credentials: "same-origin",
            headers: {
              Accept: "application/json"
            },
            cache: "no-store"
          }
        );

        if (!response.ok) {
          throw new Error(
            `기록 조회 실패: ${response.status}`
          );
        }

        records = await response.json();
      }

      const requiredFields = [
        "occurredAt",
        "room",
        "patient",
        "type",
        "staff",
        "status",
        "completedAt"
      ];

      const validResponse =
        Array.isArray(records) &&
        records.every(record =>
          record &&
          requiredFields.every(field =>
            typeof record[field] === "string"
          )
        );

      if (!validResponse) {
        throw new Error(
          "서버 응답 형식을 확인해주세요."
        );
      }

      // [2026.09.22] 관리자·간호사 공용 조치 이력에는 낙상 감지만 남깁니다.
      // 서버가 침대 이탈 기록을 함께 반환해도 화면과 내보내기 대상에서 제외합니다.
      // [2026.09.28] 대시보드에서 오경보로 확인한 낙상(서버 dismissed=true)은 환자명을 비우고 알림 유형을 '오경보'로 표시합니다(09-29 사용자 요청으로 '낙상 오경보' → '오경보').
      // (오경보 확인 때 환자명 칸에 저장되는 '오경보'는 환자 이름이 아니기 때문입니다. 표·검색·내보내기 모두 이 값을 씁니다.)
      allRecords = records
        .filter(record => record.type === "낙상 감지")
        .map(record => record.dismissed === true
          ? { ...record, patient: "", type: "오경보" }
          : record)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
      allRecords = sortRecordsByStatusAndTime(allRecords);

      if (!settings.useDemoData) {
        // [2026.09.27 추가] 병실 필터를 실제 기록의 병실·위치로 만듭니다(1·2병동, 관리자 전체 병동도 맞게 나옵니다).
        const rooms = [...new Set(allRecords.map(record => record.room))]
          .sort((a, b) => a.localeCompare(b, "ko", { numeric: true }));
        renderRoomOptions(rooms);
        const roomFilter = document.querySelector("#room-filter");
        if (!rooms.includes(roomFilter.value)) {
          roomFilter.value = "all";
          document.querySelector("#room-dropdown .choice-label").textContent = "전체 병실·위치";
        }

        // [2026.09.27 추가] 다시 불러와도 선택한 기록은 유지합니다. 같은 기록은 eventId 로 찾습니다.
        const selectedIds = new Set([...selectedRecords].map(record => record.eventId).filter(Boolean));
        selectedRecords.clear();
        allRecords
          .filter(record => selectedIds.has(record.eventId))
          .forEach(record => selectedRecords.add(record));
      }

      isLoading = false;
      applyFilters(silent ? { keepView: true, keepPage: true } : {});
    } catch (error) {
      isLoading = false;
      loadFailed = true;
      allRecords = [];
      filteredRecords = [];

      showTableMessage(
        "기록을 불러오지 못했습니다."
      );

      console.error(error);
    }
  }

  /* ==================================================
     이벤트 연결
     ================================================== */

  /* 검색 버튼 또는 Enter */
  // [2026-09-18] 추가 내용: 행 선택과 현재 페이지 전체 선택을 연결합니다.
  function createRecordSelectionCell(record) {
    const cell = document.createElement("td");
    cell.className = "record-selection-cell";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "record-checkbox";
    checkbox.checked = selectedRecords.has(record);
    checkbox.setAttribute("aria-label", `${record.room} ${record.patient} ${formatTime(record.occurredAt)} 기록 선택`);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedRecords.add(record);
      else selectedRecords.delete(record);
      if (selectedOnly) renderRecords(getVisibleRecords());
      else updateRecordSelection();
    });
    cell.append(checkbox);
    return cell;
  }

  selectPageCheckbox.addEventListener("change", () => {
    const pageRecords = getVisibleRecords().slice((currentPage - 1) * recordsPerPage, currentPage * recordsPerPage);
    pageRecords.forEach(record => {
      if (selectPageCheckbox.checked) selectedRecords.add(record);
      else selectedRecords.delete(record);
    });
    renderRecords(getVisibleRecords());
  });
  // [2026-09-18] 추가 내용: 입력을 잠깐 멈추면 자동 검색하며 한글 조합 중에도 입력창은 건드리지 않습니다.
  function scheduleLiveSearch() {
    clearTimeout(liveSearchTimer);
    liveSearchTimer = setTimeout(() => applyFilters(), 200);
  }
  const searchInput = document.querySelector("#search-input");
  searchInput.addEventListener("input", scheduleLiveSearch);
  searchInput.addEventListener("compositionend", scheduleLiveSearch);
  selectedViewButton.addEventListener("click", () => {
    selectedOnly = !selectedOnly;
    applyFilters({ keepView: true });
  });
  clearSelectionButton.addEventListener("click", clearRecordSelection);

  /* 검색 버튼 또는 Enter */
  searchForm.addEventListener("submit", event => {
    event.preventDefault();
    applyFilters();
  });

  // [2026-09-18] 고친 내용: 검색 조건과 날짜만 초기화하고 선택은 유지한 채 첫 페이지를 표시합니다.
  document.querySelector("#search-reset").addEventListener("click", () => {
    searchForm.querySelectorAll("input[type='hidden']").forEach(input => {
      input.value = "all";
    });
    document.querySelector("#search-input").value = "";
    selectedStart = "";
    selectedEnd = "";
    draftStart = "";
    draftEnd = "";
    dropdownControls.forEach(control => {
      control.close();
      control.updateLabel();
    });
    applyFilters();
  });

  /* 달력 이동 */
  previousMonthButton.addEventListener("click", () => {
    displayedMonth.setMonth(
      displayedMonth.getMonth() - 1
    );

    renderCalendar();
  });

  nextMonthButton.addEventListener("click", () => {
    displayedMonth.setMonth(
      displayedMonth.getMonth() + 1
    );

    renderCalendar();
  });

  /* 달력 취소·확인 */
  cancelCalendarButton.addEventListener(
    "click",
    cancelCalendar
  );

  confirmCalendarButton.addEventListener(
    "click",
    confirmCalendar
  );

  calendarDialog.addEventListener("cancel", event => {
    event.preventDefault();
    cancelCalendar();
  });

  /* 내보내기 팝업 */
  exportButton.addEventListener(
    "click",
    openExportDialog
  );

  exportForm.addEventListener(
    "submit",
    submitExport
  );

  /* 파일 형식 변경 시 안내 문구 변경 */
  exportForm
    .querySelectorAll('input[name="format"]')
    .forEach(input => {
      input.addEventListener("change", () => {
        if (input.checked) {
          exportNote.textContent =
            input.value === "pdf"
              ? "보고서 창에서 PDF로 저장하세요."
              : "위에 표시된 내보내기 대상만 저장합니다.";
        }
      });
    });

  /* 팝업 닫기 */
  function closeExportDialog() {
    exportDialog.close();
    exportButton.focus();
  }

  document
    .querySelector("#export-close")
    .addEventListener(
      "click",
      closeExportDialog
    );

  document
    .querySelector("#export-cancel")
    .addEventListener(
      "click",
      closeExportDialog
    );

  exportDialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeExportDialog();
  });

  /* [수정] 로그아웃 이벤트를 제거하여 버튼이 없어도 목록이 초기화됩니다. */

  /* ==================================================
     초기 실행
     ================================================== */

  renderRoomOptions();
  setupDropdowns();

  updateClock();
  setInterval(updateClock, 30000);

  loadRecords();

  // [2026.09.27 추가] 대시보드가 조치 이력 화면을 다시 열 때 새 기록을 불러오도록 부르는 함수입니다.
  window.CareGuardRecordPage = {
    reload({ silent = false } = {}) {
      if (!settings.useDemoData && !isLoading) loadRecords({ silent });
    }
  };
}
