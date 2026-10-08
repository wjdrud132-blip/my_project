"use strict";

// [2026.09.16] 고친 내용: 직원 관리 화면 안에서도 비활성화 직원 기능을 함께 실행할 수 있도록 변수 범위를 분리합니다.
(() => {

const adminFeedback = document.querySelector("#admin-feedback");
const adminClock = document.querySelector("#admin-clock");
let adminToastTimer = null;

function showAdminFeedback(message) {
    clearTimeout(adminToastTimer);

    adminFeedback.textContent = message;
    adminFeedback.hidden = false;

    adminToastTimer = setTimeout(() => {
        adminFeedback.hidden = true;
    }, 4000);
}

function updateAdminClock() {
    const now = new Date();

    const parts = new Intl.DateTimeFormat("ko-KR", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(now);

    const values = Object.fromEntries(
        parts.map(part => [part.type, part.value])
    );

    adminClock.dateTime = now.toISOString();
    // [09.13]수정내용: 비활성화 관리 화면 날짜에 한국어 요일을 함께 표시한다.
    adminClock.textContent =
        `${values.year}년 ${values.month}월 ${values.day}일 (${values.weekday}) `
        + `${values.hour}:${values.minute}`;
}

/* INACTIVE 직원만 DB에서 읽고, 변경 성공 후 목록을 다시 조회한다. */
const adminInactiveSearch = document.querySelector("#admin-inactive-search");
const adminInactiveWard = document.querySelector("#admin-inactive-ward");
const adminWardDropdown = document.querySelector("#admin-ward-dropdown");
const adminWardTrigger = document.querySelector("#admin-ward-trigger");
const adminWardOptions = document.querySelector("#admin-ward-options");
const adminWardLabel = document.querySelector("#admin-ward-label");
const adminInactiveRoom = document.querySelector("#admin-inactive-room");
const adminRoomFilterDropdown = document.querySelector("#admin-room-filter-dropdown");
const adminRoomFilterTrigger = document.querySelector("#admin-room-filter-trigger");
const adminRoomFilterOptions = document.querySelector("#admin-room-filter-options");
const adminRoomFilterLabel = document.querySelector("#admin-room-filter-label");
const adminInactiveSelectAll = document.querySelector("#admin-inactive-select-all");
const adminBulkButtons = Array.from(document.querySelectorAll("[data-bulk-status]"));
const adminRows = document.querySelector("#admin-inactive-rows");
const adminList = document.querySelector("#admin-inactive-list");
const adminSelectedViewButton = document.querySelector("#admin-inactive-selected-view");
const adminClearSelectionButton = document.querySelector("#admin-inactive-clear-selection");
const adminSelectionSummary = document.querySelector("#admin-inactive-selection-summary");
let adminInactivePagination = document.querySelector("#admin-inactive-pagination");
if (!adminInactivePagination && adminList) {
    adminInactivePagination = document.createElement("nav");
    adminInactivePagination.id = "admin-inactive-pagination";
    adminInactivePagination.className = "admin-pagination admin-inactive-pagination";
    adminInactivePagination.setAttribute("aria-label", "비활성화 직원 목록 페이지");
    adminInactivePagination.hidden = true;
    adminList.after(adminInactivePagination);
}
const adminStatusDialog = document.querySelector("#admin-status-dialog");
const adminStatusConfirm = document.querySelector("#admin-status-confirm");
const adminStatusCancel = document.querySelector("#admin-status-cancel");
const adminError = document.querySelector("#admin-inactive-error");
const csrfToken = document.querySelector('meta[name="_csrf"]')?.content ?? "";
const csrfHeader = document.querySelector('meta[name="_csrf_header"]')?.content || "X-CSRF-TOKEN";
let adminInactiveUsers = [];
let adminSelectedIds = new Set();
let adminSelectedOnly = false;
let adminPendingStatusChange = null;
let adminBusy = false;
let adminLoading = false;
let adminLoadFailed = false;
const ADMIN_INACTIVE_PAGE_SIZE = 10;
let adminInactiveCurrentPage = 1;

function closeAdminWardOptions() {
    if (!adminWardTrigger || !adminWardOptions) return;
    adminWardOptions.hidden = true;
    adminWardTrigger.setAttribute("aria-expanded", "false");
}

function closeAdminRoomOptions() {
    if (!adminRoomFilterTrigger || !adminRoomFilterOptions) return;
    adminRoomFilterOptions.hidden = true;
    adminRoomFilterTrigger.setAttribute("aria-expanded", "false");
}

function getSelectedWardNumber() {
    const selectedText = adminInactiveWard.selectedOptions[0]?.textContent ?? "";
    const match = selectedText.match(/(\d+)\s*병동/);
    return match ? Number(match[1]) : 0;
}

function renderAdminRoomOptions() {
    if (!adminInactiveRoom || !adminRoomFilterOptions || !adminRoomFilterLabel) return;
    adminRoomFilterOptions.replaceChildren();
    const selected = adminInactiveRoom.selectedOptions[0];
    adminRoomFilterLabel.textContent = selected?.textContent || "전체 호실";
    for (const option of adminInactiveRoom.options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.textContent;
        button.setAttribute("aria-selected", String(option.value === adminInactiveRoom.value));
        button.addEventListener("click", () => {
            adminInactiveRoom.value = option.value;
            adminInactiveRoom.dispatchEvent(new Event("change", { bubbles: true }));
            closeAdminRoomOptions();
            adminRoomFilterTrigger.focus();
        });
        adminRoomFilterOptions.append(button);
    }
}

function refreshAdminRoomFilter(resetSelection = false) {
    if (!adminInactiveRoom || !adminRoomFilterDropdown) return;
    const caregiver = document.body.dataset.adminJobType === "CAREGIVER";
    adminRoomFilterDropdown.hidden = !caregiver;
    const previousRoom = resetSelection ? "" : adminInactiveRoom.value;
    const wardNumber = caregiver ? getSelectedWardNumber() : 0;
    adminInactiveRoom.replaceChildren(new Option(wardNumber ? "전체 호실" : "병동 먼저 선택", ""));
    if (wardNumber) {
        for (let roomNumber = wardNumber * 100 + 1; roomNumber <= wardNumber * 100 + 17; roomNumber += 1) {
            adminInactiveRoom.add(new Option(`${roomNumber}호`, String(roomNumber)));
        }
    }
    adminInactiveRoom.value = [...adminInactiveRoom.options].some(option => option.value === previousRoom)
        ? previousRoom : "";
    renderAdminRoomOptions();
    closeAdminRoomOptions();
}

function renderAdminWardOptions() {
    if (!adminWardTrigger || !adminWardOptions || !adminWardLabel) return;
    adminWardOptions.replaceChildren();
    const selected = adminInactiveWard.selectedOptions[0];
    adminWardLabel.textContent = selected?.textContent || "전체 병동";
    for (const option of adminInactiveWard.options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.textContent;
        button.setAttribute("aria-selected", String(option.value === adminInactiveWard.value));
        button.addEventListener("click", () => {
            adminInactiveWard.value = option.value;
            adminInactiveWard.dispatchEvent(new Event("change", { bubbles: true }));
            closeAdminWardOptions();
            adminWardTrigger.focus();
        });
        adminWardOptions.append(button);
    }
}

if (adminWardTrigger && adminWardOptions && adminWardDropdown) {
    adminWardTrigger.addEventListener("click", () => {
        if (adminWardTrigger.disabled) return;
        const opening = adminWardOptions.hidden;
        adminWardOptions.hidden = !opening;
        adminWardTrigger.setAttribute("aria-expanded", String(opening));
    });
    document.addEventListener("click", event => {
        if (!adminWardDropdown.contains(event.target)) closeAdminWardOptions();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !adminWardOptions.hidden) {
            closeAdminWardOptions();
            adminWardTrigger.focus();
        }
    });
    renderAdminWardOptions();
}

if (adminRoomFilterTrigger && adminRoomFilterOptions && adminRoomFilterDropdown) {
    adminRoomFilterTrigger.addEventListener("click", () => {
        if (adminRoomFilterTrigger.disabled) return;
        const opening = adminRoomFilterOptions.hidden;
        adminRoomFilterOptions.hidden = !opening;
        adminRoomFilterTrigger.setAttribute("aria-expanded", String(opening));
    });
    document.addEventListener("click", event => {
        if (!adminRoomFilterDropdown.contains(event.target)) closeAdminRoomOptions();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !adminRoomFilterOptions.hidden) {
            closeAdminRoomOptions();
            adminRoomFilterTrigger.focus();
        }
    });
}

async function requestAdminInactiveApi(url, options = {}) {
    const headers = new Headers(options.headers ?? {});
    headers.set("Accept", "application/json");
    if (csrfToken) headers.set(csrfHeader, csrfToken);
    const response = await fetch(url, { ...options, headers, cache: "no-store" });
    if (response.status === 401 || response.redirected) {
        throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
    }
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : null;
    if (!response.ok) {
        throw new Error(data?.message || (response.status === 403
            ? "요청 권한 또는 병원 접속 정보를 확인해 주세요."
            : "요청 처리에 실패했습니다. (" + response.status + ")"));
    }
    if (!contentType.includes("application/json") && response.status !== 204) {
        throw new Error("서버 응답을 확인할 수 없습니다. 다시 로그인해 주세요.");
    }
    return data;
}

function showAdminError(message) {
    document.querySelector("#admin-inactive-error-message").textContent = message;
    adminError.hidden = false;
}

function getAdminFilteredUsers() {
    const query = adminInactiveSearch.value.trim().toLowerCase();
    const caregiver = document.body.dataset.adminJobType === "CAREGIVER";
    // 병동 이름이 같아도 DB의 병동 ID로 정확히 구분한다.
    const wardId = adminInactiveWard.value;
    const roomNumber = caregiver ? adminInactiveRoom.value : "";
    return adminInactiveUsers.filter(user =>
        (caregiver ? user.userName : `${user.userName} ${user.userId}`).toLowerCase().includes(query)
        && (!wardId || (wardId === "UNASSIGNED"
            ? user.wardId == null
            : user.wardId != null && String(user.wardId) === wardId))
        && (!roomNumber || String(user.roomNumber ?? "").replace(/호$/, "") === roomNumber));
}

function getAdminVisibleUsers() {
    return adminSelectedOnly
        ? adminInactiveUsers.filter(user => adminSelectedIds.has(user.userId))
        : getAdminFilteredUsers();
}

function getAdminSelectedUsers() {
    return adminInactiveUsers.filter(user => adminSelectedIds.has(user.userId));
}

function getAdminCurrentPageUsers() {
    const visibleUsers = getAdminVisibleUsers();
    const totalPages = Math.max(1, Math.ceil(visibleUsers.length / ADMIN_INACTIVE_PAGE_SIZE));
    adminInactiveCurrentPage = Math.min(adminInactiveCurrentPage, totalPages);
    const firstIndex = (adminInactiveCurrentPage - 1) * ADMIN_INACTIVE_PAGE_SIZE;
    return visibleUsers.slice(firstIndex, firstIndex + ADMIN_INACTIVE_PAGE_SIZE);
}

function renderAdminInactivePagination(totalUsers) {
    adminInactivePagination.replaceChildren();
    const caregiver = document.body.dataset.adminJobType === "CAREGIVER";
    const totalPages = Math.max(1, Math.ceil(totalUsers / ADMIN_INACTIVE_PAGE_SIZE));
    if (totalPages <= 1 && !caregiver) {
        adminInactivePagination.hidden = true;
        return;
    }

    adminInactivePagination.hidden = false;
    const createButton = (label, page, disabled = false, current = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;
        if (current) {
            button.setAttribute("aria-current", "page");
        } else if (!disabled) {
            button.addEventListener("click", () => {
                adminInactiveCurrentPage = page;
                renderAdminInactiveUsers();
                adminList.scrollTo({ top: 0, behavior: "smooth" });
            });
        }
        return button;
    };

    adminInactivePagination.append(
        createButton("‹", adminInactiveCurrentPage - 1, adminInactiveCurrentPage <= 1),
        ...Array.from({ length: totalPages }, (_, index) =>
            createButton(String(index + 1), index + 1, false, index + 1 === adminInactiveCurrentPage)
        ),
        createButton("›", adminInactiveCurrentPage + 1, adminInactiveCurrentPage >= totalPages)
    );
}

function updateAdminInactiveSelection() {
    const visibleUsers = getAdminCurrentPageUsers();
    const selectedCount = getAdminSelectedUsers().length;
    const currentPageSelectedCount = visibleUsers.filter(user => adminSelectedIds.has(user.userId)).length;
    const disabled = adminBusy || adminLoading || adminLoadFailed;
    adminInactiveSelectAll.checked = visibleUsers.length > 0 && currentPageSelectedCount === visibleUsers.length;
    adminInactiveSelectAll.indeterminate = currentPageSelectedCount > 0
        && currentPageSelectedCount < visibleUsers.length;
    adminInactiveSelectAll.disabled = disabled || !visibleUsers.length;
    document.querySelector("#admin-bulk-count").textContent = "총 " + selectedCount + "명 선택";
    document.querySelector(".admin-bulk-actions").dataset.hasSelection = String(selectedCount > 0);
    if (adminSelectedViewButton && adminClearSelectionButton && adminSelectionSummary) {
        adminSelectedViewButton.textContent = adminSelectedOnly
            ? "검색 결과로 돌아가기" : "선택한 " + selectedCount + "명 모아보기";
        adminSelectedViewButton.setAttribute("aria-pressed", String(adminSelectedOnly));
        adminSelectedViewButton.disabled = disabled;
        adminClearSelectionButton.disabled = disabled || selectedCount === 0;
        const matchingIds = new Set(getAdminFilteredUsers().map(user => user.userId));
        const outsideCount = [...adminSelectedIds].filter(id => !matchingIds.has(id)).length;
        adminSelectionSummary.textContent = selectedCount
            ? "총 " + selectedCount + "명 선택" + (outsideCount ? " · 현재 검색 밖 " + outsideCount + "명 포함" : "")
            : "검색 초기화 후에도 선택한 직원은 유지됩니다.";
    }
    for (const button of adminBulkButtons) {
        button.disabled = disabled || !selectedCount;
    }
    for (const input of adminRows.querySelectorAll("input, select")) input.disabled = disabled;
    // [2026-09-18] 개별 활성화·삭제 버튼도 서버 처리 중에는 비활성화한다.
    for (const button of adminRows.querySelectorAll(".admin-inactive-task")) button.disabled = disabled;
    adminInactiveSearch.disabled = adminBusy || adminLoading;
    adminInactiveWard.disabled = adminBusy || adminLoading || adminLoadFailed;
    if (adminWardTrigger) adminWardTrigger.disabled = adminInactiveWard.disabled;
    if (adminInactiveRoom && adminRoomFilterTrigger) {
        adminInactiveRoom.disabled = adminInactiveWard.disabled || !getSelectedWardNumber();
        adminRoomFilterTrigger.disabled = adminInactiveRoom.disabled;
    }
    document.querySelector("#admin-inactive-retry").disabled = adminBusy || adminLoading;
    adminList.setAttribute("aria-busy", String(adminBusy || adminLoading));
}

function formatAdminDeactivatedDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit"
    }).format(date).replaceAll("-", ".");
}

