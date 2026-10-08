"use strict";

let adminUsers = [];
let adminJobType = window.location.pathname.startsWith("/admin/caregivers") || new URLSearchParams(window.location.search).get("view")?.includes("caregivers") ? "CAREGIVER" : "GENERAL";
let adminLoadVersion = 0;
document.body.dataset.adminJobType = adminJobType;
let adminWards = [];
let adminActiveStatus = "ALL";
let adminSearchQuery = "";
let adminHistoryFilter = "전체";
let adminSelectedUser = null;
let adminAction = "";
let adminToastTimer = null;
// 직원 관리 목록은 비활성화 직원 목록과 같은 크기로 페이지를 나눕니다.
let adminUserPage = 1;
let adminHistoryPage = 1;
const ADMIN_LIST_PAGE_SIZE = 10;
// [2026.09.29 변경] 간호사·간병인 관리 목록은 15명까지 표시하고, 16명부터 다음 페이지로 이동합니다.
const ADMIN_USER_PAGE_SIZE = 15;
// [2026.09.29 변경] 간병인 관리 이력은 더 짧은 단위로 나누어 1·2·3 페이지 이동을 쉽게 확인합니다.
const ADMIN_CAREGIVER_HISTORY_PAGE_SIZE = 10;

const adminRows = document.querySelector("#admin-user-rows");
const adminTabs = Array.from(document.querySelectorAll("[data-status]"));
const adminDialog = document.querySelector("#admin-action-dialog");
const adminDialogTitle = document.querySelector("#admin-dialog-title");
const adminDialogDescription = document.querySelector("#admin-dialog-description");
const adminDialogConfirm = document.querySelector("#admin-dialog-confirm");
const adminDialogCancel = document.querySelector("#admin-dialog-cancel");
const adminRoomWardField = document.querySelector("#admin-room-ward-field");
const adminRoomWardSelect = document.querySelector("#admin-room-ward-select");
const adminRoomWardDropdown = document.querySelector("#admin-room-ward-dropdown");
const adminRoomWardTrigger = document.querySelector("#admin-room-ward-trigger");
const adminRoomWardValue = document.querySelector("#admin-room-ward-value");
const adminRoomWardOptions = document.querySelector("#admin-room-ward-options");
const adminWardField = document.querySelector("#admin-ward-field");
const adminWardSelect = document.querySelector("#admin-ward-select");
const adminActionWardDropdown = document.querySelector("#admin-action-ward-dropdown");
const adminActionWardTrigger = document.querySelector("#admin-action-ward-trigger");
const adminActionWardValue = document.querySelector("#admin-action-ward-value");
const adminActionWardOptions = document.querySelector("#admin-action-ward-options");
// [2026.09.30 추가] 간호사 담당 병동 변경 팝업의 담당 병실(선택 사항, 여러 개 선택)
const adminStaffRoomField = document.querySelector("#admin-staff-room-field");
const adminStaffRoomDropdown = document.querySelector("#admin-staff-room-dropdown");
const adminStaffRoomTrigger = document.querySelector("#admin-staff-room-trigger");
const adminStaffRoomOptions = document.querySelector("#admin-staff-room-options");
const adminStaffRoomValue = document.querySelector("#admin-staff-room-value");
let adminStaffRooms = new Set();
const adminSearchForm = document.querySelector("#admin-search-form");
const adminSearchInput = document.querySelector("#admin-search-input");
const adminEmpty = document.querySelector("#admin-empty");
const adminFeedback = document.querySelector("#admin-feedback");
const adminTotalCount = document.querySelector("#admin-total-count");
const adminApprovedCount = document.querySelector("#admin-approved-count");
const adminPendingCount = document.querySelector("#admin-pending-count");
const adminList = document.querySelector("#admin-list");
const adminClock = document.querySelector("#admin-clock");
const adminCreateDialog = document.querySelector("#admin-create-dialog");
const adminCreateForm = document.querySelector("#admin-create-form");
const adminCreateWard = document.querySelector("#admin-create-ward");
const adminCreateCompleteDialog = document.querySelector("#admin-create-complete-dialog");
const adminHistoryEventDialog = document.querySelector("#admin-history-event-dialog");
const adminPasswordResetDialog = document.querySelector("#admin-password-reset-dialog");
const adminDeactivateDialog = document.querySelector("#admin-deactivate-dialog");
const adminManagementChoiceDialog = document.querySelector("#admin-management-choice-dialog");
const adminManagementChoiceDescription = document.querySelector("#admin-management-choice-description");
const adminManagementOptions = Array.from(document.querySelectorAll(".admin-management-option"));
const adminManagementChoiceConfirm = document.querySelector("#admin-management-choice-confirm");
const adminPhoneEditDialog = document.querySelector("#admin-phone-edit-dialog");
const adminPhoneEditForm = document.querySelector("#admin-phone-edit-form");
const adminPhoneEditDescription = document.querySelector("#admin-phone-edit-description");
const adminPhoneEditInput = document.querySelector("#admin-phone-edit-input");
const adminPhoneEditError = document.querySelector("#admin-phone-edit-error");
const adminPage = document.querySelector("#admin-management-page");
let adminManagementChoiceAction = "";
let adminModalScrollPosition = 0;
let pendingDeactivateRow = null;
let pendingEventRow = null;
const adminHistoryRows = document.querySelector("#admin-history-rows");
const adminUserPagination = document.querySelector("#admin-user-pagination");
const adminHistoryPagination = document.querySelector("#admin-history-pagination");
const currentAdminId = document.querySelector("#admin-management-page")?.dataset.adminId || "admin01";
const historyFilterCards = [...document.querySelectorAll(".history-filter-card")];

const csrfToken = document.querySelector('meta[name="_csrf"]')?.content ?? "";
const csrfHeader = document.querySelector('meta[name="_csrf_header"]')?.content ?? "X-CSRF-TOKEN";

/* [9.15] 추가내용: 목록 화면에서 공통으로 사용하는 페이지 번호 버튼을 만든다. */
function renderAdminPagination(container, currentPage, totalPages, onPageChange, showSinglePage = false, currentOnly = false) {
    if (!container) return;

    container.replaceChildren();

    if (totalPages <= 1 && !showSinglePage) {
        container.hidden = true;
        return;
    }

    container.hidden = false;

    const createButton = (label, page, disabled = false, current = false) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = disabled;

        if (current) {
            button.setAttribute("aria-current", "page");
        } else if (!disabled) {
            button.addEventListener("click", () => onPageChange(page));
        }

        return button;
    };

    container.append(createButton("‹", currentPage - 1, currentPage === 1));

    for (let page = 1; page <= totalPages; page++) {
        container.append(createButton(String(page), page, false, page === currentPage));
    }

    container.append(createButton("›", currentPage + 1, currentPage === totalPages));
}

/**
 * 관리자 API 요청
 * GET 이외의 요청에는 CSRF 토큰을 포함한다.
 */
async function requestAdminApi(url, options = {}) {
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers ?? {});
    headers.set("Accept", "application/json");

    if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken) {
        headers.set(csrfHeader, csrfToken);
    }

    const response = await fetch(url, {
        ...options,
        method,
        headers,
        credentials: "same-origin",
        cache: "no-store"
    });

    if (response.status === 401 || response.redirected) {
        window.location.href = "/login";
        throw new Error("로그인이 만료되었습니다.");
    }

    if (response.status === 403) {
        throw new Error("요청 권한이 없거나 보안 정보가 만료되었습니다.");
    }

    if (!response.ok) {
        let message = `요청 처리에 실패했습니다. (${response.status})`;

        try {
            const errorBody = await response.json();
            if (errorBody.message) message = errorBody.message;
        } catch (error) {
            // JSON 응답이 아니면 기본 오류 메시지를 사용한다.
        }

        throw new Error(message);
    }

    if (response.status === 204) return null;

    const contentType = response.headers.get("content-type") ?? "";

    if (!contentType.includes("application/json")) {
        throw new Error("서버에서 올바른 JSON 응답을 받지 못했습니다.");
    }

    const responseText = await response.text();
    return responseText ? JSON.parse(responseText) : null;
}

/**
 * 화면 아래쪽에 처리 결과를 표시한다.
 */
function showAdminFeedback(message) {
    clearTimeout(adminToastTimer);

    adminFeedback.textContent = message;
    adminFeedback.hidden = false;

    adminToastTimer = setTimeout(() => {
        adminFeedback.hidden = true;
    }, 4000);
}

/**
 * 1번 API의 사용자 목록과
 * 2번 API의 승인 완료 사용자 상세 정보를 합친다.
 */
function combineAdminUsers(users, approvedUsers) {
    const approvedUserMap = new Map(
        approvedUsers.map(user => [user.userId, user])
    );

    return users.map(user => {
        const approvedDetail = approvedUserMap.get(user.userId);

        return {
            userId: user.userId,
            name: approvedDetail?.userName ?? user.name ?? "",
            status: approvedDetail?.authStatus ?? user.status ?? "",
            wardId: approvedDetail?.wardId ?? null,
            ward: approvedDetail?.wardName ?? user.ward ?? "미배정",
            phoneNumber: approvedDetail?.phoneNumber ?? null,
            roomNumber: approvedDetail?.roomNumber ?? null,
            // [2026.09.30 추가] 간호사 담당 병실(선택 사항, 여러 개). 서버는 "301,302" 처럼 보낸다.
            assignedRooms: approvedDetail?.assignedRooms ? String(approvedDetail.assignedRooms).split(",") : []
        };
    });
}

/*
 * [2026.09.30 추가] 간호사 담당 병실 공통 처리(계정 생성 팝업 account-create.js 와 담당 병동 변경 팝업이 함께 사용).
 * 병실 번호는 간병인과 같은 규칙입니다: 병동 번호 × 100 + 1~17 (3병동이면 301~317호).
 * 한 병실을 여러 간호사가 담당할 수 있어, 다른 간호사가 담당 중인 병실도 고를 수 있습니다(이름만 참고로 표시).
 */
