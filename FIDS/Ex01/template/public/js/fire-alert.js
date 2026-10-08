const LIVE_ALERT_STATUS_KEY = "fidsLiveAlertStatusByBin";
const FIRE_ALERT_POLL_MS = 3000;

function loadAlertStatusByBin() {
  try {
    return JSON.parse(sessionStorage.getItem(LIVE_ALERT_STATUS_KEY) || "{}");
  } catch (error) {
    return {};
  }
}

function saveAlertStatusByBin(statusByBin) {
  sessionStorage.setItem(LIVE_ALERT_STATUS_KEY, JSON.stringify(statusByBin));
}

function liveAlertStatusOf(bin) {
  if (String(bin.sensor_online || "") !== "Y") return "normal";
  if (Number(bin.network_status) === 0) return "normal";

  const type = String(bin.alert_type || "");
  if (type === "danger" || type === "warning") return type;
  return "normal";
}

function isLiveAlertBin(bin) {
  const status = liveAlertStatusOf(bin);
  return status === "danger" || status === "warning";
}

function toLiveAlert(bin) {
  const status = liveAlertStatusOf(bin);

  return {
    bin_id: bin.bin_id,
    type: status,
    location: bin.bin_loc || bin.location || "-",
    alerted_at: bin.sensor_created_at || bin.alerted_at || new Date().toISOString(),
    temp_value: bin.temp_value,
    smoke_value: bin.smoke_value,
    flame_value: bin.flame_value,
    alert_msg: bin.alert_msg || "",
  };
}

function sortAlertByLatest(a, b) {
  const aTime = new Date(a.sensor_created_at || a.alerted_at || 0).getTime();
  const bTime = new Date(b.sensor_created_at || b.alerted_at || 0).getTime();

  if (bTime !== aTime) return bTime - aTime;
  return Number(a.bin_id || 0) - Number(b.bin_id || 0);
}

async function checkDangerAlert() {
  try {
    if (document.querySelector(".fire-alert-overlay")) {
      return;
    }

    const response = await fetch("/trashbins/list", { cache: "no-store" });
    const rows = await response.json();
    const bins = Array.isArray(rows) ? rows : [];
    const previousStatusByBin = loadAlertStatusByBin();
    const nextStatusByBin = { ...previousStatusByBin };

    bins.forEach((bin) => {
      if (bin && bin.bin_id !== undefined && bin.bin_id !== null) {
        nextStatusByBin[String(bin.bin_id)] = liveAlertStatusOf(bin);
      }
    });

    const alertRows = bins.filter(isLiveAlertBin).sort(sortAlertByLatest);
    const newAlert = alertRows.find((bin) => {
      const binId = String(bin.bin_id);
      const currentStatus = liveAlertStatusOf(bin);
      return previousStatusByBin[binId] !== currentStatus;
    });

    saveAlertStatusByBin(nextStatusByBin);

    if (!newAlert) {
      return;
    }

    showDangerModal(toLiveAlert(newAlert));
  } catch (error) {
    console.error("실시간 알림 상태 확인 실패:", error);
  }
}

function parseAlertValue(alert, key) {
  if (key === "temp" && alert.temp_value !== undefined && alert.temp_value !== null && alert.temp_value !== "") {
    return alert.temp_value + "\u00B0C";
  }

  if (key === "smoke" && alert.smoke_value !== undefined && alert.smoke_value !== null && alert.smoke_value !== "") {
    return String(alert.smoke_value);
  }

  const msg = String(alert.alert_msg || "");

  if (key === "temp") {
    const match = msg.match(/온도\s*([0-9.]+)/);
    return match ? match[1] + "\u00B0C" : "-";
  }

  if (key === "smoke") {
    const match = msg.match(/연기\s*감지값\s*(\d+(?:\.\d+)?)/);
    return match ? match[1] : "-";
  }

  return "-";
}

function alertMeta(type) {
  if (type === "warning") {
    return {
      className: "warning",
      icon: "ti-alert-triangle",
      badge: "주의 감지",
      title: "주의 상태가 감지되었습니다",
      smokeSuffix: "",
    };
  }

  return {
    className: "danger",
    icon: "ti-flame",
    badge: "위험 감지",
    title: "화재 위험이 감지되었습니다",
    smokeSuffix: " (위험)",
  };
}

function showDangerModal(alert) {
  if (document.querySelector(".fire-alert-overlay")) {
    return;
  }

  const meta = alertMeta(alert.type);
  const overlay = document.createElement("div");
  overlay.className = `fire-alert-overlay ${meta.className}`;

  overlay.innerHTML = `
    <div class="fire-alert-modal">
      <div class="fire-alert-top">
        <div class="fire-icon"><i class="ti ${meta.icon}"></i></div>
        <div>
          <div class="fire-badge"><span></span> ${meta.badge}</div>
          <h2>${meta.title}</h2>
        </div>
      </div>

      <div class="fire-alert-body">
        <div class="fire-info-grid">
          <div class="fire-info-box">
            <span>위치</span>
            <strong>${alert.location || "-"}</strong>
          </div>
          <div class="fire-info-box">
            <span>감지 시각</span>
            <strong>${formatTime(alert.alerted_at)}</strong>
          </div>
          <div class="fire-info-box">
            <span>내부 온도</span>
            <strong class="danger-text">${parseAlertValue(alert, "temp")}</strong>
          </div>
          <div class="fire-info-box">
            <span>연기 감지값</span>
            <strong class="danger-text">${parseAlertValue(alert, "smoke")}${meta.smokeSuffix}</strong>
          </div>
        </div>

        <div class="fire-alert-date">
          ${formatDate(alert.alerted_at)} 기준
        </div>

        <div class="fire-alert-actions">
          <button type="button" class="fire-move-btn">해당 위치로 이동</button>
          <button type="button" class="fire-close-btn">닫기</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector(".fire-close-btn").addEventListener("click", () => {
    overlay.remove();
  });

  overlay.querySelector(".fire-move-btn").addEventListener("click", () => {
    overlay.remove();
    location.href = "/realtime?bin_id=" + encodeURIComponent(alert.bin_id);
  });
}

function formatTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDate(value) {
  if (!value) return "현재";

  const date = new Date(value);
  return date.toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

checkDangerAlert();
setInterval(checkDangerAlert, FIRE_ALERT_POLL_MS);