function renderAdminInactiveUsers() {
    adminRows.replaceChildren();
    const visibleUsers = getAdminVisibleUsers();
    const users = getAdminCurrentPageUsers();
    for (const user of users) {
        const row = document.createElement("tr");
        row.dataset.userId = user.userId;
        const checkCell = document.createElement("td");
        const label = document.createElement("label");
        label.className = "admin-inactive-selection";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.className = "admin-inactive-checkbox";
        checkbox.value = user.userId;
        checkbox.checked = adminSelectedIds.has(user.userId);
        checkbox.setAttribute("aria-label", user.userName + " 선택");
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) adminSelectedIds.add(user.userId);
            else adminSelectedIds.delete(user.userId);
            if (adminSelectedOnly) renderAdminInactiveUsers();
            else updateAdminInactiveSelection();
        });
        label.append(checkbox);
        checkCell.append(label);
        row.append(checkCell);
        const assignment = document.body.dataset.adminJobType === "CAREGIVER"
            ? (user.roomNumber ? `${user.roomNumber}호` : "미배정")
            : (user.wardName || "미배정");
        // [2026-09-22 변경] 비활성화 간병인 목록에서는 내부 아이디와 전화번호 열을 모두 표시하지 않습니다.
        const rowValues = document.body.dataset.adminJobType === "CAREGIVER"
            ? [user.userName, assignment, formatAdminDeactivatedDate(user.deactivatedAt)]
            : [user.userName, user.userId, assignment, formatAdminDeactivatedDate(user.deactivatedAt)];
        for (const value of rowValues) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        }
        const statusCell = document.createElement("td");
        // [2026-09-18] 상태는 배지로 표시하고 활성화·삭제는 별도의 작업 버튼으로 제공한다.
        const actions = document.createElement("div");
        actions.className = "admin-inactive-row-actions";
        const badge = document.createElement("span");
        badge.className = "admin-inactive-badge";
        badge.textContent = "비활성화";
        actions.append(badge);
        for (const [action, label] of [["ACTIVATE", "활성화"], ["DELETE", "삭제"]]) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "admin-inactive-task";
            button.dataset.action = action;
            button.textContent = label;
            button.setAttribute("aria-label", user.userName + " 계정 " + label);
            button.addEventListener("click", () => {
                if (!button.disabled) openAdminStatusChange([user], action, button);
            });
            actions.append(button);
        }
        statusCell.append(actions);
        row.append(statusCell);
        adminRows.append(row);
    }
    document.querySelector("#admin-inactive-count").innerHTML = adminLoadFailed
        ? "—<span>명</span>" : adminInactiveUsers.length + "<span>명</span>";
    const personLabel = document.body.dataset.adminJobType === "CAREGIVER" ? "간병인" : "간호사";
    document.querySelector("#admin-inactive-result").textContent = adminLoading
        ? `${personLabel} 목록을 불러오는 중입니다.`
        : adminLoadFailed ? "목록을 불러오지 못했습니다."
            : adminSelectedOnly ? `선택한 ${personLabel} ` + visibleUsers.length + "명" : "검색 결과 " + visibleUsers.length + "명";
    const empty = document.querySelector("#admin-inactive-empty");
    empty.hidden = adminLoading || adminLoadFailed || visibleUsers.length > 0;
    const filtered = Boolean(adminInactiveSearch.value.trim() || adminInactiveWard.value || adminInactiveRoom?.value);
    document.querySelector("#admin-inactive-empty-title").textContent = adminSelectedOnly
        ? `선택한 ${personLabel}이 없습니다`
        : filtered ? "검색 결과가 없습니다" : `비활성화 ${personLabel}이 없습니다`;
    document.querySelector("#admin-inactive-empty-description").textContent = adminSelectedOnly
        ? `검색 결과로 돌아가 ${personLabel}을 선택해 주세요.`
        : filtered ? (document.body.dataset.adminJobType === "CAREGIVER"
            ? "이름 또는 담당 병실 조건을 다시 확인해 주세요."
            : "이름, 아이디 또는 병동 조건을 다시 확인해 주세요.")
            : `승인완료 목록에서 비활성화한 ${personLabel}이 여기에 표시됩니다.`;
    // [2026-09-18] 검색 옆 초기화 버튼은 결과 유무와 관계없이 표시하고 처리 중에는 비활성화한다.
    document.querySelector("#admin-inactive-reset").disabled = adminBusy || adminLoading;
    renderAdminInactivePagination(visibleUsers.length);
    updateAdminInactiveSelection();
}