window.adminStaffRooms = {
    // "3병동" → 3. 이 모양이 아닌 병동은 담당 병실을 지정하지 않습니다.
    wardNumber(wardName) {
        const matched = String(wardName ?? "").replace(/\s/g, "").match(/^(\d+)병동$/);
        return matched ? Number(matched[1]) : null;
    },
    roomsOf(wardNumber) {
        return wardNumber ? Array.from({ length: 17 }, (_, index) => String(wardNumber * 100 + index + 1)) : [];
    },
    // 301·302호 / 301호 외 3개
    format(rooms) {
        const sorted = [...rooms].map(String).sort((a, b) => Number(a) - Number(b));
        if (!sorted.length) return "";
        return sorted.length <= 3 ? `${sorted.join("·")}호` : `${sorted[0]}호 외 ${sorted.length - 1}개`;
    },
    // 같은 병동에서 다른 간호사가 담당하는 병실: 병실 번호 → 간호사 이름 목록
    owners(wardId, exceptUserId) {
        const owners = new Map();
        for (const user of adminUsers) {
            if (user.userId === exceptUserId || String(user.wardId) !== String(wardId)) continue;
            for (const room of user.assignedRooms ?? []) {
                const key = String(room);
                owners.set(key, [...(owners.get(key) ?? []), user.name]);
            }
        }
        return owners;
    },
    // 병실 목록 한 줄: "305호" 뒤에 담당 중인 다른 간호사를 흐린 글씨로 덧붙입니다(고르는 데는 제한 없음).
    optionContent(button, room, names) {
        button.textContent = `${room}호`;
        if (!names?.length) return;
        const owner = document.createElement("span");
        owner.className = "admin-staff-room-owner";
        owner.textContent = ` · ${names.length > 1 ? `${names[0]} 외 ${names.length - 1}명` : names[0]} 담당`;
        button.append(owner);
    }
};

/**
 * 사용자 목록과 병동 목록을 DB에서 불러온다.
 */
async function loadAdminData(silent = false) {
    const requestVersion = ++adminLoadVersion;
    const requestedJobType = adminJobType;
    try {
        const [users, approvedUsers, wards] = await Promise.all([
            requestAdminApi(`/api/admin/users?jobType=${requestedJobType}`),
            requestAdminApi(`/api/admin/users/approved?jobType=${requestedJobType}`),
            requestAdminApi("/api/admin/wards")
        ]);
        if (requestVersion !== adminLoadVersion) return;

        adminUsers = combineAdminUsers(users ?? [], approvedUsers ?? []);
        adminWards = wards ?? [];

        renderAdminWardOptions();
        renderAdminUsers();
    } catch (error) {
        if (requestVersion !== adminLoadVersion) return;
        console.error(error);

        adminUsers = [];
        adminWards = [];

        renderAdminWardOptions();
        renderAdminUsers();

        if (!silent) {
            showAdminFeedback(error.message || "관리자 정보를 불러오지 못했습니다.");
        }

        throw error;
    }
}

/**
 * DB에서 불러온 병동을 선택란에 추가한다.
 */
/**
 * DB의 1~6병동을 화면에서 A~F병동으로 표시한다.
 * DB에 이미 A병동처럼 저장돼 있거나 다른 이름이면 원래 이름을 유지한다.
 */
function formatAdminWardName(wardName) {
    const name = String(wardName ?? "").trim();
    const numberedWard = /^([1-6])\s*병동$/.exec(name);

    return numberedWard
        ? `${"ABCDEF"[Number(numberedWard[1]) - 1]}병동`
        : name;
}

/**
 * DB에서 불러온 병동을 선택란에 추가한다.
 * 서버로 전송되는 값은 실제 DB의 숫자 wardId를 사용한다.
 */
function renderAdminWardOptions() {
    adminWardSelect.replaceChildren();

    if (adminCreateWard) {
        adminCreateWard.replaceChildren();
    }

    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "병동을 선택해주세요";
    adminWardSelect.append(emptyOption);
    if (adminCreateWard) {
        const createEmpty = emptyOption.cloneNode(true);
        createEmpty.textContent = "담당 병동을 선택해주세요";
        adminCreateWard.append(createEmpty);
    }

    for (const ward of adminWards) {
        const option = document.createElement("option");

        option.value = String(ward.wardId);
        option.textContent = ward.wardName;

        adminWardSelect.append(option);

        if (adminCreateWard) {
            adminCreateWard.append(option.cloneNode(true));
        }
    }
    renderAdminActionWardDropdown();
}

function renderAdminRoomOptions() {
    adminWardSelect.replaceChildren(new Option("병실을 선택해 주세요", ""));
    const wardNumber = Number(adminRoomWardSelect.value);
    adminWardSelect.disabled = !wardNumber;
    if (!wardNumber) adminWardSelect.options[0].textContent = "병동을 먼저 선택해 주세요";
    for (let roomNumber = wardNumber * 100 + 1; wardNumber && roomNumber <= wardNumber * 100 + 17; roomNumber += 1) {
        adminWardSelect.append(new Option(`${roomNumber}호`, String(roomNumber)));
    }
    renderAdminActionWardDropdown();
}

function closeAdminRoomWardOptions() {
    adminRoomWardOptions.hidden = true;
    adminRoomWardTrigger.setAttribute("aria-expanded", "false");
    adminDialog.classList.remove("ward-menu-overflow");
}

function renderAdminRoomWardDropdown() {
    const selected = adminRoomWardSelect.selectedOptions[0];
    adminRoomWardValue.textContent = selected?.textContent || "병동을 선택해 주세요";
    adminRoomWardOptions.replaceChildren();
    for (const option of adminRoomWardSelect.options) {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = option.textContent;
        item.dataset.value = option.value;
        item.setAttribute("aria-selected", String(option.selected));
        item.addEventListener("click", () => {
            adminRoomWardSelect.value = option.value;
            adminRoomWardSelect.dispatchEvent(new Event("change", {bubbles: true}));
            renderAdminRoomWardDropdown();
            closeAdminRoomWardOptions();
            adminRoomWardTrigger.focus();
        });
        adminRoomWardOptions.append(item);
    }
}

adminRoomWardSelect.addEventListener("change", () => {
    closeAdminActionWardOptions();
    renderAdminRoomWardDropdown();
    renderAdminRoomOptions();
});

adminRoomWardTrigger.addEventListener("click", () => {
    if (!adminRoomWardOptions.hidden) {
        closeAdminRoomWardOptions();
        return;
    }
    closeAdminActionWardOptions();
    renderAdminRoomWardDropdown();
    adminRoomWardOptions.hidden = false;
    adminRoomWardTrigger.setAttribute("aria-expanded", "true");
    adminDialog.classList.add("ward-menu-overflow");
});

function closeAdminActionWardOptions() {
    adminActionWardOptions.hidden = true;
    adminActionWardTrigger.setAttribute("aria-expanded", "false");
    adminActionWardDropdown.classList.remove("open-up");
    adminActionWardOptions.classList.remove("is-fixed-menu");
    adminActionWardOptions.style.top = "";
    adminActionWardOptions.style.left = "";
    adminActionWardOptions.style.width = "";
    adminActionWardOptions.style.maxHeight = "";
    adminDialog.classList.remove("ward-menu-overflow");
}

/*
 * [2026.09.30 추가] 간호사 담당 병실 선택(담당 병동 변경 팝업). 계정 생성 팝업과 같은 방식으로 여러 병실을 눌러 고르고,
 * 다시 누르면 빠집니다. 다른 간호사가 담당 중인 병실은 그 이름을 흐린 글씨로 함께 보여 줍니다.
 */
function renderAdminStaffRoomDropdown() {
    const selectedWard = adminWardSelect.value ? adminWardSelect.selectedOptions[0]?.textContent : "";
    const wardNumber = window.adminStaffRooms.wardNumber(selectedWard);
    adminStaffRoomOptions.replaceChildren();
    adminStaffRoomTrigger.disabled = !wardNumber;
    adminStaffRoomValue.textContent = !adminWardSelect.value ? "병동을 먼저 선택해 주세요"
        : !wardNumber ? "이 병동은 담당 병실을 지정하지 않습니다"
        : adminStaffRooms.size ? window.adminStaffRooms.format(adminStaffRooms) : "담당 병실 없음 (선택 사항)";
    if (!wardNumber) return;
    const owners = window.adminStaffRooms.owners(adminWardSelect.value, adminSelectedUser?.userId);
    for (const room of window.adminStaffRooms.roomsOf(wardNumber)) {
        const item = document.createElement("button");
        item.type = "button";
        item.setAttribute("role", "option");
        window.adminStaffRooms.optionContent(item, room, owners.get(room));
        item.setAttribute("aria-selected", String(adminStaffRooms.has(room)));
        item.addEventListener("click", () => {
            if (adminStaffRooms.has(room)) adminStaffRooms.delete(room);
            else adminStaffRooms.add(room);
            item.setAttribute("aria-selected", String(adminStaffRooms.has(room)));
            adminStaffRoomValue.textContent = adminStaffRooms.size
                ? window.adminStaffRooms.format(adminStaffRooms) : "담당 병실 없음 (선택 사항)";
        });
        adminStaffRoomOptions.append(item);
    }
}

function closeAdminStaffRoomOptions() {
    adminStaffRoomOptions.hidden = true;
    adminStaffRoomTrigger.setAttribute("aria-expanded", "false");
    adminStaffRoomDropdown.classList.remove("open-up");
    adminStaffRoomOptions.style.maxHeight = "";
    adminDialog.classList.remove("staff-room-menu-open");
}

adminStaffRoomTrigger.addEventListener("click", () => {
    if (adminStaffRoomTrigger.disabled) return;
    if (!adminStaffRoomOptions.hidden) {
        closeAdminStaffRoomOptions();
        return;
    }
    adminStaffRoomOptions.hidden = false;
    adminStaffRoomTrigger.setAttribute("aria-expanded", "true");
    adminDialog.classList.add("staff-room-menu-open");
    // 아래 공간이 부족하면 병동 목록처럼 위로 펼치고 팝업 안에 들어가게 줄입니다.
    const trigger = adminStaffRoomTrigger.getBoundingClientRect();
    const menuHeight = adminStaffRoomOptions.getBoundingClientRect().height;
    if (menuHeight > window.innerHeight - trigger.bottom - 12) {
        const dialog = adminDialog.getBoundingClientRect();
        adminStaffRoomDropdown.classList.add("open-up");
        adminStaffRoomOptions.style.maxHeight = `${Math.max(96, Math.floor(trigger.top - dialog.top - 12))}px`;
    }
});

