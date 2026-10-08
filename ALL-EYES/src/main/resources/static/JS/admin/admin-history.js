"use strict";

(() => {
    const historyRows = document.querySelector("#admin-history-rows");
    const historyCards = [
        ...document.querySelectorAll(".history-filter-card")
    ];
    const historyEmpty = document.querySelector("#admin-history-empty");

    if (!historyRows) return;

    const actionLabels = {
        CREATE: "계정 생성",
        CHANGE_WARD: "병동 · 병실 변경",
        // [2026.09.30 추가] 병실 변경, 전화번호 수정(공용 DB 작업 코드에 추가함)
        CHANGE_ROOM: "병동 · 병실 변경",
        CHANGE_PHONE: "전화번호 수정",
        RESET_PASSWORD: "비밀번호 초기화",
        DEACTIVATE: "계정 비활성화",
        ACTIVATE: "계정 재활성화",
        DELETE: "계정 삭제"
    };

    let requestVersion = 0;

    /**
     * 서버의 Instant 값을 한국 시간으로 표시한다.
     */
    function formatCreatedAt(createdAt) {
        const date = new Date(createdAt);

        if (Number.isNaN(date.getTime())) {
            return createdAt ?? "";
        }

        const parts = new Intl.DateTimeFormat("ko-KR", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23"
        }).formatToParts(date);

        const values = Object.fromEntries(
            parts.map(part => [part.type, part.value])
        );

        return `${values.year}-${values.month}-${values.day} `
                + `${values.hour}:${values.minute}`;
    }

    /**
     * 감사 코드에 해당하는 화면 표시 문구를 반환한다.
     */
    function getActionLabel(actionCode) {
        if (actionCode === "CHANGE_WARD" || actionCode === "CHANGE_ROOM") {
            return "병동 · 병실 변경";
        }
        return actionLabels[actionCode] ?? actionCode ?? "알 수 없음";
    }

    /**
     * [2026.10.01 변경] 전화번호 수정 이력의 처리 내용을 목록과 상세에서 읽기 쉬운 문구로 정리합니다.
     */
    function wardNameFromRoomText(value) {
        const roomMatch = String(value ?? "").match(/(\d{3})호/);
        if (!roomMatch) return "";
        const wardNumber = Math.floor(Number(roomMatch[1]) / 100);
        return wardNumber ? `${wardNumber}병동` : "";
    }

    function normalizeAssignmentDetailPart(part) {
        const value = String(part ?? "").trim().replace(/^담당\s+/, "");
        if (!value) return [];

        const arrowMatch = value.match(/^(.*?)\s*→\s*(.*?)$/);
        if (arrowMatch) {
            const beforeRaw = arrowMatch[1].trim().replace(/^(병동|병실|위치)\s+/, "");
            const afterRaw = arrowMatch[2].trim();
            const beforeWard = wardNameFromRoomText(beforeRaw);
            const afterWard = wardNameFromRoomText(afterRaw);
            const isWardChange = value.includes("병동") || beforeRaw.includes("병동") || afterRaw.includes("병동");
            const lines = [];

            if (isWardChange) {
                lines.push(`변경된 병동 ${beforeRaw || "미확인"} → ${afterRaw || "미확인"}`);
            } else {
                if (beforeWard && afterWard && beforeWard !== afterWard) {
                    lines.push(`변경된 병동 ${beforeWard} → ${afterWard}`);
                }
                lines.push(`변경된 병실 ${beforeRaw || "없음"} → ${afterRaw || "없음"}`);
            }

            return lines;
        }

        const normalized = value.replace(/^(병동|병실|위치)\s+/, "");
        const label = value.includes("병동") ? "변경된 병동" : value.includes("병실") || value.includes("위치") || /\d{3}호/.test(value) ? "변경된 병실" : "변경 내용";
        return [`${label} ${normalized}`];
    }

    /**
     * [2026.10.01 변경] 전화번호 수정과 병동·병실 변경 이력의 처리 내용을 목록과 상세에서 읽기 쉽게 정리합니다.
     */
    function formatActionDetail(actionCode, detail) {
        const value = String(detail ?? "").trim();

        if (!value) return "";

        if (actionCode === "CHANGE_PHONE") {
            const phoneValue = value.replace(/^끝자리\s+/, "");
            return phoneValue.includes("→")
                ? `수정 번호 ${phoneValue}`
                : `수정 번호 ${phoneValue}`;
        }

        if (actionCode === "CHANGE_WARD" || actionCode === "CHANGE_ROOM") {
            const lines = value
                .split(",")
                .flatMap(normalizeAssignmentDetailPart)
                .filter(Boolean);
            const hasWardLine = lines.some(line => line.startsWith("변경된 병동 "));
            return lines
                .filter((line, index) => !(line.startsWith("변경된 병동 ") && hasWardLine && lines.findIndex(item => item === line) !== index))
                .filter((line, index, allLines) => !(line.startsWith("변경된 병동 ") && allLines.findIndex(item => item.startsWith("변경된 병동 ")) !== index))
                .join(", ");
        }

        return value;
    }

    /**
     * [2026.10.01 변경] 병동 변경 이력도 상세값이 비어 있어도 작업명 클릭 시 같은 팝업 효과가 나오도록 표시 문구를 보완합니다.
     */
    function getPopupActionDetail(history) {
        const detail = formatActionDetail(history.actionCode, history.actionDetail);

        if (detail) return detail;

        if (history.actionCode === "CHANGE_WARD") {
            const wardName = String(history.wardName ?? "").trim();
            return wardName
                ? `변경된 병동 ${wardName}`
                : "변경된 병동 변경값 미확인";
        }

        if (history.actionCode === "CHANGE_ROOM") {
            return `변경된 병실 ${formatCaregiverLocation(history)}`;
        }

        return "";
    }

    /**
     * [2026.09.30 추가] 상단 카드 필터에 쓰는 이름. 간호사 화면은 병동 변경과 병실 변경을 '병동·병실 변경' 카드 하나로,
     * 간병인 화면은 '병실 변경' 카드로 셉니다(예전 간병인 이력은 병실 변경도 CHANGE_WARD 로 남아 있습니다).
     */
    function getFilterLabel(actionCode) {
        if (actionCode === "CHANGE_WARD" || actionCode === "CHANGE_ROOM") {
            return "병동 · 병실 변경";
        }
        return getActionLabel(actionCode);
    }

    /**
     * [2026.10.01 변경] 병실 변경·전화번호 수정은 작업명 자체를 눌러 변경 내용을 작은 팝업으로 확인합니다.
     */
    function isPopupAction(actionCode, detail) {
        return Boolean(detail) && ["CHANGE_PHONE", "CHANGE_ROOM", "CHANGE_WARD"].includes(actionCode);
    }

    function closeActionPopup() {
        document.querySelector(".history-action-popover")?.remove();
        document.querySelectorAll(".history-action-link[aria-expanded='true']").forEach(button => {
            button.setAttribute("aria-expanded", "false");
        });
    }

    function openActionPopup(button, label, detail) {
        closeActionPopup();

        const popover = document.createElement("div");
        popover.className = "history-action-popover";
        popover.setAttribute("role", "dialog");
        popover.setAttribute("aria-label", `${label} 수정 내용`);
        popover.innerHTML = `<strong></strong><div class="history-action-detail-lines"></div>`;
        popover.querySelector("strong").textContent = label;
        const detailLines = popover.querySelector(".history-action-detail-lines");
        String(detail)
            .split(",")
            .map(part => part.trim())
            .filter(Boolean)
            .forEach(part => {
                const namedChange = part.match(/^(변경된\s+(?:병동|병실)|수정\s+번호)\s+(.+)$/);
                const firstSpace = part.indexOf(" ");
                const name = namedChange ? namedChange[1] : firstSpace > -1 ? part.slice(0, firstSpace).trim() : "변경 내용";
                const change = namedChange ? namedChange[2] : firstSpace > -1 ? part.slice(firstSpace + 1).trim() : part;
                const line = document.createElement("p");
                line.innerHTML = `<span></span><b></b>`;
                line.querySelector("span").textContent = name;
                line.querySelector("b").textContent = change;
                detailLines.append(line);
            });
        document.body.append(popover);

        const rect = button.getBoundingClientRect();
        const popoverRect = popover.getBoundingClientRect();
        const gap = 8;
        const left = Math.min(
            Math.max(12, rect.left + rect.width / 2 - popoverRect.width / 2),
            window.innerWidth - popoverRect.width - 12
        );
        const top = Math.min(
            rect.bottom + gap,
            window.innerHeight - popoverRect.height - 12
        );

        popover.style.left = `${left}px`;
        popover.style.top = `${Math.max(12, top)}px`;
        button.setAttribute("aria-expanded", "true");
    }

    function createActionCell(label, detail, actionCode) {
        const cell = createCell("");

        if (isPopupAction(actionCode, detail)) {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "history-action-link";
            button.textContent = label;
            button.setAttribute("aria-expanded", "false");
            button.setAttribute("aria-label", `${label} 수정 내용 보기`);
            button.addEventListener("click", event => {
                event.stopPropagation();
                if (button.getAttribute("aria-expanded") === "true") {
                    closeActionPopup();
                    return;
                }
                openActionPopup(button, label, detail);
            });
            cell.replaceChildren(button);
            cell.title = `${label} · ${detail}`;
            return cell;
        }

        cell.textContent = label;
        return cell;
    }

    document.addEventListener("click", event => {
        if (event.target.closest(".history-action-popover, .history-action-link")) return;
        closeActionPopup();
    });

    /**
     * 일반 표 셀을 생성한다.
     */
    function createCell(value) {
        const cell = document.createElement("td");
        cell.textContent = value ?? "";
        return cell;
    }

    /**
     * 간병인 이력의 병동과 담당 병실을 한 셀에 함께 표시한다.
     */
    function formatCaregiverLocation(history) {
        const wardName = history.wardName?.trim() || "미배정 병동";
        const roomValue = String(history.roomNumber ?? "").replace(/호$/, "").trim();
        const roomName = roomValue ? `${roomValue}호` : "미배정 병실";
        return `${wardName} · ${roomName}`;
    }

    /**
     * 기존 Yejin 화면의 회원 관리 버튼을 생성한다.
     */
    function createManagementCell(history) {
        const cell = document.createElement("td");
        cell.className = "history-actions";

        const detailButton = document.createElement("button");
        detailButton.type = "button";
        detailButton.className = "history-edit";
        detailButton.textContent = "✎";
        detailButton.setAttribute(
            "aria-label",
            `${getActionLabel(history.actionCode)} 상세 및 직원 관리`
        );

        const deactivateButton = document.createElement("button");
        deactivateButton.type = "button";
        deactivateButton.className = "history-delete";
        deactivateButton.setAttribute(
            "aria-label",
            `${history.userId} 계정 비활성화`
        );
        deactivateButton.innerHTML = `
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>
            </svg>
        `;

        /*
         * 삭제된 계정은 다시 관리할 수 없으므로
         * 상세 버튼만 표시한다.
         */
        cell.append(detailButton);

        if (history.actionCode !== "DELETE") {
            cell.append(deactivateButton);
        }

        return cell;
    }

    /**
     * 서버에서 조회한 감사 로그를 표에 출력한다.
     */
    function renderHistories(histories) {
        const fragment = document.createDocumentFragment();
        const caregiverHistory = document.body.dataset.adminJobType === "CAREGIVER";

        for (const history of histories) {
            const row = document.createElement("tr");
            const actionLabel = getActionLabel(history.actionCode);
            const actionDetail = getPopupActionDetail(history);

            row.dataset.historyId = String(history.historyId ?? "");
            // [2026.09.30 변경] 카드 필터 이름(간호사 '병동·병실 변경')과 표에 보이는 작업 이름을 나눠 둡니다.
            row.dataset.historyAction = getFilterLabel(history.actionCode);
            row.dataset.actionLabel = actionLabel;
            row.dataset.actionDetail = actionDetail;
            row.dataset.actionCode = history.actionCode ?? "";
            row.dataset.userId = history.userId ?? "";
            row.dataset.userName = history.userName ?? "";
            row.dataset.wardName = history.wardName ?? "";

            row.append(
                createCell(formatCreatedAt(history.createdAt)),
                createCell(history.adminId),
                // [2026-09-22 변경] 대상 간호사와 간병인은 내부 아이디 대신 이름을 표시합니다.
                createCell(history.userName || "이름 미확인"),
                createCell(caregiverHistory ? formatCaregiverLocation(history) : (history.wardName ?? "미확인")),
                createActionCell(actionLabel, actionDetail, history.actionCode),
                createManagementCell(history)
            );

            fragment.append(row);
        }

        historyRows.replaceChildren(fragment);
        renderHistoryCounts(histories);

        if (typeof filterHistory === "function") {
            filterHistory(
                typeof adminHistoryFilter === "string"
                    ? adminHistoryFilter
                    : "전체"
            );
        }
    }

    /**
     * 상단 처리 내용별 카드 건수를 실제 감사 로그 기준으로 표시한다.
     */
    function renderHistoryCounts(histories) {
        for (const card of historyCards) {
            const filter = card.dataset.historyFilter;
            const countElement = card.querySelector("strong");

            if (!countElement) continue;

            const count = filter === "전체"
                ? histories.length
                : histories.filter(history =>
                    getFilterLabel(history.actionCode) === filter
                ).length;

            countElement.textContent = `${count}건`;
        }
    }

    /**
     * 감사 로그 조회 API를 호출한다.
     */
    async function requestHistories() {
        const response = await fetch(
            "/api/admin/account-audit-logs?limit=50",
            {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        if (response.status === 401 || response.redirected) {
            window.location.href = "/login";
            throw new Error("로그인이 만료되었습니다.");
        }

        if (response.status === 403) {
            throw new Error("감사 로그 조회 권한이 없습니다.");
        }

        if (!response.ok) {
            let message =
                `감사 로그를 불러오지 못했습니다. (${response.status})`;

            try {
                const errorBody = await response.json();

                if (errorBody.message) {
                    message = errorBody.message;
                }
            } catch (error) {
                // JSON 형식이 아니면 기본 메시지를 사용한다.
            }

            throw new Error(message);
        }

        const histories = await response.json();

        if (!Array.isArray(histories)) {
            throw new Error("감사 로그 응답 형식이 올바르지 않습니다.");
        }

        // [2026-09-22 추가] 선택한 직무의 계정 작업 이력만 해당 관리 이력 화면에 표시합니다.
        // [2026-09-27 변경] 이력 응답의 직무(jobType)로 나눕니다. 전에는 지금 활성·승인 대기 직원 목록과 맞춰 봐서
        // 비활성화·삭제된 직원의 이력(비활성화 기록 포함)이 빠졌습니다.
        // 삭제된 직원은 직무가 남아 있지 않아 아이디로 나눕니다(간병인 아이디는 "cg.전화번호" 모양).
        if (document.querySelector("#admin-management-page")?.classList.contains("is-history-page")) {
            const jobType = document.body.dataset.adminJobType === "CAREGIVER" ? "CAREGIVER" : "GENERAL";
            const historyJobType = history => history.jobType
                ?? (String(history.userId ?? "").startsWith("cg.") ? "CAREGIVER" : "GENERAL");
            return histories.filter(history => historyJobType(history) === jobType);
        }

        return histories;
    }

    /**
     * 감사 로그를 다시 조회하여 화면을 갱신한다.
     */
    async function refreshAdminHistory() {
        const currentVersion = ++requestVersion;

        try {
            const histories = await requestHistories();

            if (currentVersion !== requestVersion) return;

            renderHistories(histories);
        } catch (error) {
            if (currentVersion !== requestVersion) return;

            console.error(error);
            historyRows.replaceChildren();
            renderHistoryCounts([]);

            if (historyEmpty) {
                historyEmpty.hidden = false;
                historyEmpty.textContent =
                    "관리 이력을 불러오지 못했습니다.";
            }

            if (typeof showAdminFeedback === "function") {
                showAdminFeedback(
                    error.message
                    || "관리 이력을 불러오지 못했습니다."
                );
            }
        }
    }

    /*
     * 다른 관리자 JS에서도 작업 성공 후 이력을 갱신할 수 있도록 공개한다.
     */
    window.refreshAdminHistory = refreshAdminHistory;
    window.addEventListener("admin-job-type-changed", refreshAdminHistory);

    /*
     * 계정 생성, 병동 변경, 비밀번호 초기화 팝업을 닫으면
     * 방금 저장된 감사 로그를 다시 조회한다.
     */
    [
        "#admin-action-dialog",
        "#admin-create-complete-dialog",
        "#admin-password-reset-dialog",
        "#admin-deactivate-dialog"
    ].forEach(selector => {
        document.querySelector(selector)?.addEventListener(
            "close",
            () => refreshAdminHistory()
        );
    });

    // 화면을 처음 열었을 때 실제 감사 로그를 조회한다.
    refreshAdminHistory();
})();