async function loadAdminInactiveData() {
    adminLoading = true;
    adminLoadFailed = false;
    adminError.hidden = true;
    renderAdminInactiveUsers();
    try {
        if (!csrfToken) throw new Error("DB 목록은 Spring Boot 서버에 로그인한 뒤 확인해 주세요.");
        const [users, wards] = await Promise.all([
            requestAdminInactiveApi(`/api/admin/users/inactive?jobType=${document.body.dataset.adminJobType === "CAREGIVER" ? "CAREGIVER" : "GENERAL"}`),
            requestAdminInactiveApi("/api/admin/wards")
        ]);
        if (!Array.isArray(users) || !Array.isArray(wards)) throw new Error("목록 응답 형식이 올바르지 않습니다.");
        // 현재 병원 DB에서 조회한 병동 이름을 목록과 필터에 그대로 표시한다.
        const wardNames = new Map(wards.map(ward => [String(ward.wardId), ward.wardName]));
        adminInactiveUsers = users.filter(user => user.authStatus === "INACTIVE").map(user => ({
            ...user,
            wardName: wardNames.get(String(user.wardId)) ?? user.wardName
        }));
        const previousWard = adminInactiveWard.value;
        adminInactiveWard.replaceChildren();
        for (const [value, text] of [
            ["", "전체 병동"],
            ...wards.map(ward => [String(ward.wardId), ward.wardName]),
            ["UNASSIGNED", "미배정"]
        ]) {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = text;
            adminInactiveWard.append(option);
        }
        adminInactiveWard.value = previousWard;
        if (!adminInactiveWard.value) adminInactiveWard.value = "";
        renderAdminWardOptions();
        refreshAdminRoomFilter(false);
        adminSelectedIds = new Set([...adminSelectedIds].filter(id => adminInactiveUsers.some(user => user.userId === id)));
        if (!adminSelectedIds.size) adminSelectedOnly = false;
        return true;
    } catch (error) {
        adminInactiveUsers = [];
        adminSelectedIds.clear();
        adminSelectedOnly = false;
        adminLoadFailed = true;
        showAdminError(error.message || "목록을 불러오지 못했습니다.");
        return false;
    } finally {
        adminLoading = false;
        renderAdminInactiveUsers();
    }
}

