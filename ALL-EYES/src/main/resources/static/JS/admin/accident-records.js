"use strict";

// [2026.09.29 변경] 관리자 사고 기록을 영상 보관함으로 전환합니다.
// 감지 이벤트의 event_detail.video_url(또는 videoUrl)을 받아 목록 선택 시 video 요소로 재생합니다.
(() => {
  const page = document.querySelector("#admin-accident-view");
  if (!page) return;

  const recordsUrl = page.dataset.recordsUrl;
  const list = document.querySelector("#admin-accident-rows");
  const form = document.querySelector("#admin-accident-filter-form");
  const wardFilter = document.querySelector("#admin-accident-ward");
  const searchInput = document.querySelector("#admin-accident-search");
  const dateStartFilter = document.querySelector("#admin-accident-date-start");
  const dateEndFilter = document.querySelector("#admin-accident-date-end");
  const dateTrigger = document.querySelector("#admin-accident-date-trigger");
  const dateLabel = document.querySelector("#admin-accident-date-label");
  const dateHelp = document.querySelector("#admin-accident-calendar-help");
  const datePopover = document.querySelector("#admin-accident-date-popover");
  const dateMonthLabel = document.querySelector("#admin-accident-calendar-month");
  const dateDays = document.querySelector("#admin-accident-date-days");
  const prevMonthButton = document.querySelector("#admin-accident-prev-month");
  const nextMonthButton = document.querySelector("#admin-accident-next-month");
  const clearDateButton = document.querySelector("#admin-accident-date-clear");
  const confirmDateButton = document.querySelector("#admin-accident-date-confirm");
  const resetButton = document.querySelector("#admin-accident-reset");
  const pagination = document.querySelector("#admin-accident-pagination");
  const pendingVideoCount = document.querySelector("#admin-accident-pending-video-count");
  const completedVideoCount = document.querySelector("#admin-accident-completed-video-count");
  const videoStatusCards = Array.from(document.querySelectorAll("[data-video-status]"));
  const video = document.querySelector("#admin-accident-video");
  const videoEmpty = document.querySelector("#admin-accident-video-empty");
  const listDescription = document.querySelector("#admin-accident-list-description");
  const recordsPerPage = 12;
  const defaultListDescription = "병동, 위치 또는 환자명으로 확정 낙상 영상을 찾습니다.";
  let allRecords = [];
  let filteredRecords = [];
  let currentPage = 1;
  let selectedEventId = "";
  let selectedVideoStatus = "all";
  let wardDropdown;
  let wardDropdownButton;
  let wardDropdownList;
  let draftStartDate = "";
  let draftEndDate = "";

  const demoRecords = [
    { eventId: "demo-video-1", occurredAt: "2026-09-29T10:12", wardName: "3병동", room: "302호", patient: "김OO", type: "낙상 감지", status: "미확인", completedAt: "", videoUrl: "", videoViewed: false },
    { eventId: "demo-video-2", occurredAt: "2026-09-29T08:44", wardName: "2병동", room: "205호", patient: "이OO", type: "낙상 감지", status: "완료", completedAt: "2026-09-29T08:51", videoUrl: "", videoViewed: true },
    { eventId: "demo-video-3", occurredAt: "2026-09-28T19:26", wardName: "1병동", room: "107호", patient: "박OO", type: "낙상 감지", status: "완료", completedAt: "2026-09-28T19:33", videoUrl: "", videoViewed: true }
  ];

  function displayDateTime(value) {
    if (!value) return "-";
    return `${value.slice(0, 10).replaceAll("-", ".")} ${value.slice(11, 16)}`;
  }

  function text(value) {
    return value?.trim() || "-";
  }
  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function dateLabelText(startValue, endValue) {
    if (startValue && endValue) return `${startValue.replaceAll("-", ".")} ~ ${endValue.replaceAll("-", ".")}`;
    if (startValue) return `${startValue.replaceAll("-", ".")} ~ 종료일`;
    if (endValue) return `시작일 ~ ${endValue.replaceAll("-", ".")}`;
    return "전체 날짜";
  }

  let calendarMonthDate = new Date();

  function updateDateLabel() {
    const startValue = dateStartFilter?.value || "";
    const endValue = dateEndFilter?.value || "";
    if (dateLabel) dateLabel.textContent = dateLabelText(startValue, endValue);
  }

  function updateDraftDateState() {
    if (confirmDateButton) confirmDateButton.disabled = !draftStartDate || !draftEndDate;
    if (!dateHelp) return;
    if (!draftStartDate) {
      dateHelp.textContent = "시작일과 종료일을 차례로 선택하세요.";
    } else if (!draftEndDate) {
      dateHelp.textContent = `${draftStartDate.replaceAll("-", ".")}부터 · 종료일을 선택하세요.`;
    } else {
      dateHelp.textContent = `${draftStartDate.replaceAll("-", ".")} ~ ${draftEndDate.replaceAll("-", ".")}`;
    }
  }

  function closeDatePopover() {
    if (!datePopover) return;
    datePopover.hidden = true;
    dateTrigger?.setAttribute("aria-expanded", "false");
  }

  function renderDateCalendar() {
    if (!dateDays || !dateMonthLabel) return;
    const year = calendarMonthDate.getFullYear();
    const month = calendarMonthDate.getMonth();
    dateMonthLabel.textContent = `${year}년 ${month + 1}월`;
    dateDays.replaceChildren();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstDay; i += 1) dateDays.append(document.createElement("span"));
    for (let day = 1; day <= lastDate; day += 1) {
      const key = dateKey(new Date(year, month, day));
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = day;
      button.dataset.date = key;
      if (key === draftStartDate || key === draftEndDate) button.setAttribute("aria-pressed", "true");
      if (draftStartDate && draftEndDate && key > draftStartDate && key < draftEndDate) button.classList.add("is-in-range");
      button.addEventListener("click", () => {
        if (!draftStartDate || draftEndDate) {
          draftStartDate = key;
          draftEndDate = "";
        } else {
          [draftStartDate, draftEndDate] = [draftStartDate, key].sort();
        }
        updateDraftDateState();
        renderDateCalendar();
      });
      dateDays.append(button);
    }
  }

  /**
   * [2026.10.01 변경] 오경보는 실제 환자 이름이 아니므로 사고 영상 안내 문구에서 환자명으로 표시하지 않습니다.
   */
  function patientNameText(value) {
    const name = String(value ?? "").trim();
    return name && name !== "오경보" ? name : "";
  }

  function hasVideo(record) {
    return Boolean(record.videoUrl?.trim());
  }
  /**
   * [2026.10.01 변경] 사고 영상 보관함은 조치 등록이 끝나 환자명이 확인된 영상만 표시합니다.
   */
  function hasPatientName(record) {
    return Boolean(patientNameText(record.patient));
  }

  function visibleAccidentRecords(records) {
    return records.filter(hasPatientName);
  }

  // [2026.09.29] 영상 보관함의 미확인·확인 완료는 관리자가 재생 버튼을 누른 적이 있는지(videoViewed)로 정합니다.
  // record.status(대응 등록 기준)는 조치 이력 화면용이라 여기서는 쓰지 않습니다.
  function videoStatus(record) {
    return record.videoViewed ? "완료" : "미확인";
  }

  function updateSummary() {
    // [2026.09.29 변경] 영상 보관함의 상태 카드는 저장 주소 유무와 관계없이 미확인·확인 완료 사고 건수를 각각 표시합니다.
    pendingVideoCount.innerHTML = `${allRecords.filter(record => videoStatus(record) === "미확인").length}<span>건</span>`;
    completedVideoCount.innerHTML = `${allRecords.filter(record => videoStatus(record) === "완료").length}<span>건</span>`;
  }

  // [2026.09.29] 재생 버튼을 처음 누르면 서버에 확인 완료로 남깁니다(tb_event_media.viewed_at).
  async function markViewed(record) {
    if (!record || record.videoViewed || !hasVideo(record)) return;
    if (location.protocol === "file:" || location.port === "5500") {
      record.videoViewed = true;
    } else {
      if (!record.videoUrl.startsWith("/api/admin/events/")) return;
      const headers = { Accept: "application/json" };
      const csrfToken = document.querySelector('meta[name="_csrf"]')?.content;
      const csrfHeader = document.querySelector('meta[name="_csrf_header"]')?.content;
      if (csrfToken && csrfHeader) headers[csrfHeader] = csrfToken;
      try {
        const response = await fetch(`/api/admin/events/${encodeURIComponent(record.eventId)}/media/viewed`, {
          method: "POST",
          credentials: "same-origin",
          headers
        });
        if (!response.ok || response.redirected) throw new Error(`영상 확인 기록 실패: ${response.status}`);
        record.videoViewed = true;
      } catch (error) {
        console.warn(error);
        return;
      }
    }
    updateSummary();
    renderCards();
  }

  function renderVideoStatusCards() {
    videoStatusCards.forEach(card => {
      const selected = card.dataset.videoStatus === selectedVideoStatus;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-pressed", String(selected));
    });
  }

  function clearPlayer() {
    selectedEventId = "";
    if (listDescription) listDescription.textContent = defaultListDescription;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.hidden = true;
    videoEmpty.hidden = false;
    // [2026.09.30 변경] 선택 전 안내는 한 문장만 표시해 빈 영상 영역을 간결하게 유지합니다.
    videoEmpty.textContent = "사고 영상을 선택해 주세요.";
  }

  function showVideo(record) {
    selectedEventId = record.eventId;
    // [2026.10.01 변경] 사고 영상 목록에서 항목을 선택하면 검색 안내 문구 자리에 해당 환자명을 표시합니다.
    const patientName = patientNameText(record.patient);
    if (listDescription) {
      listDescription.textContent = patientName
        ? `${patientName}님 사고 영상을 확인합니다.`
        : defaultListDescription;
    }
    if (!hasVideo(record)) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      video.hidden = true;
      videoEmpty.hidden = false;
      // [2026.09.30 변경] 보관 영상이 없는 경우에도 한 문장으로 중앙 안내를 표시합니다.
      videoEmpty.textContent = "선택한 영상이 없습니다.";
      renderCards();
      return;
    }
    video.src = record.videoUrl;
    video.hidden = false;
    videoEmpty.hidden = true;
    video.load();
    renderCards();
    placeBigPlay();
  }

  function createCard(record) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "admin-accident-video-card";
    card.classList.toggle("is-selected", record.eventId === selectedEventId);
    card.classList.toggle("is-missing", !hasVideo(record));
    card.setAttribute("aria-pressed", String(record.eventId === selectedEventId));
    card.setAttribute("aria-label", `${displayDateTime(record.occurredAt)} ${text(record.room)} 사고 영상 선택`);

    const metadata = document.createElement("span");
    metadata.className = "admin-accident-video-meta";
    const timestamp = document.createElement("time");
    timestamp.dateTime = record.occurredAt || "";
    timestamp.textContent = displayDateTime(record.occurredAt);
    const state = document.createElement("strong");
    state.className = videoStatus(record) === "완료" ? "is-completed" : "is-pending";
    state.textContent = videoStatus(record) === "완료" ? "완료" : "미확인 영상";
    metadata.append(timestamp, state);

    const title = document.createElement("strong");
    title.className = "admin-accident-video-title";
    title.textContent = `${[record.wardName, record.room].filter(Boolean).join(" · ") || "위치 미정"} · ${text(record.type || "낙상 감지")}`;
    const subtitle = document.createElement("span");
    subtitle.className = "admin-accident-video-subtitle";
    subtitle.textContent = patientNameText(record.patient);
    card.append(metadata, title, subtitle);
    card.addEventListener("click", () => showVideo(record));
    return card;
  }

  function renderPagination() {
    pagination.replaceChildren();
    const totalPages = Math.ceil(filteredRecords.length / recordsPerPage);
    if (totalPages <= 1) return;
    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = pageNumber;
      button.setAttribute("aria-label", `${pageNumber}페이지`);
      if (pageNumber === currentPage) button.setAttribute("aria-current", "page");
      button.addEventListener("click", () => {
        currentPage = pageNumber;
        renderCards();
      });
      pagination.append(button);
    }
  }

  /**
   * [2026.10.01 변경] 기본 select의 펼침 목록은 브라우저 기본 UI라 디자인 통일이 어려워 버튼형 병동 필터를 대신 표시합니다.
   */
  function createWardDropdown() {
    if (!wardFilter || wardDropdown) return;

    wardFilter.hidden = true;
    wardDropdown = document.createElement("div");
    wardDropdown.className = "admin-accident-ward-dropdown";
    wardDropdownButton = document.createElement("button");
    wardDropdownButton.type = "button";
    wardDropdownButton.className = "admin-accident-ward-trigger";
    wardDropdownButton.setAttribute("aria-haspopup", "listbox");
    wardDropdownButton.setAttribute("aria-expanded", "false");
    wardDropdownList = document.createElement("div");
    wardDropdownList.className = "admin-accident-ward-options";
    wardDropdownList.setAttribute("role", "listbox");
    wardDropdownList.hidden = true;
    wardDropdown.append(wardDropdownButton, wardDropdownList);
    wardFilter.after(wardDropdown);
    wardDropdownButton.addEventListener("click", event => {
      event.stopPropagation();
      const open = wardDropdownList.hidden;
      wardDropdownList.hidden = !open;
      wardDropdownButton.setAttribute("aria-expanded", String(open));
    });
  }

  function closeWardDropdown() {
    if (!wardDropdownList) return;
    wardDropdownList.hidden = true;
    wardDropdownButton?.setAttribute("aria-expanded", "false");
  }

  function renderWardDropdown() {
    createWardDropdown();
    if (!wardDropdownList || !wardDropdownButton) return;

    const selected = wardFilter.selectedOptions[0]?.textContent || "전체 병동";
    wardDropdownButton.replaceChildren();
    const label = document.createElement("span");
    label.textContent = selected;
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "admin-accident-ward-icon");
    icon.setAttribute("viewBox", "0 0 12 12");
    icon.setAttribute("aria-hidden", "true");
    const arrow = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrow.setAttribute("d", "M3 4.5 6 7.5 9 4.5");
    arrow.setAttribute("fill", "none");
    arrow.setAttribute("stroke", "currentColor");
    arrow.setAttribute("stroke-width", "1.4");
    arrow.setAttribute("stroke-linecap", "round");
    arrow.setAttribute("stroke-linejoin", "round");
    icon.append(arrow);
    wardDropdownButton.append(label, icon);
    wardDropdownList.replaceChildren();
    Array.from(wardFilter.options).forEach(option => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "admin-accident-ward-option";
      item.textContent = option.textContent;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === wardFilter.value));
      item.addEventListener("click", event => {
        event.stopPropagation();
        wardFilter.value = option.value;
        renderWardDropdown();
        closeWardDropdown();
        applyFilters();
      });
      wardDropdownList.append(item);
    });
  }

  function renderCards() {
    list.replaceChildren();
    const totalPages = Math.max(1, Math.ceil(filteredRecords.length / recordsPerPage));
    currentPage = Math.min(currentPage, totalPages);
    const start = (currentPage - 1) * recordsPerPage;
    const pageRecords = filteredRecords.slice(start, start + recordsPerPage);
    if (!pageRecords.length) {
      const empty = document.createElement("p");
      empty.className = "admin-accident-empty";
      empty.textContent = "검색 조건에 맞는 사고 영상이 없습니다.";
      list.append(empty);
    } else {
      pageRecords.forEach(record => list.append(createCard(record)));
    }
    renderPagination();
  }

  function updateWardOptions() {
    const selectedValue = wardFilter.value;
    const wards = [...new Set(allRecords.map(record => record.wardName).filter(Boolean))];
    wardFilter.replaceChildren(new Option("전체 병동", "all"));
    wards.forEach(ward => wardFilter.add(new Option(ward, ward)));
    wardFilter.value = wards.includes(selectedValue) ? selectedValue : "all";
    renderWardDropdown();
  }

  function applyFilters() {
    const query = searchInput.value.trim().toLowerCase();
    const selectedStartDate = dateStartFilter?.value || "";
    const selectedEndDate = dateEndFilter?.value || "";
    filteredRecords = allRecords.filter(record => {
      const sameStatus = selectedVideoStatus === "all" || videoStatus(record) === selectedVideoStatus;
      const sameWard = wardFilter.value === "all" || record.wardName === wardFilter.value;
      const recordDate = record.occurredAt?.slice(0, 10) || "";
      const sameDate = (!selectedStartDate || recordDate >= selectedStartDate) && (!selectedEndDate || recordDate <= selectedEndDate);
      const searchable = [record.room, record.patient, record.wardName, record.type]
        .filter(Boolean).join(" ").toLowerCase();
      return sameStatus && sameWard && sameDate && (!query || searchable.includes(query));
    });
    currentPage = 1;
    clearPlayer();
    renderCards();
  }
  async function reload() {
    try {
      const response = await fetch(recordsUrl, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!response.ok || response.redirected) throw new Error(`사고 영상 조회 실패: ${response.status}`);
      allRecords = visibleAccidentRecords(await response.json());
    } catch (error) {
      // [2026.09.29 변경] Live Server 미리보기에서는 저장소 연결 없이 보관함 UI를 확인할 수 있습니다.
      if (location.protocol === "file:" || location.port === "5500") allRecords = visibleAccidentRecords(demoRecords);
      else allRecords = [];
    }
    updateSummary();
    updateWardOptions();
    renderVideoStatusCards();
    applyFilters();
  }

  // [2026.09.29] 영상 가운데 큰 재생 버튼. 멈춰 있을 때만 보이고, 누르면 재생합니다(재생하면 확인 완료로 남습니다).
  // 영상 영역의 배치는 바꾸지 않도록 버튼만 영상 위에 겹쳐 띄웁니다.
  const player = video.closest(".admin-accident-player");
  const bigPlay = document.createElement("button");
  bigPlay.type = "button";
  bigPlay.className = "admin-accident-big-play";
  bigPlay.setAttribute("aria-label", "사고 영상 재생");
  bigPlay.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  bigPlay.hidden = true;
  player.append(bigPlay);

  function placeBigPlay() {
    const show = !video.hidden && Boolean(video.getAttribute("src")) && video.paused;
    bigPlay.hidden = !show;
    if (!show) return;
    bigPlay.style.left = `${video.offsetLeft + video.offsetWidth / 2}px`;
    bigPlay.style.top = `${video.offsetTop + video.offsetHeight / 2}px`;
  }

  // [2026.09.29] 전체화면에서는 영상 패널에 들어가는 가장 큰 16:9 크기로 영상을 키워 양옆 여백을 없앱니다.
  // 패널 높이는 화면 높이로 정해지므로(.admin-accident-archive) 그 높이에서 제목·여백을 뺀 만큼을 씁니다. 일반 창에서는 CSS 크기 그대로입니다.
  const archive = player.closest(".admin-accident-archive");
  const playerHeader = player.querySelector("header");
  function fitVideoToPanel() {
    const boxes = [video, videoEmpty];
    if (!document.fullscreenElement) {
      boxes.forEach(box => { box.style.width = ""; box.style.height = ""; box.style.maxWidth = ""; });
      return;
    }
    const style = getComputedStyle(player);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const headerSpace = playerHeader.offsetHeight + parseFloat(getComputedStyle(playerHeader).marginBottom);
    const availableWidth = player.clientWidth - padX;
    const availableHeight = archive.clientHeight - padY - headerSpace;
    const width = Math.max(0, Math.floor(Math.min(availableWidth, availableHeight * 16 / 9)));
    boxes.forEach(box => {
      box.style.maxWidth = "none";
      box.style.width = `${width}px`;
      box.style.height = `${Math.floor(width * 9 / 16)}px`;
    });
  }

  function layoutPlayer() {
    fitVideoToPanel();
    placeBigPlay();
  }

  bigPlay.addEventListener("click", () => video.play().catch(error => console.warn(error)));
  ["play", "playing", "pause", "ended", "emptied", "loadedmetadata"].forEach(name => video.addEventListener(name, placeBigPlay));
  window.addEventListener("resize", layoutPlayer);
  document.addEventListener("fullscreenchange", () => requestAnimationFrame(layoutPlayer));
  if (window.ResizeObserver) {
    new ResizeObserver(placeBigPlay).observe(video);
    new ResizeObserver(() => requestAnimationFrame(layoutPlayer)).observe(archive);
  }

  form.addEventListener("submit", event => { event.preventDefault(); applyFilters(); });
  video.addEventListener("play", () => markViewed(allRecords.find(record => record.eventId === selectedEventId)));
  wardFilter.addEventListener("change", applyFilters);
  searchInput.addEventListener("input", applyFilters);
  dateTrigger?.addEventListener("click", event => {
    event.stopPropagation();
    if (!datePopover) return;
    const open = datePopover.hidden || dateTrigger.getAttribute("aria-expanded") !== "true";
    if (open) {
      draftStartDate = dateStartFilter?.value || "";
      draftEndDate = dateEndFilter?.value || "";
      const initialDate = draftStartDate || dateKey(new Date());
      const [year, month] = initialDate.split("-").map(Number);
      calendarMonthDate = new Date(year, month - 1, 1);
    }
    datePopover.hidden = !open;
    dateTrigger.setAttribute("aria-expanded", String(open));
    updateDraftDateState();
    renderDateCalendar();
  });
  prevMonthButton?.addEventListener("click", () => { calendarMonthDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() - 1, 1); renderDateCalendar(); });
  nextMonthButton?.addEventListener("click", () => { calendarMonthDate = new Date(calendarMonthDate.getFullYear(), calendarMonthDate.getMonth() + 1, 1); renderDateCalendar(); });
  clearDateButton?.addEventListener("click", () => { draftStartDate = dateStartFilter?.value || ""; draftEndDate = dateEndFilter?.value || ""; updateDraftDateState(); renderDateCalendar(); closeDatePopover(); });
  datePopover?.addEventListener("click", event => event.stopPropagation());
  confirmDateButton?.addEventListener("click", event => { event.stopPropagation(); if (!dateStartFilter || !dateEndFilter || !draftStartDate || !draftEndDate) return; dateStartFilter.value = draftStartDate; dateEndFilter.value = draftEndDate; updateDateLabel(); closeDatePopover(); applyFilters(); });
  resetButton.addEventListener("click", () => {
    selectedVideoStatus = "all";
    renderVideoStatusCards();
    wardFilter.value = "all";
    renderWardDropdown();
    searchInput.value = "";
    if (dateStartFilter) dateStartFilter.value = "";
    if (dateEndFilter) dateEndFilter.value = "";
    draftStartDate = "";
    draftEndDate = "";
    updateDateLabel();
    applyFilters();
  });

  videoStatusCards.forEach(card => card.addEventListener("click", event => {
    event.stopPropagation();
    selectedVideoStatus = selectedVideoStatus === card.dataset.videoStatus ? "all" : card.dataset.videoStatus;
    renderVideoStatusCards();
    applyFilters();
  }));
  // [2026.09.29 변경] 카드 밖의 빈 화면을 누르면 상태별 목록을 닫고 전체 목록으로 되돌립니다.
  document.addEventListener("click", event => {
    if (!event.target.closest(".admin-accident-ward-dropdown")) closeWardDropdown();
    if (!event.target.closest(".admin-accident-date-field")) closeDatePopover();
    if (selectedVideoStatus === "all" || event.target.closest(".admin-accident-overview, .admin-accident-list-column, .admin-accident-player, .admin-accident-filters")) return;
    selectedVideoStatus = "all";
    renderVideoStatusCards();
    applyFilters();
  });

  // [2026.09.29 변경] 상단 메뉴의 사고 기록을 다시 선택하면 저장된 영상 목록을 최신 상태로 갱신합니다.
  window.AdminAccidentRecords = { reload };
  updateDateLabel();
  if (!page.hidden) reload();
})();
