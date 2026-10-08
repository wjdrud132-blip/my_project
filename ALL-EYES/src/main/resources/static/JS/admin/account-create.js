"use strict";

const createContext = window.adminCreateContext;
const createDialog = document.querySelector("#admin-create-dialog");
const createForm = document.querySelector("#admin-create-form");
const createNameInput = document.querySelector("#admin-create-name");
const createUserIdInput = document.querySelector("#admin-create-user-id");
const createStaffPhoneInput = document.querySelector("#admin-create-staff-phone");
const createStaffPhoneError = document.querySelector("#admin-create-staff-phone-error");
const createPhoneInput = document.querySelector("#admin-create-phone");
const createRoomWardSelect = document.querySelector("#admin-create-room-ward");
const createRoomWardDropdown = document.querySelector("#admin-create-room-ward-dropdown");
const createRoomWardTrigger = document.querySelector("#admin-create-room-ward-trigger");
const createRoomWardOptions = document.querySelector("#admin-create-room-ward-options");
const createRoomWardLabel = document.querySelector("#admin-create-room-ward-label");
const createRoomWardError = document.querySelector("#admin-create-room-ward-error");
const createRoomSelect = document.querySelector("#admin-create-room");
const createRoomDropdown = document.querySelector("#admin-create-room-dropdown");
const createRoomTrigger = document.querySelector("#admin-create-room-trigger");
const createRoomOptions = document.querySelector("#admin-create-room-options");
const createRoomLabel = document.querySelector("#admin-create-room-label");
const createWardSelect = document.querySelector("#admin-create-ward");
const createWardDropdown = document.querySelector("#admin-create-ward-dropdown");
const createWardTrigger = document.querySelector("#admin-create-ward-trigger");
const createWardOptions = document.querySelector("#admin-create-ward-options");
const createWardLabel = document.querySelector("#admin-create-ward-label");
// [2026.09.30 추가] 간호사 담당 병실(선택 사항, 여러 개 선택)
const createStaffRoomDropdown = document.querySelector("#admin-create-staff-room-dropdown");
const createStaffRoomTrigger = document.querySelector("#admin-create-staff-room-trigger");
const createStaffRoomOptions = document.querySelector("#admin-create-staff-room-options");
const createStaffRoomLabel = document.querySelector("#admin-create-staff-room-label");
const createStaffRoomError = document.querySelector("#admin-create-staff-room-error");
const createStaffRooms = new Set();
const createSubmitButton = createForm?.querySelector('button[type="submit"]');
const createCompleteDialog = document.querySelector("#admin-create-complete-dialog");
const createNameError = document.querySelector("#admin-create-name-error");
const createUserIdError = document.querySelector("#admin-create-user-id-error");
const createWardError = document.querySelector("#admin-create-ward-error");
const createPhoneError = document.querySelector("#admin-create-phone-error");
const createRoomError = document.querySelector("#admin-create-room-error");
const createAccountButton = document.querySelector("#admin-create-account");
const createCancelButton = document.querySelector("#admin-create-cancel");
const createCompleteCloseButton = document.querySelector("#admin-create-complete-close");

let createPending = false;
let wardRequestVersion = 0;
let availableWards = [];

function isCaregiverCreation() {
    return document.body.dataset.adminJobType === "CAREGIVER";
}

function renderCreateRoomDropdown() {
    createRoomOptions.replaceChildren();
    createRoomLabel.textContent = createRoomSelect.value
        ? `${createRoomSelect.value}호` : createRoomSelect.options[0].textContent;
    for (const option of createRoomSelect.options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.textContent;
        button.setAttribute("aria-selected", String(option.value === createRoomSelect.value));
        button.addEventListener("click", () => {
            createRoomSelect.value = option.value;
            renderCreateRoomDropdown();
            closeCreateRoomOptions();
            createRoomTrigger.focus();
        });
        createRoomOptions.append(button);
    }
}

function closeCreateRoomOptions() {
    createRoomOptions.hidden = true;
    createRoomTrigger.setAttribute("aria-expanded", "false");
    createRoomOptions.style.removeProperty("max-height");
    createDialog.classList.remove("room-menu-open");
}