function openAdminStatusChange(users, nextStatus, trigger, bulk = false) {
    if (!users.length || adminBusy || adminLoading || adminLoadFailed) return;
    if (nextStatus === "INACTIVE") {
        showAdminFeedback("선택한 직원은 이미 비활성화 상태입니다.");
        return;
    }
    if (!["ACTIVATE", "DELETE"].includes(nextStatus)) return;
    const isDelete = nextStatus === "DELETE";
    const subject = bulk ? "선택한 직원 " + users.length + "명" : users[0].userName + "님";
    adminPendingStatusChange = { users: [...users], nextStatus, trigger, subject };
    // [09.13]수정내용: 계정 삭제 버튼과 확인창의 표현을 일치시켜 삭제 대상을 명확하게 안내한다.
    document.querySelector("#admin-status-dialog-title").textContent = isDelete ? "계정 삭제" : "상태 변경";
    document.querySelector("#admin-status-dialog-description").textContent = isDelete
        ? subject + "의 계정을 정말 삭제하시겠습니까?"
        : subject + "의 상태를 활성화로 바꾸시겠습니까?";
    document.querySelector("#admin-status-dialog-note").textContent = isDelete
        ? "삭제한 계정은 복구할 수 없습니다. 계속 진행하시겠습니까?"
        : "승인완료 상태로 복귀하며, 이전 배정 병동은 유지됩니다.";
    adminStatusConfirm.classList.toggle("admin-delete-confirm", isDelete);
    adminStatusDialog.showModal();
}