document.addEventListener("click", event => {
    if (!adminStaffRoomDropdown.contains(event.target)) closeAdminStaffRoomOptions();
});

// 병동을 바꾸면 그 병동의 병실로 다시 고릅니다. 원래 병동으로 돌아오면 지금 담당 병실을 다시 보여 줍니다.
adminWardSelect.addEventListener("change", () => {
    if (adminAction !== "ASSIGN" || !adminSelectedUser) return;
    adminStaffRooms = new Set(String(adminWardSelect.value) === String(adminSelectedUser.wardId)
        ? (adminSelectedUser.assignedRooms ?? []) : []);
    closeAdminStaffRoomOptions();
    renderAdminStaffRoomDropdown();
});

function renderAdminActionWardDropdown() {
    const selected = adminWardSelect.selectedOptions[0];
    adminActionWardValue.textContent = selected?.textContent || "병동을 선택해주세요";
    adminActionWardTrigger.disabled = adminWardSelect.disabled;
    adminActionWardOptions.replaceChildren();
    for (const option of adminWardSelect.options) {
        const item = document.createElement("button");
        item.type = "button";
        item.textContent = option.textContent;
        item.dataset.value = option.value;
        item.setAttribute("aria-selected", String(option.selected));
        item.addEventListener("click", () => {
            adminWardSelect.value = option.value;
            adminWardSelect.dispatchEvent(new Event("change", { bubbles: true }));
            renderAdminActionWardDropdown();
            closeAdminActionWardOptions();
            adminActionWardTrigger.focus();
        });
        adminActionWardOptions.append(item);
    }
}

adminActionWardTrigger.addEventListener("click", () => {
    if (!adminActionWardOptions.hidden) {
        closeAdminActionWardOptions();
        return;
    }
    renderAdminActionWardDropdown();
    adminActionWardOptions.hidden = false;
    adminActionWardTrigger.setAttribute("aria-expanded", "true");

    // [2026.09.22 변경] 간병인 담당 병실 목록은 공간과 관계없이 선택칸 아래로 펼칩니다.
    if (adminAction === "ASSIGN_ROOM") {
        adminActionWardDropdown.classList.remove("open-up");
        const trigger = adminActionWardTrigger.getBoundingClientRect();
        adminActionWardOptions.classList.add("is-fixed-menu");
        adminActionWardOptions.style.top = `${Math.round(trigger.bottom + 5)}px`;
        adminActionWardOptions.style.left = `${Math.round(trigger.left)}px`;
        adminActionWardOptions.style.width = `${Math.round(trigger.width)}px`;
        adminActionWardOptions.style.maxHeight = `${Math.max(120, Math.min(240, Math.floor(window.innerHeight - trigger.bottom - 16)))}px`;
        adminDialog.classList.add("ward-menu-overflow");
        return;
    }

    const trigger = adminActionWardTrigger.getBoundingClientRect();
    const menuHeight = adminActionWardOptions.getBoundingClientRect().height;
    if (menuHeight <= window.innerHeight - trigger.bottom - 12) {
        adminDialog.classList.add("ward-menu-overflow");
    } else {
        const dialog = adminDialog.getBoundingClientRect();
        adminActionWardDropdown.classList.add("open-up");
        adminActionWardOptions.style.maxHeight = `${Math.max(96, Math.floor(trigger.top - dialog.top - 12))}px`;
    }
});

document.addEventListener("click", event => {
    if (!adminActionWardDropdown.contains(event.target)) closeAdminActionWardOptions();
    if (!adminRoomWardDropdown.contains(event.target)) closeAdminRoomWardOptions();
});
adminDialog.addEventListener("keydown", event => {
    if (event.key === "Escape" && !adminRoomWardOptions.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeAdminRoomWardOptions();
        adminRoomWardTrigger.focus();
        return;
    }
    if (event.key === "Escape" && !adminActionWardOptions.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeAdminActionWardOptions();
        adminActionWardTrigger.focus();
    }
}, true);

/**
 * 전체, 승인 완료, 승인 대기 인원을 계산한다.
 */
function renderAdminCounts() {
    if (!adminTotalCount || !adminApprovedCount || !adminPendingCount) {
        return;
    }
    const approvedCount = adminUsers.filter(
        user => user.status === "APPROVED"
    ).length;

    const pendingCount = adminUsers.filter(
        user => user.status === "PENDING"
    ).length;

    adminTotalCount.textContent = `${approvedCount + pendingCount}명`;
    adminApprovedCount.textContent = `${approvedCount}명`;
    adminPendingCount.textContent = `${pendingCount}명`;
    // 관리자 홈의 간호사 수에는 간병인 계정을 포함하지 않습니다.
    const homeStaffCount = document.querySelector("#admin-home-staff-count");
    if (homeStaffCount && adminJobType === "GENERAL") homeStaffCount.textContent = String(approvedCount);
}

/**
 * [2026-09-21] 관리자 홈의 간호사·간병인 카드는 현재 병원 DB의 승인 완료 계정 수를 각각 표시한다.
 */
async function loadAdminHomeAccountCounts() {
    const nurseCount = document.querySelector("#admin-home-staff-count");
    const caregiverCount = document.querySelector("#admin-home-caregiver-count");
    if (!nurseCount || !caregiverCount) return;

    try {
        const [nurses, caregivers] = await Promise.all([
            requestAdminApi("/api/admin/users/approved?jobType=GENERAL"),
            requestAdminApi("/api/admin/users/approved?jobType=CAREGIVER")
        ]);
        nurseCount.textContent = String(Array.isArray(nurses) ? nurses.length : 0);
        caregiverCount.textContent = String(Array.isArray(caregivers) ? caregivers.length : 0);
    } catch (error) {
        nurseCount.textContent = "—";
        caregiverCount.textContent = "—";
        console.error(error);
    }
}

// 관리자 홈 달력은 브라우저의 현재 월을 기준으로 만들고, 이전·다음 달 이동 시 날짜를 다시 그립니다.
const adminCalendarMonth = document.querySelector("#admin-calendar-month");
const adminCalendarDates = document.querySelector("#admin-calendar-dates");
let adminCalendarDate = new Date();
adminCalendarDate = new Date(adminCalendarDate.getFullYear(), adminCalendarDate.getMonth(), 1);

function renderAdminCalendar() {
    if (!adminCalendarMonth || !adminCalendarDates) return;
    const year = adminCalendarDate.getFullYear();
    const month = adminCalendarDate.getMonth();
    const today = new Date();
    adminCalendarMonth.textContent = `${year}년 ${month + 1}월`;
    adminCalendarDates.replaceChildren();
    for (let index = 0; index < new Date(year, month, 1).getDay(); index += 1) {
        const empty = document.createElement("span");
        empty.className = "admin-calendar-empty";
        empty.setAttribute("aria-hidden", "true");
        adminCalendarDates.append(empty);
    }
    for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day += 1) {
        const date = document.createElement("time");
        date.dateTime = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        date.textContent = String(day);
        if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
            date.classList.add("is-today");
            date.setAttribute("aria-label", `${month + 1}월 ${day}일 오늘`);
        }
        adminCalendarDates.append(date);
    }
}

document.querySelector("#admin-calendar-prev")?.addEventListener("click", () => {
    adminCalendarDate = new Date(adminCalendarDate.getFullYear(), adminCalendarDate.getMonth() - 1, 1);
    renderAdminCalendar();
});
document.querySelector("#admin-calendar-next")?.addEventListener("click", () => {
    adminCalendarDate = new Date(adminCalendarDate.getFullYear(), adminCalendarDate.getMonth() + 1, 1);
    renderAdminCalendar();
});
renderAdminCalendar();

/**
 * 선택한 승인 상태와 검색어에 맞는 목록을 출력한다.
 */