function renderCreateRoomWardDropdown() {
    createRoomWardOptions.replaceChildren();
    createRoomWardLabel.textContent = createRoomWardSelect.selectedOptions[0]?.textContent
        || "병동을 선택해 주세요";
    for (const option of createRoomWardSelect.options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.textContent;
        button.setAttribute("aria-selected", String(option.value === createRoomWardSelect.value));
        button.addEventListener("click", () => {
            createRoomWardSelect.value = option.value;
            createRoomWardSelect.dispatchEvent(new Event("change", { bubbles: true }));
            closeCreateRoomWardOptions();
            createRoomWardTrigger.focus();
        });
        createRoomWardOptions.append(button);
    }
}

function closeCreateRoomWardOptions() {
    createRoomWardOptions.hidden = true;
    createRoomWardTrigger.setAttribute("aria-expanded", "false");
    // [2026.09.30 수정] 간호사 담당 병동 목록과 같은 표시(ward-menu-overflow)를 쓰므로, 그 목록이 열려 있으면 떼지 않는다.
    // (담당 병동 버튼을 누른 클릭이 문서까지 전달되어 이 함수가 방금 붙인 표시를 떼면 팝업에 스크롤이 생겨 찌그러졌다)
    if (createWardOptions?.hidden !== false) createDialog.classList.remove("ward-menu-overflow");
}

// 프런트 미리보기용 병실 번호이며 DB의 병동·위치 ID로 사용하지 않는다.
function refreshCreateRooms() {
    const wardNumber = Number(createRoomWardSelect.value);
    createRoomSelect.replaceChildren(new Option(wardNumber ? "담당 병실을 선택해 주세요" : "병동을 먼저 선택해 주세요", ""));
    if (wardNumber) {
        for (let offset = 1; offset <= 17; offset += 1) {
            const room = wardNumber * 100 + offset;
            createRoomSelect.append(new Option(room + "호", String(room)));
        }
    }
    createRoomSelect.disabled = !wardNumber;
    createRoomTrigger.disabled = !wardNumber;
    closeCreateRoomOptions();
    renderCreateRoomDropdown();
}
createRoomWardSelect.addEventListener("change", () => {
    createRoomWardError.textContent = "";
    createRoomError.textContent = "";
    renderCreateRoomWardDropdown();
    refreshCreateRooms();
});
renderCreateRoomWardDropdown();
createRoomWardTrigger.addEventListener("click", () => {
    if (!createRoomWardOptions.hidden) return closeCreateRoomWardOptions();
    closeCreateRoomOptions();
    renderCreateRoomWardDropdown();
    createRoomWardDropdown.classList.remove("open-up");
    createRoomWardOptions.style.maxHeight = "240px";
    createDialog.classList.add("ward-menu-overflow");
    createRoomWardOptions.hidden = false;
    createRoomWardTrigger.setAttribute("aria-expanded", "true");
});
refreshCreateRooms();
createRoomTrigger.addEventListener("click", () => {
    if (!createRoomOptions.hidden) return closeCreateRoomOptions();
    closeCreateRoomWardOptions();
    renderCreateRoomDropdown();
    // [2026.09.22 변경] 담당 병실 목록은 팝업 크기를 바꾸지 않고 선택칸 아래에 표시합니다.
    createRoomDropdown.classList.remove("open-up");
    createRoomOptions.style.maxHeight = "240px";
    createDialog.classList.add("room-menu-open");
    createRoomOptions.hidden = false;
    createRoomTrigger.setAttribute("aria-expanded", "true");
});
document.addEventListener("click", event => {
    if (!createRoomDropdown.contains(event.target)) closeCreateRoomOptions();
    if (!createRoomWardDropdown.contains(event.target)) closeCreateRoomWardOptions();
});
document.addEventListener("keydown", event => {
    if (event.key === "Escape" && (!createRoomOptions.hidden || !createRoomWardOptions.hidden)) {
        event.stopPropagation();
        closeCreateRoomOptions();
        closeCreateRoomWardOptions();
    }
}, true);