async function submitAdminStatusChange(event) {
    event.preventDefault();
    if (!adminPendingStatusChange || adminBusy) return;
    const change = adminPendingStatusChange;
    adminBusy = true;
    adminStatusConfirm.disabled = true;
    adminStatusCancel.disabled = true;
    adminStatusConfirm.textContent = "처리 중…";
    updateAdminInactiveSelection();
    const failures = [];
    let succeeded = 0;
    try {
        // 각 계정의 결과를 구분하여 일부 실패를 전체 성공으로 표시하지 않는다.
        for (const user of change.users) {
            try {
                const action = change.nextStatus === "DELETE" ? "inactive" : "activate";
                await requestAdminInactiveApi("/api/admin/users/" + encodeURIComponent(user.userId) + "/" + action, {
                    method: change.nextStatus === "DELETE" ? "DELETE" : "PATCH"
                });
                succeeded += 1;
                adminSelectedIds.delete(user.userId);
            } catch (error) {
                failures.push(user.userName + " (" + user.userId + "): " + error.message);
            }
        }
        adminPendingStatusChange = null;
        adminStatusDialog.close();
        if (!failures.length && change.nextStatus === "ACTIVATE") {
            // [2026.09.16] 고친 내용: 삭제한 복귀 링크 대신 활성화 완료 후 관리자 직원 관리 화면으로 이동합니다.
            window.location.assign(document.body.dataset.adminJobType === "CAREGIVER" ? "/admin/caregivers?status=APPROVED" : "/admin?status=APPROVED");
            return;
        }
        const loaded = await loadAdminInactiveData();
        if (failures.length) {
            showAdminError(succeeded + "명 처리 완료 / " + failures.length + "명 실패\n" + failures.join("\n")
                + (loaded ? "" : "\n최신 목록도 불러오지 못했습니다. 다시 불러오기를 눌러 주세요."));
        }
        if (succeeded) {
            // [2026-09-18] 계정 삭제 성공 시 확인 버튼이 있는 브라우저 기본 알림창으로 완료를 안내한다.
            if (change.nextStatus === "DELETE") {
                clearTimeout(adminToastTimer);
                adminFeedback.hidden = true;
                // [2026-09-18] 삭제 완료 문구에서 인원수 표시를 제거한다.
                window.alert("계정 삭제가 완료되었습니다."
                    + (failures.length ? "\n" + failures.length + "명은 삭제하지 못했습니다. 화면의 오류 안내를 확인해 주세요." : ""));
            } else {
                showAdminFeedback(succeeded + "명의 계정을 활성화했습니다.");
            }
        }
        adminInactiveSearch.focus();
    } finally {
        adminBusy = false;
        adminStatusConfirm.disabled = false;
        adminStatusCancel.disabled = false;
        adminStatusConfirm.textContent = "확인";
        updateAdminInactiveSelection();
    }
}

