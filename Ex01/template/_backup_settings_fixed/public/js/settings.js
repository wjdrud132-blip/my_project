const serverUser = window.__FIDS_USER__ || {};
const role = serverUser.role || sessionStorage.getItem("role") || "manager";
const canEditThreshold = role === "operator";
const thresholdIds = ["dangerTemp", "warningTemp", "dangerSmoke", "warningSmoke"];
let originalProfileEmail = "";

function setSidebarUser(name, email) {
  document.getElementById("userName").textContent = name || (role === "operator" ? "운영자" : "관리자");
  document.getElementById("userEmail").textContent = email || "";
}

function setNowText() {
  const now = new Date();
  document.getElementById("nowText").textContent =
    now.getFullYear() + "." +
    String(now.getMonth() + 1).padStart(2, "0") + "." +
    String(now.getDate()).padStart(2, "0") + " " +
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0") + ":" +
    String(now.getSeconds()).padStart(2, "0");
}

function setServerCheckTime() {
  const target = document.getElementById("serverCheckTime");
  if (!target) return;
  const now = new Date();
  target.textContent =
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0") + ":" +
    String(now.getSeconds()).padStart(2, "0");
}

function toggleSwitch(toggleId, labelId) {
  const toggle = document.getElementById(toggleId);
  const label = document.getElementById(labelId);
  if (!toggle || !label) return;
  toggle.classList.toggle("on");
  label.textContent = toggle.classList.contains("on") ? "활성" : "비활성";
}

function applyPermission() {
  document.querySelectorAll(".operator-menu").forEach((item) => {
    item.style.display = canEditThreshold ? "flex" : "none";
  });
  document.querySelectorAll(".operator-only").forEach((item) => {
    item.style.display = canEditThreshold ? "flex" : "none";
  });
  thresholdIds.forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.disabled = !canEditThreshold;
  });

  const badge = document.getElementById("roleBadge");
  const box = document.getElementById("permissionBox");
  const text = document.getElementById("permissionText");
  const actions = document.getElementById("operatorActions");
  if (!badge || !box || !text || !actions) return;

  if (canEditThreshold) {
    badge.className = "badge operator";
    badge.innerHTML = '<i class="ti ti-shield-check"></i>운영자 변경 가능';
    box.classList.remove("readonly-note");
    text.textContent = "운영자 계정은 화재 감지 임계값을 변경하거나 기본값으로 초기화할 수 있습니다.";
    actions.style.display = "flex";
  } else {
    badge.className = "badge lock";
    badge.innerHTML = '<i class="ti ti-lock"></i>읽기 전용';
    box.classList.add("readonly-note");
    text.textContent = "일반 관리자 계정은 운영자가 정한 임계값만 확인할 수 있습니다. 변경과 초기화는 운영자만 가능합니다.";
    actions.style.display = "none";
  }
}

function fillThresholds(data) {
  if (!data) return;
  document.getElementById("dangerTemp").value = data.dangerTemp ?? "";
  document.getElementById("warningTemp").value = data.warningTemp ?? "";
  document.getElementById("dangerSmoke").value = data.dangerSmoke ?? "";
  document.getElementById("warningSmoke").value = data.warningSmoke ?? "";
}

async function loadThresholds() {
  const res = await fetch("/settings/api/thresholds");
  const result = await res.json();
  if (!result.success) return alert(result.message || "임계값을 불러오지 못했습니다.");
  fillThresholds(result.thresholds);
}