// [2026.09.30 추가] 간호사 담당 병실 선택. 간병인 담당 병실과 같은 필터 디자인이며, 여러 병실을 눌러 고르고 다시 누르면 빠집니다.
// 한 병실을 여러 간호사가 담당할 수 있어, 다른 간호사가 담당 중인 병실도 고를 수 있습니다(그 이름만 흐리게 함께 표시).
function renderCreateStaffRoomDropdown() {
    if (!createStaffRoomTrigger || !createStaffRoomOptions || !createStaffRoomLabel) return;
    const wardName = createWardSelect?.value ? createWardSelect.selectedOptions[0]?.textContent : "";
    const wardNumber = window.adminStaffRooms?.wardNumber(wardName);
    createStaffRoomOptions.replaceChildren();
    createStaffRoomTrigger.disabled = !wardNumber;
    createStaffRoomLabel.textContent = !createWardSelect?.value ? "담당 병동을 먼저 선택해 주세요"
        : !wardNumber ? "이 병동은 담당 병실을 지정하지 않습니다"
        : createStaffRooms.size ? window.adminStaffRooms.format(createStaffRooms) : "담당 병실 없음 (선택 사항)";
    if (!wardNumber) return;
    const owners = window.adminStaffRooms.owners(createWardSelect.value, null);
    for (const room of window.adminStaffRooms.roomsOf(wardNumber)) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("role", "option");
        window.adminStaffRooms.optionContent(button, room, owners.get(room));
        button.setAttribute("aria-selected", String(createStaffRooms.has(room)));
        button.addEventListener("click", () => {
            if (createStaffRooms.has(room)) createStaffRooms.delete(room);
            else createStaffRooms.add(room);
            button.setAttribute("aria-selected", String(createStaffRooms.has(room)));
            createStaffRoomLabel.textContent = createStaffRooms.size
                ? window.adminStaffRooms.format(createStaffRooms) : "담당 병실 없음 (선택 사항)";
            if (createStaffRoomError) createStaffRoomError.textContent = "";
        });
        createStaffRoomOptions.append(button);
    }
}

function closeCreateStaffRoomOptions() {
    if (!createStaffRoomOptions || !createStaffRoomTrigger) return;
    createStaffRoomOptions.hidden = true;
    createStaffRoomTrigger.setAttribute("aria-expanded", "false");
    createStaffRoomDropdown?.classList.remove("open-up");
    createStaffRoomOptions.style.removeProperty("max-height");
    createDialog?.classList.remove("staff-room-menu-open");
}

if (createStaffRoomTrigger && createStaffRoomOptions && createStaffRoomDropdown) {
    createStaffRoomTrigger.addEventListener("click", () => {
        if (createStaffRoomTrigger.disabled) return;
        if (!createStaffRoomOptions.hidden) {
            closeCreateStaffRoomOptions();
            return;
        }
        createStaffRoomOptions.hidden = false;
        createStaffRoomTrigger.setAttribute("aria-expanded", "true");
        createDialog?.classList.add("staff-room-menu-open");
        // 아래 공간이 부족하면(낮은 화면) 담당 병동 목록처럼 위로 펼치고 팝업 안에 들어가게 줄입니다.
        const triggerBounds = createStaffRoomTrigger.getBoundingClientRect();
        const menuHeight = createStaffRoomOptions.getBoundingClientRect().height;
        if (menuHeight > window.innerHeight - triggerBounds.bottom - 12) {
            const dialogBounds = createDialog.getBoundingClientRect();
            createStaffRoomDropdown.classList.add("open-up");
            createStaffRoomOptions.style.maxHeight = `${Math.max(96, Math.floor(triggerBounds.top - dialogBounds.top - 12))}px`;
        }
    });
    document.addEventListener("click", event => {
        if (!createStaffRoomDropdown.contains(event.target)) closeCreateStaffRoomOptions();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !createStaffRoomOptions.hidden) {
            event.stopPropagation();
            closeCreateStaffRoomOptions();
            createStaffRoomTrigger.focus();
        }
    }, true);
}

function closeCreateWardOptions() {
    if (!createWardOptions || !createWardTrigger) return;
    createWardOptions.hidden = true;
    createWardTrigger.setAttribute("aria-expanded", "false");
    createWardDropdown?.classList.remove("open-up");
    // [2026.09.30 수정] 간병인 병동 목록이 열려 있으면 같은 표시를 떼지 않는다(위 closeCreateRoomWardOptions 와 같은 이유).
    if (createRoomWardOptions?.hidden !== false) createDialog?.classList.remove("ward-menu-overflow");
    createWardOptions.style.removeProperty("max-height");
}