adminInactiveSelectAll.addEventListener("change", () => {
    for (const user of getAdminCurrentPageUsers()) {
        if (adminInactiveSelectAll.checked) adminSelectedIds.add(user.userId);
        else adminSelectedIds.delete(user.userId);
    }
    renderAdminInactiveUsers();
});
adminSelectedViewButton?.addEventListener("click", () => {
    if (adminBusy || adminLoading || adminLoadFailed) return;
    adminSelectedOnly = !adminSelectedOnly;
    adminInactiveCurrentPage = 1;
    renderAdminInactiveUsers();
});
adminClearSelectionButton?.addEventListener("click", () => {
    if (adminBusy || adminLoading || adminLoadFailed) return;
    adminSelectedIds.clear();
    adminSelectedOnly = false;
    adminInactiveCurrentPage = 1;
    renderAdminInactiveUsers();
});
for (const button of adminBulkButtons) {
    button.addEventListener("click", () => openAdminStatusChange(
        getAdminSelectedUsers(), button.dataset.bulkStatus, button, true
    ));
}
document.querySelector("#admin-status-form").addEventListener("submit", submitAdminStatusChange);
adminStatusCancel.addEventListener("click", () => adminStatusDialog.close());
adminStatusDialog.addEventListener("cancel", event => {
    if (adminBusy) event.preventDefault();
});
adminStatusDialog.addEventListener("close", () => {
    const change = adminPendingStatusChange;
    adminPendingStatusChange = null;
    change?.trigger.focus();
});
document.querySelector("#admin-inactive-search-form").addEventListener("submit", event => {
    event.preventDefault();
    if (!adminBusy) {
        adminSelectedOnly = false;
        adminInactiveCurrentPage = 1;
        renderAdminInactiveUsers();
    }
});
adminInactiveSearch.addEventListener("input", () => {
    adminSelectedOnly = false;
    adminInactiveCurrentPage = 1;
    renderAdminInactiveUsers();
});
adminInactiveWard.addEventListener("change", () => {
    adminSelectedOnly = false;
    adminInactiveCurrentPage = 1;
    renderAdminWardOptions();
    refreshAdminRoomFilter(true);
    renderAdminInactiveUsers();
});
adminInactiveRoom?.addEventListener("change", () => {
    adminSelectedOnly = false;
    adminInactiveCurrentPage = 1;
    renderAdminRoomOptions();
    renderAdminInactiveUsers();
});
document.querySelector("#admin-inactive-reset").addEventListener("click", () => {
    if (adminBusy || adminLoading) return;
    adminInactiveSearch.value = "";
    adminInactiveWard.value = "";
    if (adminInactiveRoom) adminInactiveRoom.value = "";
    adminSelectedOnly = false;
    renderAdminWardOptions();
    closeAdminWardOptions();
    refreshAdminRoomFilter(true);
    adminInactiveCurrentPage = 1;
    renderAdminInactiveUsers();
    adminInactiveSearch.focus();
});
document.querySelector("#admin-inactive-retry").addEventListener("click", loadAdminInactiveData);