function renderAdminUsers() {
    filterHistory(adminHistoryFilter);
    renderAdminCounts();

    const visibleUsers = adminUsers.filter(user => {
        const sameStatus = adminActiveStatus === "ALL" || user.status === adminActiveStatus;
        const phoneNumber = user.phoneNumber || "";
        const searchableText = `${user.name} ${user.userId} ${phoneNumber} ${formatPhoneInput(phoneNumber)} ${user.ward || ""}`.toLowerCase();
        const matchesSearch = searchableText.includes(adminSearchQuery);

        return sameStatus && matchesSearch;
    });

    const totalPages = Math.max(1, Math.ceil(visibleUsers.length / ADMIN_USER_PAGE_SIZE));
    adminUserPage = Math.min(adminUserPage, totalPages);
    const pageUsers = visibleUsers.slice(
        (adminUserPage - 1) * ADMIN_USER_PAGE_SIZE,
        adminUserPage * ADMIN_USER_PAGE_SIZE
    );

    adminRows.replaceChildren();

    for (const user of pageUsers) {
        const row = document.createElement("tr");
        row.dataset.userId = user.userId;

        // [2026.09.30 변경] 간호사는 담당 병실이 있으면 병동 뒤에 함께 표시합니다(예: 3병동 · 301·302호).
        const assignment = adminJobType === "CAREGIVER"
            ? (user.roomNumber ? `${user.roomNumber}호` : "미배정")
            : ([user.ward || "미배정", window.adminStaffRooms.format(user.assignedRooms ?? [])].filter(Boolean).join(" · "));
        const phoneDigits = (user.phoneNumber || "").replace(/\D/g, "");
        const phoneDisplay = phoneDigits.length >= 7
            ? `${phoneDigits.slice(0, 3)}-****-${phoneDigits.slice(-4)}`
            : "—";
        const caregiverPhoneDisplay = phoneDigits.length >= 7
            ? `${phoneDigits.slice(0, 3)}-****-${phoneDigits.slice(-4)}`
            : "—";
        const values = adminJobType === "CAREGIVER"
            ? [user.name, user.ward || "미배정", assignment, caregiverPhoneDisplay]
            : [user.name, user.userId, phoneDisplay, assignment];
        for (const value of values) {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        }

        const actionsCell = document.createElement("td");
        const actions = document.createElement("div");
        actions.className = "admin-row-actions";

        // [9.15] 수정내용: 연필 아이콘을 누르면 중앙 팝업에서 필요한 관리 기능을 선택하도록 구성한다.
        if (user.status !== "PENDING") {
            const editButton = document.createElement("button");

            editButton.type = "button";
            editButton.className = "admin-icon-button admin-edit-button";
            editButton.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m4 16.5-.7 3.2 3.2-.7L18.4 7.1 15.9 4.6 4 16.5Z" />
                    <path d="m14.6 5.9 2.5 2.5" />
                </svg>`;
            editButton.title = adminJobType === "CAREGIVER" ? "간병인 관리 기능 열기" : "직원 관리 기능 열기";
            editButton.setAttribute("aria-label", `${user.name} 관리 기능 열기`);

            editButton.addEventListener("click", () => {
                openAdminManagementChoice(user);
            });

            actions.append(editButton);
            actionsCell.append(actions);
            row.append(actionsCell);
            adminRows.append(row);
            continue;
        }

        const userActions = [
            ["APPROVE", "✓ 승인", "admin-approve", ""],
            ["REJECT", "× 반려", "admin-reject", ""]
        ];

        for (const [action, label, className, icon] of userActions) {
            const button = document.createElement("button");

            button.type = "button";
            button.className = icon
                ? `${className} admin-icon-button`
                : className;

            if (icon === "bed") {
                button.innerHTML = `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 18v-5M21 18v-5M3 15h18v4M6 15v-5h5a3 3 0 0 1 3 3v2M6 10V7h5v3" />
                    </svg>`;
                button.title = label;
            } else if (icon === "key") {
                button.innerHTML = `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="8" cy="15" r="3" />
                        <path d="M10.2 12.8 18 5m-2 0h2v2m-4.2 2.2L16 11.5" />
                    </svg>`;
                button.title = label;
            } else if (icon === "user-block") {
                button.innerHTML = `
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                        <circle cx="12" cy="8" r="3" />
                        <path d="M6.5 20a5.5 5.5 0 0 1 7.7-5M17 17l4 4m0-4-4 4" />
                    </svg>`;
                button.title = label;
            } else {
                button.textContent = label;
            }

            button.setAttribute(
                "aria-label",
                `${user.name} ${label.replace(/[✓×]/g, "").trim()}`
            );

            button.addEventListener("click", () => {
                if (action === "RESET_PASSWORD") {
                    resetUserPassword(user.userId, button);
                    return;
                }

                openAdminAction(user, action);
            });

            actions.append(button);
        }

        actionsCell.append(actions);
        row.append(actionsCell);
        adminRows.append(row);
    }

    adminEmpty.hidden = visibleUsers.length > 0;
    renderAdminPagination(adminUserPagination, adminUserPage, totalPages, page => {
        adminUserPage = page;
        renderAdminUsers();
    }, visibleUsers.length > 0);
}

/* [9.15] 추가내용: 직원별 관리 기능을 중앙 선택 팝업에서 고른 뒤 실행한다. */
function openAdminManagementChoice(user) {
    adminSelectedUser = user;
    adminManagementChoiceAction = "";
    adminManagementChoiceDescription.textContent = adminJobType === "CAREGIVER"
        ? `${user.name}님에게 적용할 관리 작업을 선택해주세요.`
        : `${user.name} (${user.userId})님에게 적용할 관리 작업을 선택해주세요.`;
    const caregiver = adminJobType === "CAREGIVER";
    adminManagementChoiceDialog.classList.toggle("is-caregiver", caregiver);
    const assignmentOption = adminManagementOptions.find(option => option.dataset.adminAction === "ASSIGN" || option.dataset.adminAction === "ASSIGN_ROOM");
    if (assignmentOption) assignmentOption.dataset.adminAction = caregiver ? "ASSIGN_ROOM" : "ASSIGN";
    document.querySelector("#admin-management-assignment-title").textContent = caregiver ? "병실 변경" : "병동 변경";
    document.querySelector("#admin-management-assignment-description").textContent = caregiver ? "담당 병실을 변경합니다." : "담당 병동과 병실을 변경합니다.";
    const resetOption = adminManagementOptions.find(option => option.dataset.adminAction === "RESET_PASSWORD");
    if (resetOption) resetOption.hidden = caregiver;
    const phoneOption = adminManagementOptions.find(option => option.dataset.adminAction === "EDIT_PHONE");
    // [2026-09-22 변경] 간병인도 등록된 전화번호를 수정할 수 있도록 관리 항목을 표시합니다.
    if (phoneOption) phoneOption.hidden = false;
    document.querySelector("#admin-management-deactivate-title").textContent = caregiver
        ? "비활성화"
        : "계정 비활성화";
    document.querySelector("#admin-management-deactivate-description").textContent = caregiver
        ? "SMS 수신 대상에서 제외합니다."
        : "계정을 비활성 상태로 전환합니다.";
    adminManagementChoiceConfirm.disabled = true;

    for (const option of adminManagementOptions) {
        option.classList.remove("is-selected");
        option.setAttribute("aria-checked", "false");
    }

    adminModalScrollPosition = adminPage?.scrollTop ?? 0;
    document.body.classList.add("admin-modal-open");
    adminManagementChoiceDialog.showModal();
}

/* [9.15] 추가내용: 팝업을 닫으면 고정했던 배경 화면을 기존 위치로 되돌린다. */
adminManagementChoiceDialog?.addEventListener("close", () => {
    document.body.classList.remove("admin-modal-open");
    if (adminPage) adminPage.scrollTop = adminModalScrollPosition;
});

for (const option of adminManagementOptions) {
    option.addEventListener("click", () => {
        adminManagementChoiceAction = option.dataset.adminAction;
        adminManagementChoiceConfirm.disabled = false;

        for (const item of adminManagementOptions) {
            const selected = item === option;
            item.classList.toggle("is-selected", selected);
            item.setAttribute("aria-checked", String(selected));
        }
    });
}

document.querySelector("#admin-management-choice-cancel")?.addEventListener("click", () => {
    adminManagementChoiceDialog.close();
});

adminManagementChoiceConfirm?.addEventListener("click", () => {
    if (!adminSelectedUser || !adminManagementChoiceAction) return;

    const selectedUser = adminSelectedUser;
    const selectedAction = adminManagementChoiceAction;
    adminManagementChoiceDialog.close();

    if (selectedAction === "RESET_PASSWORD") {
        resetUserPassword(selectedUser.userId, adminManagementChoiceConfirm);
        return;
    }

    if (selectedAction === "EDIT_PHONE") {
        openAdminPhoneEdit(selectedUser);
        return;
    }

    openAdminAction(selectedUser, selectedAction);
});

/* [2026-09-27 변경] 간호사와 간병인 전화번호를 서버(tb_emp.phone_no)에 저장합니다. */
function formatPhoneInput(value) {
    const digits = String(value ?? "").replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 3) return digits;
    if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function openAdminPhoneEdit(user) {
    adminSelectedUser = user;
    adminPhoneEditDescription.textContent = adminJobType === "CAREGIVER"
        ? `${user.name}님의 전화번호를 수정합니다.`
        : `${user.name} (${user.userId})님의 전화번호를 수정합니다.`;
    adminPhoneEditInput.value = formatPhoneInput(user.phoneNumber);
    adminPhoneEditError.textContent = "";
    adminPhoneEditDialog.showModal();
    adminPhoneEditInput.focus();
}

adminPhoneEditInput?.addEventListener("input", () => {
    adminPhoneEditInput.value = formatPhoneInput(adminPhoneEditInput.value);
    adminPhoneEditError.textContent = "";
});

document.querySelector("#admin-phone-edit-cancel")?.addEventListener("click", () => {
    adminPhoneEditDialog.close();
});

// [2026-09-27 변경] 전화번호를 서버에 저장합니다(확정 낙상 SMS 받는 번호). 실패하면 창을 열어 둔 채 안내합니다.
adminPhoneEditForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!adminSelectedUser) return;
    const digits = adminPhoneEditInput.value.replace(/\D/g, "");
    if (!/^01\d{8,9}$/.test(digits)) {
        adminPhoneEditError.textContent = "휴대전화 번호를 확인해 주세요.";
        adminPhoneEditInput.focus();
        return;
    }
    const submitButton = adminPhoneEditForm.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;
    try {
        await requestAdminApi(`/api/admin/users/${encodeURIComponent(adminSelectedUser.userId)}/phone`, {
            method: "PATCH",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({phoneNumber: digits})
        });
    } catch (error) {
        adminPhoneEditError.textContent = error.message || "전화번호를 저장하지 못했습니다.";
        return;
    } finally {
        if (submitButton) submitButton.disabled = false;
    }
    adminPhoneEditDialog.close();
    // 저장은 끝났으므로, 목록을 다시 불러오지 못해도 그 사실을 알려 줍니다.
    try {
        await loadAdminData(true);
        showAdminFeedback("전화번호를 변경했습니다.");
    } catch (error) {
        console.error(error);
        showAdminFeedback("전화번호는 변경했지만 목록을 불러오지 못했습니다. 새로고침해 주세요.");
    } finally {
        adminSelectedUser = null;
    }
});

/**
 * 승인 상태 탭을 변경한다.
 */
function selectAdminTab(tab) {
    adminActiveStatus = tab.dataset.status;
    adminUserPage = 1;

    for (const item of adminTabs) {
        const selected = item === tab;

        item.setAttribute("aria-selected", String(selected));
        item.tabIndex = selected ? 0 : -1;
    }

    adminList.setAttribute("aria-labelledby", tab.id);
    renderAdminUsers();
}

/**
 * 승인, 반려, 병동 변경, 비활성화 팝업을 연다.
 */
function openAdminAction(user, action) {
    adminSelectedUser = user;
    adminAction = action;
    adminDialog.classList.toggle("is-deactivate-action", action === "DEACTIVATE");
    document.getElementById("admin-deactivate-details").hidden = action !== "DEACTIVATE";

    adminRoomWardField.hidden = true;
    adminRoomWardSelect.value = "";
    renderAdminRoomWardDropdown();
    closeAdminRoomWardOptions();
    adminWardField.hidden = true;
    adminWardSelect.disabled = true;
    adminWardSelect.required = false;
    adminWardSelect.value = "";
    adminStaffRoomField.hidden = true;
    adminStaffRooms = new Set();
    closeAdminStaffRoomOptions();

    if (action === "APPROVE") {
        adminDialogTitle.textContent = "가입 신청 승인";
        adminDialogDescription.textContent =
            `${user.name}님의 가입 신청을 승인하시겠습니까?`;
        adminDialogConfirm.textContent = "승인하기";
    }

    if (action === "REJECT") {
        adminDialogTitle.textContent = "가입 신청 반려";
        adminDialogDescription.textContent =
            `${user.name}님의 가입 신청을 반려하시겠습니까?`;
        adminDialogConfirm.textContent = "반려하기";
    }

    if (action === "ASSIGN" || action === "ASSIGN_ROOM") {
        const roomChange = action === "ASSIGN_ROOM";
        adminDialogTitle.textContent = roomChange ? "담당 병실 변경" : "담당 병동 변경";
        adminDialogDescription.textContent = roomChange
            ? `${user.name}님의 담당 병실을 변경합니다.`
            : `${user.name} (${user.userId})님의 담당 병동과 병실을 변경합니다.`;
        adminDialogConfirm.textContent = "변경하기";

        adminWardField.hidden = false;
        adminWardSelect.disabled = false;
        adminWardSelect.required = true;
        document.querySelector("#admin-action-assignment-label").textContent = roomChange ? "변경할 병실" : "변경할 병동";
        adminActionWardTrigger.setAttribute("aria-label", roomChange ? "변경할 병실 선택" : "변경할 병동 선택");
        if (roomChange) {
            adminRoomWardField.hidden = false;
            const currentWardNumber = Math.floor(Number(user.roomNumber) / 100);
            adminRoomWardSelect.value = [1, 2, 3].includes(currentWardNumber) ? String(currentWardNumber) : "";
            renderAdminRoomWardDropdown();
            adminDialogDescription.textContent = user.name + "님 · 현재 병실: " + (user.roomNumber ? user.roomNumber + "호" : "미배정");
            renderAdminRoomOptions();
            adminWardSelect.value = user.roomNumber ?? "";
        } else {
            renderAdminWardOptions();
            const currentWard = adminWards.find(ward =>
                String(ward.wardId) === String(user.wardId)
                || ward.wardName === user.ward
            );
            if (currentWard) adminWardSelect.value = String(currentWard.wardId);
            // [2026.09.30 추가] 지금 담당 병실을 미리 골라 둡니다. 담당 병실은 선택 사항입니다.
            adminStaffRoomField.hidden = false;
            adminStaffRooms = new Set(user.assignedRooms ?? []);
            renderAdminStaffRoomDropdown();
        }
    }

    if (action === "DEACTIVATE") {
        const caregiver = adminJobType === "CAREGIVER";
        adminDialogTitle.textContent = caregiver ? "비활성화" : "계정 비활성화";
        adminDialogDescription.textContent = caregiver
            ? `${user.name}\n해당 간병인을 비활성화하시겠습니까?`
            : `${user.name} (${user.userId})\n계정을 비활성화하시겠습니까?`;
        document.querySelector("#admin-deactivate-detail-primary").textContent = caregiver
            ? "비활성화된 간병인은 SMS 수신 대상에서 제외됩니다."
            : "이 계정으로 로그인할 수 없습니다.";
        document.querySelector("#admin-deactivate-detail-secondary").textContent = caregiver
            ? "담당 병실 및 기존 관리 이력은 유지됩니다."
            : "기존 활동 및 업무 처리 기록은 유지됩니다.";
        adminDialogConfirm.textContent = "비활성화";
    }

    renderAdminActionWardDropdown();
    closeAdminActionWardOptions();
    adminDialog.showModal();
}

/**
 * 선택한 관리자 작업을 서버에 요청한다.
 */
async function submitAdminAction() {
    if (!adminSelectedUser) {
        return;
    }

    const selectedUser = adminSelectedUser;
    const selectedAction = adminAction;

    if (selectedAction === "ASSIGN_ROOM" && !adminWardSelect.value) {
        showAdminFeedback("변경할 병실을 선택해 주세요.");
        adminActionWardTrigger.focus();
        return;
    }

    let url = "";
    let method = "PATCH";
    let body;
    let successMessage = "";

    // [2026-09-27 변경] 간병인 담당 병실을 서버에 저장합니다. 확정 낙상 SMS 가 새 병실의 간병인에게 갑니다.
    if (selectedAction === "ASSIGN_ROOM") {
        url = `/api/admin/users/${encodeURIComponent(selectedUser.userId)}/room`;
        body = JSON.stringify({roomNumber: Number(adminWardSelect.value)});
        successMessage = "담당 병실을 변경했습니다.";
    }

    if (selectedAction === "APPROVE") {
        url = `/api/admin/users/${encodeURIComponent(selectedUser.userId)}/approve`;
        successMessage = "가입 신청을 승인했습니다.";
    }

    if (selectedAction === "REJECT") {
        url = `/api/admin/users/${encodeURIComponent(selectedUser.userId)}/reject`;
        method = "DELETE";
        successMessage = "가입 신청을 반려했습니다.";
    }

    if (selectedAction === "ASSIGN") {
        if (!adminWardSelect.value) {
            showAdminFeedback("변경할 병동을 선택해주세요.");
            adminActionWardTrigger.focus();
            return;
        }

        url = `/api/admin/users/${encodeURIComponent(selectedUser.userId)}/ward`;
        // [2026.09.30 변경] 담당 병실(선택 사항)도 함께 보냅니다. 빈 목록이면 담당 병실을 모두 지웁니다.
        body = JSON.stringify({wardId: Number(adminWardSelect.value), roomNumbers: [...adminStaffRooms].map(Number)});
        successMessage = "담당 병동과 병실을 변경했습니다.";
    }

    if (selectedAction === "DEACTIVATE") {
        url = `/api/admin/users/${encodeURIComponent(selectedUser.userId)}/deactivate`;
        successMessage = adminJobType === "CAREGIVER"
            ? "간병인을 비활성화했습니다."
            : "계정을 비활성화했습니다.";
    }

    if (!url) {
        showAdminFeedback("처리할 작업을 확인할 수 없습니다.");
        return;
    }

    const headers = {};

    if (body) {
        headers["Content-Type"] = "application/json";
    }

    adminDialogConfirm.disabled = true;

    try {
        await requestAdminApi(url, {
            method,
            headers,
            body
        });

        adminDialog.close();
        if (selectedAction === "DEACTIVATE") {
            // [2026.09.22 변경] 간병인은 간병인 비활성화 목록으로, 간호사는 간호사 비활성화 목록으로 이동합니다.
            const inactivePath = adminJobType === "CAREGIVER"
                ? "/admin/caregivers/inactive"
                : "/admin/admin_de";
            window.location.assign(inactivePath);
            return;
        }
        await loadAdminData(true);

        const currentTab = adminTabs.find(
            tab => tab.dataset.status === adminActiveStatus
        );

        currentTab?.focus();
        // [2026-09-18] 담당 병동 변경과 목록 갱신이 성공하면 확인 버튼이 있는 브라우저 기본 안내창을 표시한다.
        if (selectedAction === "ASSIGN") {
            window.alert("담당 병동 변경이 완료되었습니다");
        } else {
            showAdminFeedback(successMessage);
        }
    } catch (error) {
        console.error(error);
        showAdminFeedback(error.message || "처리 중 오류가 발생했습니다.");
    } finally {
        adminDialogConfirm.disabled = false;
        adminSelectedUser = null;
        adminAction = "";
    }
}

/* 탭 클릭 */
for (const tab of adminTabs) {
    tab.addEventListener("click", () => {
        selectAdminTab(tab);
    });

    tab.addEventListener("keydown", event => {
        const supportedKeys = ["ArrowLeft", "ArrowRight", "Home", "End"];

        if (!supportedKeys.includes(event.key)) {
            return;
        }

        event.preventDefault();

        const currentIndex = adminTabs.indexOf(tab);
        let nextIndex = currentIndex;

        if (event.key === "Home") {
            nextIndex = 0;
        }

        if (event.key === "End") {
            nextIndex = adminTabs.length - 1;
        }

        if (event.key === "ArrowLeft") {
            nextIndex = (currentIndex - 1 + adminTabs.length) % adminTabs.length;
        }

        if (event.key === "ArrowRight") {
            nextIndex = (currentIndex + 1) % adminTabs.length;
        }

        const nextTab = adminTabs[nextIndex];
        selectAdminTab(nextTab);
        nextTab.focus();
    });
}

/* 현재 화면의 관리 이력 검색 */
adminSearchForm.addEventListener("submit", event => {
    event.preventDefault();

    adminSearchQuery = adminSearchInput.value.trim().toLowerCase();
    // [9.15] 추가내용: 새 검색 결과는 각 목록의 첫 페이지부터 표시한다.
    adminUserPage = 1;
    adminHistoryPage = 1;
    renderAdminUsers();
    // [9.15] 수정내용: 관리 이력 화면에서는 같은 검색어로 이력 목록도 함께 갱신한다.
    filterHistory(adminHistoryFilter);
});

adminSearchForm.addEventListener("reset", () => {
    adminSearchQuery = "";
    // [9.15] 추가내용: 검색 초기화 시 각 목록의 페이지도 첫 페이지로 되돌린다.
    adminUserPage = 1;
    adminHistoryPage = 1;
    renderAdminUsers();
    // [9.15] 수정내용: 검색 초기화 시 관리 이력의 필터 결과도 전체 목록으로 되돌린다.
    filterHistory(adminHistoryFilter);
});

adminSearchInput.addEventListener("input", event => {
    if (!event.target.value) {
        adminSearchQuery = "";
        // [9.15] 추가내용: 검색어를 지우면 목록을 첫 페이지부터 다시 표시한다.
        adminUserPage = 1;
        adminHistoryPage = 1;
        renderAdminUsers();
        // [9.15] 수정내용: 검색어를 지우면 관리 이력도 현재 유형 필터 기준으로 다시 표시한다.
        filterHistory(adminHistoryFilter);
    }
});


/* [09.13]추가내용: 계정 생성 전용 파일이 관리자 목록 상태를 안전하게 사용하도록 읽기 전용 연결을 제공합니다. */
window.adminCreateContext = {
    get users() { return adminUsers; },
    get wards() { return adminWards; },
    get historyRows() { return adminHistoryRows; },
    get adminId() { return currentAdminId; },
    renderUsers: () => renderAdminUsers()
};
/* 팝업 취소 */
adminDialogCancel.addEventListener("click", () => {
    adminDialog.close();
});

/* 팝업 확인 */
document.querySelector("#admin-action-form").addEventListener("submit", async event => {
    event.preventDefault();
    await submitAdminAction();
});

/* 팝업이 닫히면 병동 선택란 초기화 */
adminDialog.addEventListener("close", () => {
    closeAdminActionWardOptions();
    closeAdminRoomWardOptions();
    closeAdminStaffRoomOptions();
    adminStaffRoomField.hidden = true;
    adminStaffRooms = new Set();
    adminRoomWardField.hidden = true;
    adminRoomWardSelect.value = "";
    renderAdminRoomWardDropdown();
    adminWardField.hidden = true;
    adminWardSelect.disabled = true;
    adminWardSelect.required = false;
    adminWardSelect.value = "";
    renderAdminActionWardDropdown();
});

document.querySelector("#admin-create-cancel")?.addEventListener("click", () => adminCreateDialog.close());
document.querySelector("#admin-create-complete-close")?.addEventListener("click", () => adminCreateCompleteDialog.close());
document.querySelector("#admin-history-event-close")?.addEventListener("click", () => adminHistoryEventDialog.close());
document.querySelector("#admin-password-reset-close")?.addEventListener("click", () => adminPasswordResetDialog.close());
document.querySelector("#admin-deactivate-cancel")?.addEventListener("click", () => adminDeactivateDialog.close());
// [09.13]수정내용: 화면의 행만 삭제하던 처리를 서버의 계정 비활성화 요청으로 변경하고 성공하면 비활성화 사용자 목록으로 이동한다.
document.querySelector("#admin-deactivate-confirm")?.addEventListener("click", async event => {
    const confirmButton = event.currentTarget;
    if (confirmButton.disabled || !pendingDeactivateRow) return;
    const userId = pendingDeactivateRow.dataset.userId || pendingDeactivateRow.querySelectorAll("td")[2]?.textContent.trim();
    if (!userId) {
        showAdminFeedback("비활성화할 계정 아이디를 확인할 수 없습니다.");
        return;
    }
    confirmButton.disabled = true;
    const cancelButton = document.querySelector("#admin-deactivate-cancel");
    cancelButton.disabled = true;
    try {
        await requestAdminApi(`/api/admin/users/${encodeURIComponent(userId)}/deactivate`, {
            method: "PATCH"
        });
        pendingDeactivateRow = null;
        adminDeactivateDialog.close();
        window.location.assign(document.querySelector("#admin-settings").href);
    } catch (error) {
        // [09.13]추가내용: 실패한 계정은 화면에서 제거하지 않고 오류를 안내하여 다시 처리할 수 있도록 한다.
        adminDeactivateDialog.close();
        showAdminFeedback(error.message || "계정 비활성화에 실패했습니다.");
    } finally {
        confirmButton.disabled = false;
        cancelButton.disabled = false;
    }
});
// 상세 이력의 대상 직원을 실제 병동 변경 기능에 연결합니다.
document.querySelector("#admin-event-ward-change")?.addEventListener("click", async event => {
    const button = event.currentTarget;
    if (button.disabled) return;
    const userId = document.querySelector("#event-target")?.dataset.userId;
    button.disabled = true;
    adminSelectedUser = null;
    adminAction = "ASSIGN";
    adminDialogTitle.textContent = "담당 병동 변경";
    adminDialogDescription.textContent = `${userId}님의 병동 목록을 불러오고 있습니다.`;
    adminWardField.hidden = false;
    adminWardSelect.required = true;
    adminWardSelect.disabled = true;
    adminWardSelect.replaceChildren(new Option("병동 목록을 불러오는 중…", ""));
    renderAdminActionWardDropdown();
    adminDialogConfirm.textContent = "변경하기";
    adminDialogConfirm.disabled = true;
    adminHistoryEventDialog.close();
    adminDialog.showModal();
    try {
        await loadAdminData(true);
        if (!adminDialog.open) return;
        const user = adminUsers.find(item => item.userId === userId);
        if (!user || user.status !== "APPROVED") {
            adminDialogDescription.textContent = "활성화된 직원 계정의 병동만 변경할 수 있습니다.";
            adminWardSelect.replaceChildren(new Option("변경 가능한 직원 정보가 없습니다.", ""));
            renderAdminActionWardDropdown();
            return;
        }
        adminWardSelect.replaceChildren(new Option("변경할 병동을 선택해주세요", ""));
        for (const ward of adminWards) {
            adminWardSelect.add(new Option(ward.wardName, String(ward.wardId)));
        }
        if (!adminWards.length) {
            renderAdminActionWardDropdown();
            adminDialogDescription.textContent = "등록된 병동이 없어 변경할 수 없습니다.";
            return;
        }
        adminSelectedUser = user;
        adminAction = "ASSIGN";
        adminDialogDescription.textContent = `${user.name} (${user.userId}) · 현재 병동: ${user.ward || "미배정"}`;
        adminWardSelect.disabled = false;
        renderAdminActionWardDropdown();
        adminDialogConfirm.disabled = false;
        adminActionWardTrigger.focus();
    } catch (error) {
        if (!adminDialog.open) return;
        adminDialogDescription.textContent = error.message || "병동 정보를 불러오지 못했습니다. 창을 닫고 다시 시도해주세요.";
        adminWardSelect.replaceChildren(new Option("병동 목록을 불러오지 못했습니다.", ""));
        renderAdminActionWardDropdown();
    } finally {
        button.disabled = false;
    }
});

/* 관리자 비밀번호 초기화 요청이 중복으로 실행되지 않도록 처리 상태를 보관한다. */
let adminPasswordResetPending = false;

/* 초기화 처리 중에는 상세 팝업이 ESC 키로 닫히지 않도록 한다. */
adminHistoryEventDialog?.addEventListener("cancel", event => {
    if (adminPasswordResetPending) {
        event.preventDefault();
    }
});

/* [9.15] 수정내용: 직원 목록과 관리 이력 상세에서 같은 비밀번호 초기화 처리를 사용한다. */
async function resetUserPassword(userId, resetButton, closeHistoryDialog = false) {
    if (adminPasswordResetPending) {
        return;
    }

    if (!userId) {
        showAdminFeedback(
            "초기화할 직원 아이디를 확인할 수 없습니다."
        );
        return;
    }

    const closeButton = document.querySelector(
        "#admin-history-event-close"
    );

    adminPasswordResetPending = true;
    resetButton.disabled = true;

    if (closeButton) {
        closeButton.disabled = true;
    }

    try {
        const result = await requestAdminApi(
            `/api/admin/users/${encodeURIComponent(userId)}/reset-password`,
            {
                method: "POST"
            }
        );

        if (
            result?.userId !== userId
            || !result.temporaryPassword
            || result.mustChangePassword !== true
        ) {
            throw new Error(
                "서버의 초기화 결과를 확인할 수 없습니다."
            );
        }

        document.querySelector(
            "#reset-account-user-id"
        ).textContent = result.userId;

        document.querySelector(
            "#reset-account-password"
        ).textContent = result.temporaryPassword;

        if (closeHistoryDialog) {
            adminHistoryEventDialog.close();
        }
        adminPasswordResetDialog.showModal();
    } catch (error) {
        showAdminFeedback(
            error.message
            || "비밀번호 초기화에 실패했습니다."
        );
    } finally {
        adminPasswordResetPending = false;
        resetButton.disabled = false;

        if (closeButton) {
            closeButton.disabled = false;
        }
    }
}

/* [9.15] 수정내용: 관리 이력 상세의 초기화 버튼도 공통 비밀번호 초기화 기능으로 연결한다. */
document.querySelector("#admin-event-change")?.addEventListener("click", event => {
    const userId = document.querySelector("#event-target")?.dataset.userId;

    resetUserPassword(userId, event.currentTarget, true);
});

/* 임시 비밀번호 팝업을 닫으면 화면에서 비밀번호 원문을 제거한다. */
adminPasswordResetDialog?.addEventListener("close", () => {
    const passwordElement = document.querySelector(
        "#reset-account-password"
    );

    const copyButton = document.querySelector(
        "#copy-reset-password"
    );

    if (passwordElement) {
        passwordElement.textContent = "";
    }

    if (copyButton) {
        copyButton.textContent = "복사하기";
    }
});

/* 서버가 한 번 반환한 임시 비밀번호를 클립보드에 복사한다. */
document.querySelector("#copy-reset-password")?.addEventListener("click", async event => {
    const copyButton = event.currentTarget;

    const temporaryPassword = document.querySelector(
        "#reset-account-password"
    )?.textContent;

    if (!temporaryPassword) {
        showAdminFeedback(
            "복사할 임시 비밀번호가 없습니다."
        );
        return;
    }

    try {
        await navigator.clipboard.writeText(
            temporaryPassword
        );

        copyButton.textContent = "복사됨";

        setTimeout(() => {
            copyButton.textContent = "복사하기";
        }, 1600);
    } catch (error) {
        showAdminFeedback(
            "자동 복사가 불가능합니다. 표시된 비밀번호를 직접 복사해 주세요."
        );
    }
});

function filterHistory(action, resetPage = false) {
    adminHistoryFilter = action;

    if (resetPage) {
        adminHistoryPage = 1;
    }

    historyFilterCards.forEach(card => {
        card.classList.toggle(
            "active",
            card.dataset.historyFilter === action
        );
    });

    const usersById = new Map(
        adminUsers.map(user => [user.userId, user.name])
    );

    const rows = [
        ...document.querySelectorAll("#admin-history-rows tr")
    ];

    const matchedRows = [];

    for (const row of rows) {
        const cells = row.querySelectorAll("td");
        const userId = row.dataset.userId ?? "";
        const ward = cells[3]?.textContent.trim() ?? "";

        const userName =
            row.dataset.userName
            || usersById.get(userId)
            || "";

        const searchable =
            `${userId} ${userName} ${ward}`.toLowerCase();

        const matchesType =
            action === "전체"
            || row.dataset.historyAction === action;

        if (matchesType && searchable.includes(adminSearchQuery)) {
            matchedRows.push(row);
        }
    }

    // [2026.10.01 변경] 간병인 관리 이력은 10건씩 표시하여 페이지 번호로 목록을 이동합니다.
    const historyPageSize = document.body.dataset.adminJobType === "CAREGIVER"
        ? ADMIN_CAREGIVER_HISTORY_PAGE_SIZE
        : ADMIN_LIST_PAGE_SIZE;
    const totalPages = Math.max(1, Math.ceil(matchedRows.length / historyPageSize));
    adminHistoryPage = Math.min(adminHistoryPage, totalPages);
    const firstIndex = (adminHistoryPage - 1) * historyPageSize;

    rows.forEach(row => {
        row.hidden = !matchedRows.includes(row);
    });

    matchedRows.forEach((row, index) => {
        row.hidden = index < firstIndex || index >= firstIndex + historyPageSize;
    });

    renderAdminPagination(adminHistoryPagination, adminHistoryPage, totalPages, page => {
        adminHistoryPage = page;
        filterHistory(action);
        // [2026.09.19] 수정: 관리 이력 페이지를 변경하면 목록 내부 스크롤을 맨 위로 되돌립니다.
        const historyScrollArea = adminHistoryRows?.closest(".admin-history-wrap");
        if (historyScrollArea) historyScrollArea.scrollTop = 0;
    });

    const empty = document.querySelector("#admin-history-empty");

    if (empty) {
        empty.hidden = matchedRows.length !== 0;
    }
}

adminHistoryRows?.addEventListener("click", event => {
    const deleteButton = event.target.closest(".history-delete");
    if (deleteButton) {
        pendingDeactivateRow = deleteButton.closest("tr");
        document.querySelector("#deactivate-target").textContent = pendingDeactivateRow.querySelectorAll("td")[2].textContent;
        adminDeactivateDialog.showModal();
        return;
    }
    const editButton = event.target.closest(".history-edit");
    if (!editButton) return;
    const row = editButton.closest("tr");
    pendingEventRow = row;
    const cells = row.querySelectorAll("td");
    document.querySelector("#event-time").textContent = cells[0].textContent;
    document.querySelector("#event-admin").textContent = cells[1].textContent;
    const eventTarget = document.querySelector("#event-target");
    eventTarget.textContent = cells[2].textContent;
    eventTarget.dataset.userId = row.dataset.userId ?? "";
    // [2026.10.01 변경] 수정한 내용은 작업명과 분리해 별도 줄로 보여 줍니다.
    const eventAction = document.querySelector("#event-action");
    const actionName = document.createElement("span");
    actionName.className = "event-action-name";
    actionName.textContent = row.dataset.actionLabel || cells[4].textContent;
    eventAction.replaceChildren(actionName);

    if (row.dataset.actionDetail) {
        const actionDetail = document.createElement("span");
        actionDetail.className = "event-action-detail";
        actionDetail.textContent = row.dataset.actionDetail;
        eventAction.append(actionDetail);
    }
    adminHistoryEventDialog.showModal();
});

historyFilterCards.forEach(card => {
    card.addEventListener("click", () => filterHistory(card.dataset.historyFilter, true));
    card.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            filterHistory(card.dataset.historyFilter, true);
        }
    });
});
"use strict";

/**
 * 관리자 화면 현재 시각 표시
 */
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
    // [09.13]수정내용: 관리자 화면 날짜에 한국어 요일을 함께 표시한다.
    adminClock.textContent =
        `${values.year}년 ${values.month}월 ${values.day}일 (${values.weekday}) `
        + `${values.hour}:${values.minute}`;
}

// 계정 생성이나 이력 변경 후에도 현재 검색과 처리 유형 조건을 유지합니다.
if (adminHistoryRows) {
    new MutationObserver(() => filterHistory(adminHistoryFilter)).observe(adminHistoryRows, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ["data-history-action"]
    });
}
filterHistory(adminHistoryFilter);

/* 초기 실행 */
updateAdminClock();
setInterval(updateAdminClock, 30000);

// [2026.09.16] 추가한 내용: 관리자 메뉴는 문서를 새로 열지 않고 본문만 바꿔 전체화면을 유지합니다.
const adminInactiveView = document.querySelector("#admin-inactive-view");
const adminHomePage = document.querySelector("#admin-home-page");
const adminRecordView = document.querySelector("#admin-record-view");
const adminRecordFrame = document.querySelector("#admin-record-frame");
// [2026.09.29 변경] 관리자 사고 기록은 조치 이력과 별도 내부 화면으로 전환합니다.
const adminAccidentView = document.querySelector("#admin-accident-view");
const adminViewLinks = Array.from(document.querySelectorAll("[data-admin-view]"));
// 상단의 두 관리 메뉴는 커서·키보드 포커스와 클릭으로 하위 메뉴를 엽니다.
const adminNavGroups = Array.from(document.querySelectorAll(".admin-nav-group"));
function closeAdminNavMenus() {
    adminNavGroups.forEach(group => {
        group.classList.remove("is-open");
        group.querySelector(".admin-nav-trigger")?.setAttribute("aria-expanded", "false");
    });
}
adminNavGroups.forEach(group => {
    const trigger = group.querySelector(".admin-nav-trigger");
    // [2026-09-22 변경] 다른 메뉴에 커서를 올리면 이전에 클릭해 둔 하위 메뉴를 닫아 겹침을 방지합니다.
    group.addEventListener("pointerenter", () => {
        adminNavGroups.forEach(otherGroup => {
            if (otherGroup === group) return;
            otherGroup.classList.remove("is-open");
            otherGroup.querySelector(".admin-nav-trigger")?.setAttribute("aria-expanded", "false");
        });
    });
    trigger?.addEventListener("click", () => {
        const shouldOpen = !group.classList.contains("is-open");
        closeAdminNavMenus();
        group.classList.toggle("is-open", shouldOpen);
        trigger.setAttribute("aria-expanded", String(shouldOpen));
    });
    group.addEventListener("mouseenter", () => trigger?.setAttribute("aria-expanded", "true"));
    group.addEventListener("mouseleave", () => {
        group.classList.remove("is-open");
        trigger?.setAttribute("aria-expanded", "false");
    });
    group.addEventListener("focusout", event => {
        if (!group.contains(event.relatedTarget)) {
            group.classList.remove("is-open");
            trigger?.setAttribute("aria-expanded", "false");
        }
    });
});
document.addEventListener("click", event => {
    if (!event.target.closest(".admin-nav-group")) closeAdminNavMenus();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeAdminNavMenus();
});
function setAdminView(view, updateAddress = true) {
    const isHome = view === "home";
    const isInactive = view === "inactive" || view === "inactive-caregivers";
    const isRecords = view === "records";
    const isAccidents = view === "accidents";
    const isHistory = view === "history" || view === "history-caregivers";
    const nextJobType = view === "caregivers" || view === "inactive-caregivers" || view === "history-caregivers" ? "CAREGIVER" : "GENERAL";
    const jobChanged = adminJobType !== nextJobType;
    adminJobType = nextJobType;
    document.body.dataset.adminJobType = adminJobType;
    adminHomePage.hidden = !isHome;
    adminInactiveView.hidden = !isInactive;
    adminRecordView.hidden = !isRecords;
    adminAccidentView.hidden = !isAccidents;
    adminPage.hidden = isHome || isInactive || isRecords || isAccidents;
    // [2026.09.17] 추가한 내용: 전체화면 중에도 문서를 이동하지 않도록 조치 이력을 내부 화면으로 한 번만 불러옵니다.
    if (isRecords && !adminRecordFrame.dataset.loaded) {
        adminRecordFrame.src = adminRecordFrame.dataset.src;
        adminRecordFrame.dataset.loaded = "true";
    } else if (isRecords) {
        // [2026.09.27 추가] 이미 연 조치 이력을 다시 보여 줄 때는 새 낙상·조치가 보이도록 서버 기록을 다시 불러옵니다.
        adminRecordFrame.contentWindow?.CareGuardRecordPage?.reload();
    }
    // [2026.09.29 변경] 사고 기록 메뉴를 다시 열면 최신 발생 이력을 조회합니다.
    if (isAccidents) window.AdminAccidentRecords?.reload();
    if (!isHome && !isInactive && !isRecords && !isAccidents) {
        adminPage.classList.toggle("is-history-page", isHistory);
        adminPage.classList.toggle("is-staff-page", !isHistory);
        filterHistory(adminHistoryFilter);
    }
    const caregiver = view === "caregivers" || view === "history-caregivers";
    document.querySelector("#admin-title").textContent = view === "history-caregivers" ? "간병인 관리 이력" : view === "history" ? "간호사 관리 이력" : caregiver ? "간병인 관리" : "간호사 관리";
    document.querySelector("#admin-list-title").textContent = isHistory ? (caregiver ? "간병인 관리 이력 검색" : "간호사 관리 이력 검색") : caregiver ? "간병인 목록" : "간호사 목록";
    document.querySelector("#admin-management-page > .admin-heading p").textContent = view === "history-caregivers" ? "관리자가 처리한 간병인 정보와 담당 병실 변경 내역을 조회합니다." : view === "history" ? "관리자가 처리한 간호사 계정 및 병동·병실 변경 내역을 조회합니다." : caregiver ? "간병인 정보를 등록하고 담당 병실 변경과 비활성화를 관리합니다." : "간호사 계정을 생성하고 병동 배정, 전화번호 수정, 비밀번호 초기화, 비활성화를 관리합니다.";
    document.querySelector(".admin-management-title p").textContent = isHistory ? (caregiver ? "이름, 전화번호 또는 담당 병실로 처리 이력을 검색합니다." : "이름 또는 병동으로 처리 이력을 검색합니다.") : caregiver ? "간병인 정보를 검색하고 필요한 관리 작업을 진행합니다." : "간호사 계정을 검색하고 필요한 관리 작업을 진행합니다.";
    // [2026.09.30 변경] 간호사 이력은 담당 병실 변경도 남으므로 카드 이름을 '병동·병실 변경'으로 표시합니다.
    const historyAssignmentCard = document.querySelector('.history-filter-card[data-history-filter="병동 변경"], .history-filter-card[data-history-filter="병실 변경"], .history-filter-card[data-history-filter="병동·병실 변경"]');
    if (historyAssignmentCard) {
        historyAssignmentCard.dataset.historyFilter = caregiver ? "병실 변경" : "병동·병실 변경";
        const label = historyAssignmentCard.querySelector("small");
        if (label) label.textContent = caregiver ? "병실 변경" : "병동·병실 변경";
    }
    const historyHeaders = document.querySelectorAll(".admin-history-table th");
    if (historyHeaders[2]) historyHeaders[2].textContent = caregiver ? "대상 간병인" : "대상 간호사";
    if (historyHeaders[3]) historyHeaders[3].textContent = caregiver ? "병동 / 담당 병실" : "담당 병동";
    const historySummary = document.querySelector("#admin-history-summary");
    if (historySummary) historySummary.classList.toggle("is-caregiver-history", caregiver);
    // [2026.09.29 변경] 현재 이력 화면의 페이지 이동 영역을 직무별로 구분해 안내합니다.
    if (adminHistoryPagination) adminHistoryPagination.setAttribute(
        "aria-label",
        caregiver ? "간병인 관리 이력 페이지" : "간호사 관리 이력 페이지"
    );
    const historyPasswordCard = document.querySelector("#admin-history-password-card");
    if (historyPasswordCard) historyPasswordCard.hidden = caregiver;
    const historyPhoneCard = document.querySelector("#admin-history-phone-card");
    if (historyPhoneCard) historyPhoneCard.hidden = false;
    const historyDeactivateCard = document.querySelector("#admin-history-deactivate-card");
    if (historyDeactivateCard) {
        const deactivateLabel = historyDeactivateCard.querySelector("small");
        if (deactivateLabel) deactivateLabel.textContent = caregiver ? "비활성화" : "계정 비활성화";
    }
    // [2026-09-22 변경] 간병인 이력은 전화번호 수정 다음에 비활성화 카드를 표시하고 간호사 화면은 기존 순서를 유지합니다.
    if (historySummary && historyPhoneCard && historyDeactivateCard) {
        if (caregiver) {
            historySummary.append(historyPhoneCard, historyDeactivateCard);
        } else {
            historySummary.append(historyDeactivateCard, historyPhoneCard);
        }
    }
    if (caregiver && adminHistoryFilter === "비밀번호 초기화") {
        filterHistory("전체", true);
    }
    // [2026-09-22 변경] 간병인은 계정 생성 대신 등록 용어를 사용합니다.
    document.querySelector("#admin-create-account").textContent = caregiver ? "+ 등록" : "+ 계정 생성";
    document.querySelector("#admin-create-title").textContent = caregiver ? "간병인 등록" : "간호사 계정 생성";
    document.querySelector("#admin-create-form button[type='submit']").textContent = caregiver ? "등록" : "계정 생성";
    document.querySelector("#admin-create-complete-title").textContent = caregiver ? "간병인 등록 완료" : "계정 생성 완료";
    document.querySelector("#admin-create-complete-dialog > p").textContent = caregiver ? "등록된 간병인 정보를 확인해 주세요." : "아래 로그인 정보를 간호사에게 전달해주세요.";
    document.querySelector("#admin-password-reset-dialog > p").textContent = caregiver ? "아래 변경된 비밀번호를 간병인에게 전달해주세요." : "아래 변경된 비밀번호를 간호사에게 전달해주세요.";
    // [2026-09-22 변경] 간호사 화면의 관리 팝업 제목을 화면 명칭과 동일하게 표시합니다.
    document.querySelector("#admin-management-choice-title").textContent = caregiver ? "간병인 관리" : "간호사 관리";
    document.querySelector("#admin-user-caption").textContent = caregiver ? "간병인 관리 목록" : "간호사 관리 목록";
    document.querySelector("#admin-user-id-heading").textContent = caregiver ? "병동" : "아이디";
    document.querySelector("#admin-user-phone-heading").textContent = caregiver ? "담당 병실" : "전화번호";
    document.querySelector("#admin-user-phone-heading").hidden = false;
    const adminSearchLabel = caregiver
        ? "이름 또는 전화번호 검색"
        : isHistory
            ? "이름, 병동 검색"
            : "이름, 아이디, 전화번호 또는 병동 검색";
    document.querySelector("#admin-search-input").placeholder = adminSearchLabel;
    document.querySelector('label[for="admin-search-input"]').textContent = adminSearchLabel;
    document.querySelector("#admin-assignment-heading").textContent = caregiver ? "전화번호" : "배정 병동";
    document.querySelector("#complete-account-assignment-label").textContent = caregiver ? "담당 병실" : "담당 병동";
    document.querySelector("#admin-user-pagination").setAttribute("aria-label", caregiver ? "간병인 목록 페이지" : "간호사 목록 페이지");
    document.querySelector("#admin-settings-title").textContent = view === "inactive-caregivers" ? "간병인 비활성화" : "간호사 비활성화";
    if (jobChanged && !isRecords) {
        adminUsers = [];
        adminUserPage = 1;
        renderAdminUsers();
        loadAdminData().catch(() => {});
        window.dispatchEvent(new CustomEvent("admin-job-type-changed"));
    }
    adminViewLinks.forEach(link => {
        const active = link.dataset.adminView === view;
        link.classList.toggle("active", active);
        link.toggleAttribute("aria-current", active);
    });
    // 하위 화면에 있을 때도 상단의 상위 메뉴 버튼을 명시적으로 활성화합니다.
    document.querySelector("#admin-staff-submenu")?.previousElementSibling?.classList.toggle("active", view === "staff" || view === "caregivers");
    document.querySelector("#admin-inactive-submenu")?.previousElementSibling?.classList.toggle("active", view === "inactive" || view === "inactive-caregivers");
    document.querySelector("#admin-history-submenu")?.previousElementSibling?.classList.toggle("active", isHistory);
    document.title = isHome ? "관리자 홈 | 병동 통합 관제"
        : view === "accidents" ? "사고 영상 보관함 | 병동 통합 관제"
        : view === "records" ? "관리자 조치 이력 | 병동 통합 관제"
        : view === "history-caregivers" ? "간병인 관리 이력 | 병동 통합 관제"
        : view === "history" ? "간호사 관리 이력 | 병동 통합 관제"
        : view === "caregivers" ? "간병인 관리 | 병동 통합 관제"
        : view === "inactive-caregivers" ? "간병인 비활성화 | 병동 통합 관제"
        : view === "inactive" ? "간호사 비활성화 | 병동 통합 관제"
        : "간호사 관리 | 병동 통합 관제";
    if (updateAddress) {
        const path = view === "accidents" ? "/admin/accidents" : view === "records" ? "/admin/records" : view === "history-caregivers" ? "/admin/caregivers/history" : view === "history" ? "/admin/history" : view === "inactive" ? "/admin/admin_de" : view === "inactive-caregivers" ? "/admin/caregivers/inactive" : view === "caregivers" ? "/admin/caregivers" : view === "staff" ? "/admin?view=staff" : "/admin";
        window.history.pushState({ adminView: view }, "", path);
    }
}
adminViewLinks.forEach(link => link.addEventListener("click", event => {
    event.preventDefault();
    closeAdminNavMenus();
    setAdminView(link.dataset.adminView);
}));
window.addEventListener("popstate", () => {
    const path = window.location.pathname.replace(/\/+$/, "");
    const previewView = new URLSearchParams(window.location.search).get("view");
    setAdminView(path.endsWith("/accidents") ? "accidents" : path.endsWith("/records") ? "records" : path.endsWith("/caregivers/history") || previewView === "history-caregivers" ? "history-caregivers" : path.endsWith("/history") || previewView === "history" ? "history" : path.endsWith("/caregivers/inactive") || previewView === "inactive-caregivers" ? "inactive-caregivers" : path.endsWith("/caregivers") || previewView === "caregivers" ? "caregivers" : path.endsWith("/admin_de") ? "inactive" : previewView === "staff" ? "staff" : "home", false);
});

// [2026.09.17] 추가한 내용: /admin/records를 새로고침해도 조치 이력을 관리자 공통 화면 안에서 다시 표시합니다.
const initialAdminPath = window.location.pathname.replace(/\/+$/, "");
const initialPreviewView = new URLSearchParams(window.location.search).get("view");
const serverAdminView = adminPage.dataset.pageMode;
setAdminView(initialAdminPath.endsWith("/accidents") || initialPreviewView === "accidents" || serverAdminView === "accidents" ? "accidents" : initialAdminPath.endsWith("/records") ? "records" : initialAdminPath.endsWith("/caregivers/history") || initialPreviewView === "history-caregivers" || serverAdminView === "history-caregivers" ? "history-caregivers" : initialAdminPath.endsWith("/history") || initialPreviewView === "history" || serverAdminView === "history" ? "history" : initialAdminPath.endsWith("/caregivers/inactive") || initialPreviewView === "inactive-caregivers" || serverAdminView === "inactive-caregivers" ? "inactive-caregivers" : initialAdminPath.endsWith("/caregivers") || initialPreviewView === "caregivers" || serverAdminView === "caregivers" ? "caregivers" : initialAdminPath.endsWith("/admin_de") ? "inactive" : initialPreviewView === "staff" ? "staff" : "home", false);
loadAdminHomeAccountCounts();
loadAdminData().catch(() => {});