function renderCreateWardDropdown() {
    if (!createWardSelect || !createWardOptions || !createWardTrigger || !createWardLabel) return;
    createWardOptions.replaceChildren();
    createWardLabel.textContent = createWardSelect.selectedOptions[0]?.textContent
        || "담당 병동을 선택해주세요";
    createWardTrigger.disabled = createWardSelect.disabled;
    for (const option of createWardSelect.options) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = option.textContent;
        button.setAttribute("aria-selected", String(option.value === createWardSelect.value));
        button.addEventListener("click", () => {
            createWardSelect.value = option.value;
            createWardSelect.dispatchEvent(new Event("change", { bubbles: true }));
            closeCreateWardOptions();
            createWardTrigger.focus();
        });
        createWardOptions.append(button);
    }
}

if (createWardTrigger && createWardOptions && createWardDropdown) {
    createWardTrigger.addEventListener("click", () => {
        if (createWardTrigger.disabled) return;
        const opening = createWardOptions.hidden;
        if (!opening) {
            closeCreateWardOptions();
            return;
        }
        createWardOptions.hidden = false;
        createWardTrigger.setAttribute("aria-expanded", "true");
        const triggerBounds = createWardTrigger.getBoundingClientRect();
        const menuHeight = createWardOptions.getBoundingClientRect().height;
        const spaceBelowViewport = window.innerHeight - triggerBounds.bottom - 12;
        if (menuHeight <= spaceBelowViewport) {
            createDialog.classList.add("ward-menu-overflow");
        } else {
            const dialogBounds = createDialog.getBoundingClientRect();
            const spaceAbove = triggerBounds.top - dialogBounds.top - 12;
            createWardDropdown.classList.add("open-up");
            createWardOptions.style.maxHeight = `${Math.max(96, Math.floor(spaceAbove))}px`;
        }
    });
    createWardSelect.addEventListener("change", renderCreateWardDropdown);
    // [2026.09.30 추가] 담당 병동이 바뀌면 그 병동의 병실로 다시 고릅니다.
    createWardSelect.addEventListener("change", () => {
        createStaffRooms.clear();
        if (createStaffRoomError) createStaffRoomError.textContent = "";
        renderCreateStaffRoomDropdown();
    });
    document.addEventListener("click", event => {
        if (!createWardDropdown.contains(event.target)) closeCreateWardOptions();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !createWardOptions.hidden) {
            event.stopPropagation();
            closeCreateWardOptions();
            createWardTrigger.focus();
        }
    }, true);
    renderCreateWardDropdown();
}

if (createNameInput) createNameInput.maxLength = 20;
if (createUserIdInput) createUserIdInput.maxLength = 20;
if (createPhoneInput) createPhoneInput.maxLength = 13;
if (createStaffPhoneInput) createStaffPhoneInput.maxLength = 13;

function maskCompletePhone(phoneNumber) {
    const digits = String(phoneNumber ?? "").replace(/\D/g, "");
    return digits.length >= 7 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : "—";
}

function clearCreateErrors() {
    if (createNameError) createNameError.textContent = "";
    if (createUserIdError) createUserIdError.textContent = "";
    if (createWardError) createWardError.textContent = "";
    if (createPhoneError) createPhoneError.textContent = "";
    if (createStaffPhoneError) createStaffPhoneError.textContent = "";
    if (createRoomError) createRoomError.textContent = "";
    createRoomWardError.textContent = "";
}

function showCreateFieldErrors(errorBody) {
    let displayed = false;
    if (!errorBody || typeof errorBody !== "object" || Array.isArray(errorBody)) return false;

    if (typeof errorBody.userName === "string" && createNameError) {
        createNameError.textContent = errorBody.userName;
        displayed = true;
    }
    if (typeof errorBody.userId === "string" && createUserIdError) {
        createUserIdError.textContent = errorBody.userId;
        displayed = true;
    }
    if (typeof errorBody.wardId === "string" && createWardError) {
        createWardError.textContent = errorBody.wardId;
        displayed = true;
    }
    if (typeof errorBody.phoneNumber === "string" && createPhoneError) {
        (isCaregiverCreation() ? createPhoneError : createStaffPhoneError).textContent = errorBody.phoneNumber;
        displayed = true;
    }
    if (typeof errorBody.roomNumber === "string" && createRoomError) {
        createRoomError.textContent = errorBody.roomNumber;
        displayed = true;
    }
    // [2026.09.30 추가] 간호사 담당 병실 안내(병실 번호 범위 등)
    if (typeof errorBody.staffRooms === "string" && createStaffRoomError) {
        createStaffRoomError.textContent = errorBody.staffRooms;
        displayed = true;
    }
    return displayed;
}