updateAdminClock();
setInterval(updateAdminClock, 30000);
window.addEventListener("admin-job-type-changed", () => {
    adminSelectedIds.clear();
    adminSelectedOnly = false;
    adminInactiveCurrentPage = 1;
    const caregiver = document.body.dataset.adminJobType === "CAREGIVER";
    document.querySelector("#admin-inactive-stat-title").textContent = caregiver ? "비활성화 간병인" : "비활성화 간호사";
    const identifierHeading = document.querySelector("#admin-inactive-identifier-heading");
    if (identifierHeading) {
        identifierHeading.textContent = "아이디";
        identifierHeading.hidden = caregiver;
    }
    const assignmentHeading = document.querySelector("#admin-inactive-assignment-heading");
    if (assignmentHeading) assignmentHeading.textContent = caregiver ? "담당 병실" : "병동";
    document.querySelector("#admin-inactive-list-title").textContent = caregiver ? "간병인 목록" : "간호사 목록";
    adminInactivePagination?.setAttribute("aria-label", caregiver ? "비활성화 간병인 목록 페이지" : "비활성화 간호사 목록 페이지");
    document.querySelector("#admin-inactive-list-description").textContent = caregiver
        ? "간병인 정보와 담당 병실을 확인한 뒤 사용 상태를 변경합니다."
        : "계정 정보와 병동을 확인한 후 상태를 변경해 주세요.";
    const activateButton = document.querySelector('[data-bulk-status="ACTIVATE"]');
    const deleteButton = document.querySelector('[data-bulk-status="DELETE"]');
    if (activateButton) activateButton.textContent = caregiver ? "활성화" : "계정 활성화";
    if (deleteButton) deleteButton.textContent = caregiver ? "삭제" : "계정 삭제";
    const searchLabel = document.querySelector('label[for="admin-inactive-search"]');
    const searchText = caregiver ? "이름 검색" : "이름 또는 아이디 검색";
    if (searchLabel) searchLabel.textContent = searchText;
    adminInactiveSearch.placeholder = searchText;
    refreshAdminRoomFilter(true);
    document.querySelector("#admin-inactive-view .admin-heading > p").textContent = caregiver
        ? "비활성화된 간병인 정보를 조회하고 사용 상태를 관리합니다."
        : "간호사의 서비스 이용 상태를 확인하고 계정 접근 권한을 관리합니다.";
    document.querySelector("#admin-account-guide-title").textContent = caregiver
        ? "간병인 사용 상태 관리"
        : "계정 상태 관리";
    const accountGuideDescription = document.querySelector("#admin-inactive-view .admin-account-guide p");
    if (accountGuideDescription) {
        accountGuideDescription.innerHTML = caregiver
            ? "비활성화된 간병인은 SMS 수신 대상에서 제외됩니다. 다시 담당자로 지정하려면 <strong>활성화</strong>해 주세요."
            : "비활성화된 계정은 서비스에 로그인할 수 없습니다. 서비스 이용을 재개할 직원은 <strong>활성화</strong>로 변경해 주세요.";
    }
    loadAdminInactiveData();
});
if (document.body.dataset.adminJobType === "CAREGIVER") {
    window.dispatchEvent(new CustomEvent("admin-job-type-changed"));
} else {
    loadAdminInactiveData();
}

})();