async function saveThresholds() {
  if (!canEditThreshold) return alert("운영자만 변경할 수 있습니다.");
  const body = Object.fromEntries(thresholdIds.map((id) => [id, document.getElementById(id).value]));
  const res = await fetch("/settings/api/thresholds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  alert(result.message || (result.success ? "저장되었습니다." : "저장에 실패했습니다."));
  if (result.success) fillThresholds(result.thresholds);
}

async function resetThresholds() {
  if (!canEditThreshold) return alert("운영자만 초기화할 수 있습니다.");
  if (!confirm("화재 감지 임계값을 기본값으로 초기화할까요?")) return;
  const res = await fetch("/settings/api/thresholds/reset", { method: "POST" });
  const result = await res.json();
  alert(result.message || (result.success ? "초기화되었습니다." : "초기화에 실패했습니다."));
  if (result.success) fillThresholds(result.thresholds);
}

function setSelectValue(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const option = Array.from(el.options).find((item) => item.value === value || item.textContent === value);
  if (option) el.value = option.value;
}

function setToggleValue(toggleId, labelId, enabled) {
  const toggle = document.getElementById(toggleId);
  const label = document.getElementById(labelId);
  if (!toggle || !label) return;
  toggle.classList.toggle("on", enabled);
  label.textContent = enabled ? "활성" : "비활성";
}

function isToggleOn(id) {
  const el = document.getElementById(id);
  return el && el.classList.contains("on") ? "Y" : "N";
}

function applySystemSettings(settings) {
  if (!settings) return;
  setSelectValue("dataInterval", settings.dataInterval);
  setSelectValue("reconnectDelay", settings.reconnectDelay);
  setSelectValue("retryCount", settings.retryCount);
  setToggleValue("offlineAlertToggle", "offlineAlertLabel", settings.offlineAlert === "Y");
  setSelectValue("exportRange", settings.exportRange);
}

async function loadSystemSettings() {
  const res = await fetch("/settings/api/system");
  const result = await res.json();
  if (!result.success) return alert(result.message || "설정을 불러오지 못했습니다.");
  applySystemSettings(result.settings);
}

async function saveDataSettings() {
  const body = {
    exportRange: document.getElementById("exportRange")?.value || "전체",
  };
  const res = await fetch("/settings/api/system/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  alert(result.message || (result.success ? "저장되었습니다." : "저장에 실패했습니다."));
  if (result.success) applySystemSettings(result.settings);
}

function openExportFormatModal() {
  document.getElementById("exportFormatOverlay").classList.add("open");
}

function closeExportFormatModal() {
  document.getElementById("exportFormatOverlay").classList.remove("open");
}

function downloadFile(filename, type, content) {
  const blob = new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function csvEscape(value) {
  return '"' + String(value ?? "").replace(/"/g, '""') + '"';
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return date.toLocaleString("ko-KR", { hour12: false });
}

async function collectExportRows() {
  const labels = {
    trashbin: "\uC4F0\uB808\uAE30\uD1B5",
    alert: "\uC54C\uB9BC",
    registeredTrashbin: "\uB4F1\uB85D \uC4F0\uB808\uAE30\uD1B5"
  };
  const rangeValue = document.getElementById("exportRange")?.value || "all";
  const [trashRes, alertRes] = await Promise.all([
    fetch("/trashbins/list"),
    fetch("/alerts/list"),
  ]);
  const trashbins = await trashRes.json();
  const alerts = await alertRes.json();
  const trashRows = Array.isArray(trashbins) ? trashbins.map((item) => ({
    type: labels.trashbin,
    id: "#" + String(item.bin_id).padStart(2, "0"),
    location: item.bin_loc || "-",
    content: labels.registeredTrashbin,
    status: item.alert_type || "-",
    date: formatDateTime(item.installed_at),
  })) : [];
  const alertRows = Array.isArray(alerts) ? alerts.map((item) => ({
    type: labels.alert,
    id: "#" + String(item.bin_id).padStart(2, "0"),
    location: item.bin_loc || "-",
    content: item.alert_msg || item.alert_type || "-",
    status: item.alert_type || "-",
    date: formatDateTime(item.alerted_at),
  })) : [];

  if (rangeValue === "trashbin") return trashRows;
  if (rangeValue === "alert") return alertRows;

  // Avoid duplicate sensor rows when exporting all data.
  return alertRows.length ? alertRows : trashRows;
}

async function exportData(format) {
  const rows = await collectExportRows();
  const lines = [["구분", "ID", "위치", "내용", "상태", "시간"], ...rows.map((row) => [row.type, row.id, row.location, row.content, row.status, row.date])];

  if (format === "pdf") {
    const summary = rows.reduce((acc, row) => {
      const status = String(row.status || "").toLowerCase();
      acc.total += 1;
      if (status === "danger") acc.danger += 1;
      else if (status === "warning") acc.warning += 1;
      else acc.normal += 1;
      return acc;
    }, { total: 0, danger: 0, warning: 0, normal: 0 });

    const ko = {
      danger: "\uC704\uD5D8",
      warning: "\uC8FC\uC758",
      normal: "\uC815\uC0C1",
      title: "\uB370\uC774\uD130 \uB0B4\uBCF4\uB0B4\uAE30",
      desc: "\uC124\uC815 \uD654\uBA74\uC5D0\uC11C \uC120\uD0DD\uD55C \uBC94\uC704\uC758 \uB370\uC774\uD130\uB97C \uB300\uC2DC\uBCF4\uB4DC \uD615\uC2DD\uC73C\uB85C \uC815\uB9AC\uD588\uC2B5\uB2C8\uB2E4.",
      printedAt: "\uCD9C\uB825 \uC2DC\uAC01",
      totalData: "\uC804\uCCB4 \uB370\uC774\uD130",
      trashData: "\uC4F0\uB808\uAE30\uD1B5 \uB370\uC774\uD130",
      alertData: "\uC54C\uB9BC \uB370\uC774\uD130",
      countSuffix: "\uAC74",
      category: "\uAD6C\uBD84",
      location: "\uC704\uCE58",
      content: "\uB0B4\uC6A9",
      status: "\uC0C1\uD0DC",
      time: "\uC2DC\uAC04",
      empty: "\uB0B4\uBCF4\uB0BC \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."
    };

    const statusLabel = (value) => {
      const status = String(value || "").toLowerCase();
      if (status === "danger") return ko.danger;
      if (status === "warning") return ko.warning;
      if (status === "normal") return ko.normal;
      return value || "-";
    };

    const rangeLabelMap = {
      all: ko.totalData,
      trashbin: ko.trashData,
      alert: ko.alertData
    };
    const rangeValue = document.getElementById("exportRange")?.value || "all";
    const rangeLabel = rangeLabelMap[rangeValue] || ko.totalData;
    const printedAt = new Date().toLocaleString("ko-KR", { hour12: false });

    const bodyRows = rows.map((row) => {
      const status = String(row.status || "").toLowerCase();
      return "<tr class='row-" + escapeHtml(status) + "'>" +
        "<td>" + escapeHtml(row.type) + "</td>" +
        "<td><strong>" + escapeHtml(row.id) + "</strong></td>" +
        "<td>" + escapeHtml(row.location) + "</td>" +
        "<td>" + escapeHtml(row.content) + "</td>" +
        "<td><span class='status-badge " + escapeHtml(status) + "'>" + escapeHtml(statusLabel(status)) + "</span></td>" +
        "<td>" + escapeHtml(row.date) + "</td>" +
      "</tr>";
    }).join("");

    const html = "<!DOCTYPE html><html lang='ko'><head><meta charset='utf-8'>" +
      "<title>FIDS " + ko.title + "</title>" +
      "<style>" +
      "*{box-sizing:border-box}body{margin:0;background:#f3f6fb;color:#101828;font-family:'Malgun Gothic','Apple SD Gothic Neo',Arial,sans-serif;}" +
      ".export-page{padding:28px;max-width:1320px;margin:0 auto;}" +
      ".hero{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:20px;}" +
      ".brand{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#2563eb;margin-bottom:8px;}" +
      ".brand:before{content:'';width:4px;height:18px;border-radius:999px;background:#2563eb;display:inline-block;}" +
      "h1{margin:0 0 8px;font-size:24px;letter-spacing:0;color:#0f172a;font-weight:800;}p{margin:0;color:#667085;font-size:13px;line-height:1.6;}" +
      ".printed{min-width:220px;text-align:right;color:#667085;font-size:12px;line-height:1.6;}.printed strong{font-size:14px;color:#0f172a;}" +
      ".stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:20px 0;}" +
      ".stat-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:18px 20px;box-shadow:0 8px 24px rgba(15,23,42,.05);}" +
      ".stat-label{font-size:12px;font-weight:800;color:#64748b;margin-bottom:8px;}.stat-value{font-size:26px;font-weight:900;color:#0f172a;}.stat-value.danger{color:#ef4444}.stat-value.warning{color:#d97706}.stat-value.normal{color:#16a34a}" +
      ".table-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(15,23,42,.06);}" +
      ".table-title{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #e5e7eb;}" +
      ".table-title h2{margin:0;font-size:16px;color:#0f172a;font-weight:800;}.table-title span{font-size:12px;color:#64748b;}" +
      "table{width:100%;border-collapse:collapse;font-size:12px;}th{background:#f8fafc;color:#94a3b8;text-align:left;font-weight:800;padding:13px 16px;border-bottom:1px solid #e5e7eb;}" +
      "td{padding:14px 16px;border-bottom:1px solid #eef2f7;color:#111827;vertical-align:middle;}tr.row-danger{background:#fff5f5;}tr.row-danger td{color:#ef4444;font-weight:700;}tr.row-warning{background:#fffbeb;}tr.row-warning td{color:#d97706;}tr.row-normal td{color:#111827;}" +
      ".status-badge{display:inline-flex;align-items:center;justify-content:center;min-width:54px;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:800;}" +
      ".status-badge.danger{background:#fee2e2;color:#ef4444}.status-badge.warning{background:#fef3c7;color:#d97706}.status-badge.normal{background:#dcfce7;color:#16a34a}" +
      ".empty{padding:46px;text-align:center;color:#94a3b8;}" +
      "@media print{body{background:#fff}.export-page{padding:12px}.stat-card,.table-card{box-shadow:none}tr{break-inside:avoid;page-break-inside:avoid}}" +
      "</style></head><body><main class='export-page'>" +
      "<section class='hero'><div><span class='brand'>FIDS</span><h1>" + ko.title + "</h1><p>" + ko.desc + "</p></div>" +
      "<div class='printed'>" + ko.printedAt + "<br><strong>" + escapeHtml(printedAt) + "</strong></div></section>" +
      "<section class='stats'>" +
      "<div class='stat-card'><div class='stat-label'>" + ko.totalData + "</div><div class='stat-value'>" + summary.total + "</div></div>" +
      "<div class='stat-card'><div class='stat-label'>" + ko.danger + "</div><div class='stat-value danger'>" + summary.danger + "</div></div>" +
      "<div class='stat-card'><div class='stat-label'>" + ko.warning + "</div><div class='stat-value warning'>" + summary.warning + "</div></div>" +
      "<div class='stat-card'><div class='stat-label'>" + ko.normal + "</div><div class='stat-value normal'>" + summary.normal + "</div></div>" +
      "</section><section class='table-card'><div class='table-title'><h2>" + escapeHtml(rangeLabel) + "</h2><span>" + ko.totalData + " " + summary.total + ko.countSuffix + "</span></div>" +
      "<table><thead><tr><th>" + ko.category + "</th><th>ID</th><th>" + ko.location + "</th><th>" + ko.content + "</th><th>" + ko.status + "</th><th>" + ko.time + "</th></tr></thead><tbody>" +
      (bodyRows || "<tr><td class='empty' colspan='6'>" + ko.empty + "</td></tr>") +
      "</tbody></table></section></main></body></html>";

    const popup = window.open("", "_blank");
    popup.document.open("text/html", "replace");
    popup.document.write(html);
    popup.document.close();
    popup.focus();
    setTimeout(() => popup.print(), 250);
    closeExportFormatModal();
    return;
  }

  if (format === "excel") {
    const table = "<table>" + lines.map((line) => "<tr>" + line.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>").join("") + "</table>";
    downloadFile("fids_data_export.xls", "application/vnd.ms-excel;charset=utf-8", "\ufeff" + table);
  } else {
    const csv = "\ufeff" + lines.map((line) => line.map(csvEscape).join(",")).join("\n");
    downloadFile("fids_data_export.csv", "text/csv;charset=utf-8", csv);
  }
  closeExportFormatModal();
}

async function openTrashModal() {
  document.getElementById("trashModalOverlay").classList.add("open");
  await loadTrashList();
}

function closeTrashModal() {
  document.getElementById("trashModalOverlay").classList.remove("open");
}

async function loadTrashList() {
  const list = document.getElementById("trashList");
  list.innerHTML = '<div class="trash-empty">휴지통을 불러오는 중입니다.</div>';
  try {
    const res = await fetch("/trashbins/trash/list");
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      list.innerHTML = '<div class="trash-empty">휴지통이 비어 있습니다.</div>';
      return;
    }
    list.innerHTML = rows.map((row) =>
      '<div class="trash-row">' +
        '<strong>#' + String(row.bin_id).padStart(2, "0") + '</strong>' +
        '<div>' + (row.bin_loc || "-") + '<span>관리자: ' + (row.mgr_name || "-") + '</span></div>' +
        '<div>' + formatDateTime(row.installed_at) + '</div>' +
        '<button class="btn red" type="button" onclick="deleteTrashPermanently(' + row.bin_id + ')">삭제</button>' +
      '</div>'
    ).join("");
  } catch (error) {
    list.innerHTML = '<div class="trash-empty">휴지통을 불러오지 못했습니다.</div>';
  }
}

async function restoreTrashbin(binId) {
  if (!confirm("??? ????? ?? ???? ??????")) return;
  const res = await fetch("/trashbins/trash/" + binId + "/restore", { method: "PATCH" });
  const result = await res.json();
  alert(result.message || (res.ok ? "???????." : "??? ??????."));
  await loadTrashList();
}

async function deleteTrashPermanently(binId) {
  if (!confirm("휴지통에서도 삭제하면 DB에서 완전히 삭제됩니다. 계속할까요?")) return;
  const res = await fetch("/trashbins/trash/" + binId, { method: "DELETE" });
  const result = await res.json();
  alert(result.message || (res.ok ? "완전히 삭제되었습니다." : "삭제에 실패했습니다."));
  await loadTrashList();
}

function resetDataWithOptions() {
  if (!canEditThreshold) return alert("운영자만 초기화할 수 있습니다.");
  const excludes = [];
  if (document.getElementById("excludeDanger")?.checked) excludes.push("위험");
  if (document.getElementById("excludeWarning")?.checked) excludes.push("주의");
  if (document.getElementById("excludeNormal")?.checked) excludes.push("정상");
  alert("초기화 선택사항: " + (excludes.length ? excludes.join(", ") + " 제외" : "제외 없음") + "\n실제 초기화 API는 다음 단계에서 연결하면 됩니다.");
}

async function loadProfile() {
  const res = await fetch("/settings/api/profile");
  const result = await res.json();
  if (!result.success) return alert(result.message || "계정 정보를 불러오지 못했습니다.");
  const profile = result.profile;
  originalProfileEmail = profile.mgr_email || "";
  document.getElementById("profileName").value = profile.mgr_name || "";
  document.getElementById("profileOrg").value = profile.mgr_org || sessionStorage.getItem("mgr_org") || sessionStorage.getItem("organization") || "소속 기관 미등록";
  document.getElementById("profileEmail").value = profile.mgr_email || "";
  document.getElementById("profilePhone").value = profile.mgr_phone || "";
  document.getElementById("accountRole").value = profile.role === "operator" ? "운영자" : "일반 관리자";
  document.getElementById("approvalStatus").value = Number(profile.is_approved) === 1 ? "승인 완료" : "승인 대기";
}

async function saveProfile() {
  const nextEmail = document.getElementById("profileEmail").value.trim();
  if (role !== "operator" && originalProfileEmail && originalProfileEmail !== nextEmail) {
    if (!confirm("이메일을 변경하면 다시 관리자 승인이 필요합니다. 계속할까요?")) return;
  }
  const body = {
    mgr_name: document.getElementById("profileName").value,
    mgr_org: document.getElementById("profileOrg").value,
    mgr_email: nextEmail,
    mgr_phone: document.getElementById("profilePhone").value,
  };
  const res = await fetch("/settings/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  alert(result.message || (result.success ? "저장되었습니다." : "저장에 실패했습니다."));
  if (!result.success) return;
  if (result.requiresApproval) {
    sessionStorage.clear();
    location.href = "/pending";
    return;
  }
  loadProfile();
}

function activateNav(id) {
  document.querySelectorAll(".set-nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.target === id);
  });
}

function goTo(id) {
  const sc = document.getElementById("setContent");
  const el = document.getElementById(id);
  if (!sc || !el) return;
  sc.scrollTop = el.offsetTop - 16;
  activateNav(id);
}

function syncActiveNavByScroll() {
  const sc = document.getElementById("setContent");
  const sections = ["section-threshold", "section-data", "section-account"];
  let current = sections[0];
  sections.forEach((id) => {
    const el = document.getElementById(id);
    if (el && el.offsetTop <= sc.scrollTop + sc.clientHeight * 0.35) current = id;
  });
  if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 8) current = sections[sections.length - 1];
  activateNav(current);
}

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/manager/logout", { method: "POST" });
  sessionStorage.clear();
  alert("로그아웃되었습니다.");
  location.replace("/");
});
document.getElementById("setContent").addEventListener("scroll", syncActiveNavByScroll);

let topbarAlerts = [];
const topbarAlertButton = document.getElementById("topbarAlertButton");
const topbarAlertDot = document.getElementById("topbarAlertDot");
const topbarAlertDropdown = document.getElementById("topbarAlertDropdown");
const topbarAlertList = document.getElementById("topbarAlertList");
const topbarReadAllBtn = document.getElementById("topbarReadAllBtn");
const topbarOpenAllAlertsBtn = document.getElementById("topbarOpenAllAlertsBtn");
const topbarAllAlertOverlay = document.getElementById("topbarAllAlertOverlay");
const topbarAllAlertList = document.getElementById("topbarAllAlertList");
const topbarCloseAllAlertsBtn = document.getElementById("topbarCloseAllAlertsBtn");

function topbarAlertTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function renderTopbarAlerts() {
  const dangerAlerts = topbarAlerts.filter((item) => item.alert_type === "danger");
  const unreadDanger = dangerAlerts.some((item) => item.is_received !== "Y");
  if (topbarAlertDot) topbarAlertDot.classList.toggle("hide", !unreadDanger);
  if (!topbarAlertList || !topbarAllAlertList) return;
  if (!dangerAlerts.length) {
    topbarAlertList.innerHTML = '<div class="alert-empty">위험 알림이 없습니다.</div>';
    topbarAllAlertList.innerHTML = '<div class="alert-empty">위험 알림이 없습니다.</div>';
    return;
  }
  topbarAlertList.innerHTML = dangerAlerts.slice(0, 5).map((item) =>
    '<div class="alert-item danger ' + (item.is_received === "Y" ? "read" : "") + '">' +
      '<div class="alert-icon"><i class="ti ti-flame"></i></div>' +
      '<div class="alert-text"><strong>위험 감지</strong><span>#' + item.bin_id + ' ' + (item.bin_loc || "") + '</span><small>' + (item.alert_msg || "화재 위험 감지") + '</small></div>' +
      '<span class="alert-time">' + topbarAlertTime(item.alerted_at) + '</span>' +
    '</div>'
  ).join("");
  topbarAllAlertList.innerHTML = dangerAlerts.map((item) =>
    '<div class="all-alert-row danger ' + (item.is_received === "Y" ? "read" : "") + '">' +
      '<div><strong>위험 감지</strong><span>#' + item.bin_id + ' ' + (item.bin_loc || "") + '</span></div>' +
      '<p>' + (item.alert_msg || "화재 위험 감지") + '</p>' +
      '<time>' + topbarAlertTime(item.alerted_at) + '</time>' +
    '</div>'
  ).join("");
}

async function loadTopbarAlerts() {
  try {
    const response = await fetch("/alerts/list");
    topbarAlerts = fidsApplyAlertReadState(await response.json());
    if (!Array.isArray(topbarAlerts)) topbarAlerts = [];
  } catch (error) {
    topbarAlerts = [];
  }
  renderTopbarAlerts();
}

if (topbarAlertButton) {
  topbarAlertButton.addEventListener("click", (event) => {
    event.stopPropagation();
    topbarAlertDropdown.classList.toggle("open");
  });
  topbarReadAllBtn.addEventListener("click", async () => {
    fidsMarkAlertsRead();
    await fetch("/alerts/read-all", { method: "POST" });
    await loadTopbarAlerts();
  });
  topbarOpenAllAlertsBtn.addEventListener("click", () => {
    topbarAlertDropdown.classList.remove("open");
    topbarAllAlertOverlay.classList.add("open");
  });
  topbarCloseAllAlertsBtn.addEventListener("click", () => topbarAllAlertOverlay.classList.remove("open"));
  topbarAllAlertOverlay.addEventListener("click", (event) => {
    if (event.target === topbarAllAlertOverlay) topbarAllAlertOverlay.classList.remove("open");
  });
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".alert-area")) topbarAlertDropdown.classList.remove("open");
  });
  loadTopbarAlerts();
}

setNowText();
setServerCheckTime();
setInterval(setNowText, 1000);
applyPermission();
loadThresholds();
loadSystemSettings();
loadProfile();