function showCreateError(message) {
    if (typeof showAdminFeedback === "function") {
        showAdminFeedback(message);
    } else if (createUserIdError) {
        createUserIdError.textContent = message;
    }
}

async function requestCreateApi(url, options = {}) {
    const method = (options.method ?? "GET").toUpperCase();
    const headers = new Headers(options.headers ?? {});
    headers.set("Accept", "application/json");

    if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
        const csrfToken = document.querySelector('meta[name="_csrf"]')?.content;
        const csrfHeader = document.querySelector('meta[name="_csrf_header"]')?.content;

        if (!csrfToken || !csrfHeader) {
            throw new Error("관리자 로그인 정보가 없습니다. 다시 로그인해 주세요.");
        }
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
        throw new Error("로그인이 만료되었습니다. 다시 로그인해 주세요.");
    }

    let responseBody = null;
    const responseText = await response.text();

    if (responseText) {
        try {
            responseBody = JSON.parse(responseText);
        } catch {
            responseBody = null;
        }
    }

    if (!response.ok) {
        const error = new Error(
            responseBody?.message ?? `요청 처리에 실패했습니다. (${response.status})`
        );
        error.status = response.status;
        error.body = responseBody;
        throw error;
    }

    return responseBody;
}

function renderCreateWardOptions(wards) {
    if (!createWardSelect) return;

    createWardSelect.replaceChildren(new Option("담당 병동을 선택해주세요", ""));

    for (const ward of wards) {
        createWardSelect.append(new Option(ward.wardName, String(ward.wardId)));
    }
    renderCreateWardDropdown();
}

createAccountButton?.addEventListener("click", async () => {
    if (createPending || createDialog?.open) return;

    createForm?.reset();
    renderCreateRoomWardDropdown();
    refreshCreateRooms();
    closeCreateRoomWardOptions();
    closeCreateWardOptions();
    closeCreateRoomOptions();
    renderCreateRoomDropdown();
    clearCreateErrors();
    createStaffRooms.clear();
    closeCreateStaffRoomOptions();
    renderCreateStaffRoomDropdown();
    availableWards = [];
    const caregiver = isCaregiverCreation();
    document.querySelectorAll(".admin-create-staff-field").forEach(field => { field.hidden = caregiver; });
    document.querySelectorAll(".admin-create-caregiver-field").forEach(field => { field.hidden = !caregiver; });

    if (caregiver) {
        if (createSubmitButton) createSubmitButton.disabled = false;
        createDialog?.showModal();
        createNameInput?.focus();
        return;
    }

    if (createWardSelect) {
        createWardSelect.disabled = true;
        createWardSelect.replaceChildren(new Option("병동 목록을 불러오는 중입니다.", ""));
        renderCreateWardDropdown();
    }
    if (createSubmitButton) createSubmitButton.disabled = true;

    createDialog?.showModal();
    const currentVersion = ++wardRequestVersion;

    try {
        const wards = await requestCreateApi("/api/admin/wards");

        if (currentVersion !== wardRequestVersion || !createDialog?.open) return;
        if (!Array.isArray(wards)) throw new Error("병동 목록 응답이 올바르지 않습니다.");

        availableWards = wards;
        renderCreateWardOptions(availableWards);

        if (availableWards.length === 0) {
            showCreateError("등록된 병동이 없습니다. 병동 등록 후 계정을 생성해 주세요.");
            return;
        }

        if (createWardSelect) createWardSelect.disabled = false;
        renderCreateWardDropdown();
        if (createSubmitButton) createSubmitButton.disabled = false;
    } catch (error) {
        if (currentVersion !== wardRequestVersion || !createDialog?.open) return;

        renderCreateWardOptions([]);
        showCreateError(error.message ?? "병동 목록을 불러오지 못했습니다.");
    }
});

createCancelButton?.addEventListener("click", () => {
    if (!createPending) createDialog?.close();
});

createDialog?.addEventListener("cancel", event => {
    if (createPending) event.preventDefault();
});

createDialog?.addEventListener("close", () => {
    wardRequestVersion += 1;
    closeCreateWardOptions();
    closeCreateRoomOptions();
});

createCompleteCloseButton?.addEventListener("click", () => {
    createCompleteDialog?.close();
});

createCompleteDialog?.addEventListener("close", () => {
    const passwordElement = document.querySelector("#complete-account-password");
    const copyButton = document.querySelector("#copy-account-password");

    if (passwordElement) passwordElement.textContent = "";
    if (copyButton) copyButton.textContent = "복사하기";
});

document.querySelector("#copy-account-password")?.addEventListener("click", async event => {
    const copyButton = event.currentTarget;
    const temporaryPassword = document.querySelector(
        "#complete-account-password"
    )?.textContent;

    if (!temporaryPassword) {
        showCreateError("복사할 임시 비밀번호가 없습니다.");
        return;
    }

    try {
        await navigator.clipboard.writeText(temporaryPassword);
        copyButton.textContent = "복사됨";

        setTimeout(() => {
            copyButton.textContent = "복사하기";
        }, 1600);
    } catch {
        showCreateError(
            "자동 복사가 불가능합니다. 표시된 비밀번호를 직접 복사해 주세요."
        );
    }
});

createForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (createPending) return;

    clearCreateErrors();

    const userName = createNameInput?.value.trim() ?? "";
    const userId = createUserIdInput?.value.trim() ?? "";
    const caregiver = isCaregiverCreation();
    const phoneNumber = createPhoneInput?.value.replace(/\D/g, "") ?? "";
    const staffPhoneNumber = createStaffPhoneInput?.value.replace(/\D/g, "") ?? "";
    const roomNumber = Number(createRoomSelect?.value ?? 0);
    const wardValue = createWardSelect?.value ?? "";
    const validUserId = /^[A-Za-z0-9._-]{1,20}$/.test(userId);
    const validUserName = userName.length >= 1 && userName.length <= 20;
    const selectedWard = availableWards.find(
        ward => String(ward.wardId) === String(wardValue)
    );

    if (!validUserName && createNameError) {
        createNameError.textContent = "이름을 20자 이내로 입력해 주세요.";
    }
    if (!caregiver && !validUserId && createUserIdError) {
        createUserIdError.textContent =
            "아이디는 영문, 숫자, 마침표, 밑줄, 하이픈으로 20자 이내로 입력해 주세요.";
    }
    if (!caregiver && !selectedWard && createWardError) {
        createWardError.textContent = "담당 병동을 선택해 주세요.";
    }
    if (!caregiver && !/^01\d{8,9}$/.test(staffPhoneNumber)) {
        createStaffPhoneError.textContent = "휴대전화 번호를 확인해 주세요.";
    }
    if (caregiver && !/^01\d{8,9}$/.test(phoneNumber)) {
        createPhoneError.textContent = "휴대전화 번호를 확인해 주세요.";
    }
    const selectedWardNumber = Number(createRoomWardSelect.value);
    const validRoom = selectedWardNumber >= 1 && selectedWardNumber <= 3
        && roomNumber > selectedWardNumber * 100 && roomNumber <= selectedWardNumber * 100 + 17;
    if (caregiver && !selectedWardNumber) createRoomWardError.textContent = "담당 병동을 선택해 주세요.";
    if (caregiver && !validRoom) createRoomError.textContent = "선택한 병동의 담당 병실을 선택해 주세요.";
    if (!validUserName || (caregiver
        ? !/^01\d{8,9}$/.test(phoneNumber) || !validRoom
        : !validUserId || !selectedWard || !/^01\d{8,9}$/.test(staffPhoneNumber))) return;

    if (caregiver && selectedWardNumber !== 3) {
        createRoomError.textContent = "1·2병동 계정 생성은 서버 연동 후 사용할 수 있습니다.";
        return;
    }

    createPending = true;
    const controls = [...createForm.querySelectorAll("input, select, button")];
    controls.forEach(control => { control.disabled = true; });

    try {
        const created = await requestCreateApi(caregiver ? "/api/admin/caregivers" : "/api/admin/users", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(caregiver
                ? { userName, phoneNumber, roomNumber }
                // [2026-09-27 변경] 간호사 전화번호도 서버에 저장합니다. 확정 낙상 SMS 를 이 번호로 받습니다.
                // [2026.09.30 추가] 담당 병실(선택 사항)도 함께 보냅니다. 비워 두면 담당 병실 없이 생성합니다.
                : { userId, userName, wardId: Number(selectedWard.wardId), phoneNumber: staffPhoneNumber,
                    roomNumbers: [...createStaffRooms].map(Number) })
        });

        if (
            !created ||
            (caregiver ? !created.userId : created.userId !== userId) ||
            // [2026.09.30 변경] 간병인은 로그인 계정이 아니라(명세 TB_CAREGIVER) 임시 비밀번호가 없습니다.
            (!caregiver && (typeof created.temporaryPassword !== "string" || !created.temporaryPassword))
        ) {
            throw new Error("계정 생성 결과를 확인할 수 없습니다.");
        }

        const completeName = document.querySelector("#complete-account-name");
        const completePhone = document.querySelector("#complete-account-phone");
        const completeUserId = document.querySelector("#complete-account-user-id");
        const completeWard = document.querySelector("#complete-account-ward");
        const completePassword = document.querySelector("#complete-account-password");

        if (completeName) completeName.textContent = created.userName;
        if (completePhone) completePhone.textContent = maskCompletePhone(caregiver ? phoneNumber : staffPhoneNumber);
        if (completeUserId) completeUserId.textContent = caregiver ? "" : created.userId;
        if (completeWard) completeWard.textContent = caregiver ? `${roomNumber}호`
            : [selectedWard.wardName, window.adminStaffRooms?.format(createStaffRooms)].filter(Boolean).join(" · ");
        if (completePassword) completePassword.textContent = caregiver ? "" : created.temporaryPassword;
        document.querySelector("#complete-account-phone-row").hidden = false;
        document.querySelector("#complete-account-user-id-row").hidden = caregiver;
        document.querySelector("#complete-account-password-row").hidden = caregiver;
        createCompleteDialog.classList.toggle("is-caregiver", caregiver);

        if (createContext) {
            const alreadyExists = createContext.users.some(
                user => user.userId === created.userId
            );

            if (!alreadyExists) {
                createContext.users.unshift({
                    userId: created.userId,
                    name: created.userName,
                    status: created.accountStatus ?? "APPROVED",
                    wardId: created.wardId,
                    ward: caregiver ? "3병동" : selectedWard.wardName,
                    phoneNumber: caregiver ? phoneNumber : staffPhoneNumber,
                    roomNumber: caregiver ? String(roomNumber) : null,
                    assignedRooms: caregiver ? [] : [...createStaffRooms]
                });
            }

            createContext.renderUsers();
        }

        createDialog?.close();
        createForm.reset();
        renderCreateRoomWardDropdown();
        refreshCreateRooms();
        closeCreateRoomWardOptions();
        createCompleteDialog?.showModal();
    } catch (error) {
        // [2026-09-18] 중복 아이디 안내를 배경 화면 대신 계정 생성 창의 아이디 입력란 아래에 표시한다.
        // [2026-09-27] 간호사도 번호가 겹치면 409 가 오므로, 안내에 '전화번호'가 들어 있으면 전화번호 칸 아래에 표시한다.
        const phoneConflict = caregiver || String(error.message ?? "").includes("전화번호");
        // [2026.09.30 추가] 담당 병실 안내(병실 번호 범위 등)는 담당 병실 칸 아래에 표시한다.
        const staffRoomProblem = !caregiver && String(error.message ?? "").includes("병실");
        // [2026.09.30 추가] 간병인 병실 안내(이미 담당 간병인이 있는 병실 등)는 담당 병실 칸 아래에 표시한다.
        const caregiverRoomProblem = caregiver && String(error.message ?? "").includes("병실");
        const fieldErrorDisplayed = showCreateFieldErrors(
            staffRoomProblem
                ? {staffRooms: error.message}
                : caregiverRoomProblem
                ? {roomNumber: error.message}
                : error.status === 409
                ? phoneConflict
                    ? {phoneNumber: error.message || "이미 등록된 전화번호입니다."}
                    : {userId: error.message || "이미 사용 중인 직원 아이디입니다."}
                : error.body
        );

        if (!fieldErrorDisplayed) {
            showCreateError(error.message ?? "계정 생성에 실패했습니다.");
        }
    } finally {
        createPending = false;
        controls.forEach(control => { control.disabled = false; });
    }
});
