const serverUser = window.__FIDS_USER__ || {};
const role = serverUser.role || sessionStorage.getItem("role") || "manager";
const canEditThreshold = role === "operator";
const thresholdIds = ["dangerTemp", "warningTemp", "dangerSmoke", "warningSmoke"];
let originalProfileEmail = "";

function formatAssignedRegions(value) {
  const regions = String(value || "")
    .split(",")
    .map((region) => region.trim())
    .filter(Boolean);
  return regions.length ? regions.join(", ") : "\uB2F4\uB2F9 \uB3D9 \uBBF8\uBC30\uC815";
}

function setSidebarUser(name, email) {
  const displayName =
    name ||
    serverUser.mgr_name ||
    serverUser.name ||
    (role === "operator" ? "운영자" : "관리자");
  const displayEmail =
    email ||
    serverUser.mgr_email ||
    serverUser.email ||
    "";

  const nameEl = document.getElementById("userName");
  const emailEl = document.getElementById("userEmail");
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = displayEmail;
}

function setNowText() {
  const now = new Date();
  const week = ["일", "월", "화", "수", "목", "금", "토"][now.getDay()];
  document.getElementById("nowText").textContent =
    now.getFullYear() + "." +
    String(now.getMonth() + 1).padStart(2, "0") + "." +
    String(now.getDate()).padStart(2, "0") + " (" + week + ") " +
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
  lockThresholdInputs();

  const aiControl = document.getElementById("aiJudgeControl");
  const aiReadonly = document.getElementById("aiJudgeReadonly");
  if (aiControl) aiControl.style.display = "none";
  if (aiReadonly) aiReadonly.style.display = "none";

  const badge = document.getElementById("roleBadge");
  const box = document.getElementById("permissionBox");
  const text = document.getElementById("permissionText");
  const actions = document.getElementById("operatorActions");

  if (badge) {
    badge.className = "badge lock";
    badge.innerHTML = '<i class="ti ti-lock"></i>읽기 전용';
  }
  if (box) box.classList.add("readonly-note");
  if (text) text.textContent = "AI 위험 판단은 항상 활성화되어 있으며, 임계값은 조회만 가능합니다.";
  if (actions) actions.style.display = "none";
}
function lockThresholdInputs() {
  thresholdIds.forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.disabled = true;
    input.readOnly = true;
    input.setAttribute("disabled", "disabled");
  });
}

function fillThresholds(data) {
  if (!data) return;
  document.getElementById("dangerTemp").value = data.dangerTemp ?? "";
  document.getElementById("warningTemp").value = data.warningTemp ?? "";
  document.getElementById("dangerSmoke").value = data.dangerSmoke ?? "";
  document.getElementById("warningSmoke").value = data.warningSmoke ?? "";
  lockThresholdInputs();
}

async function loadThresholds() {
  const res = await fetch("/settings/api/thresholds");
  const result = await res.json();
  if (!result.success) return alert(result.message || "계정 정보를 불러오지 못했습니다.");
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

  if (!result.success) {
    return alert(result.message || "저장에 실패했습니다.");
  }

  const systemRes = await fetch("/settings/api/system/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      exportRange: document.getElementById("exportRange")?.value || "전체",
      aiJudge: "Y",
    }),
  });
  const systemResult = await systemRes.json();

  fillThresholds(result.thresholds);
  if (systemResult.success) applySystemSettings(systemResult.settings);
  alert(systemResult.success ? "설정이 저장되었습니다." : (systemResult.message || "AI 설정 저장에 실패했습니다."));
}
async function resetThresholds() {
  if (!canEditThreshold) return alert("\uC6B4\uC601\uC790\uB9CC \uCD08\uAE30\uD654\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  if (!confirm("\uD654\uC7AC \uAC10\uC9C0 \uC784\uACC4\uAC12\uC744 \uAE30\uBCF8\uAC12\uC73C\uB85C \uCD08\uAE30\uD654\uD560\uAE4C\uC694?")) return;
  const res = await fetch("/settings/api/thresholds/reset", { method: "POST" });
  const result = await res.json();
  alert(result.message || (result.success ? "\uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : "\uCD08\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
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

  const readonlyLabel = document.getElementById(toggleId + "ReadonlyLabel");
  if (readonlyLabel) {
    readonlyLabel.textContent = enabled ? "활성" : "비활성";
    readonlyLabel.className = enabled ? "badge ok" : "badge";
  }
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
  setToggleValue("aiJudgeToggle", "aiJudgeLabel", settings.aiJudge !== "N");
}

async function loadSystemSettings() {
  const res = await fetch("/settings/api/system");
  const result = await res.json();
  if (!result.success) return alert(result.message || "계정 정보를 불러오지 못했습니다.");
  applySystemSettings(result.settings);
}

async function saveDataSettings() {
  const body = {
    exportRange: document.getElementById("exportRange")?.value || "전체",
    aiJudge: "Y",
  };
  const res = await fetch("/settings/api/system/data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  alert(result.message || (result.success ? "설정이 저장되었습니다." : "설정 저장에 실패했습니다."));
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
  const lines = [["\uAD6C\uBD84", "ID", "\uC704\uCE58", "\uB0B4\uC6A9", "\uC0C1\uD0DC", "\uC2DC\uAC04"], ...rows.map((row) => [row.type, row.id, row.location, row.content, row.status, row.date])];

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
  list.innerHTML = '<div class="trash-empty">\uD734\uC9C0\uD1B5\uC744 \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.</div>';
  try {
    const res = await fetch("/trashbins/trash/list");
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      list.innerHTML = '<div class="trash-empty">\uD734\uC9C0\uD1B5\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.</div>';
      return;
    }
    list.innerHTML = rows.map((row) =>
      '<div class="trash-row">' +
        '<strong>#' + String(row.bin_id).padStart(2, "0") + '</strong>' +
        '<div>' + (row.bin_loc || "-") + '<span>\uAD00\uB9AC\uC790: ' + (row.mgr_name || "-") + '</span></div>' +
        '<div>' + formatDateTime(row.installed_at) + '</div>' +
        '<div class="trash-actions">' +
          '<button class="btn" type="button" onclick="restoreTrashbin(' + row.bin_id + ')">\uBCF5\uAD6C</button>' +
          '<button class="btn red" type="button" onclick="deleteTrashPermanently(' + row.bin_id + ')">\uC0AD\uC81C</button>' +
        '</div>' +
      '</div>'
    ).join("");
  } catch (error) {
    list.innerHTML = '<div class="trash-empty">\uD734\uC9C0\uD1B5\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</div>';
  }
}

async function restoreTrashbin(binId) {
  if (!confirm("\uC120\uD0DD\uD55C \uC4F0\uB808\uAE30\uD1B5\uC744 \uB2E4\uC2DC \uBAA9\uB85D\uC73C\uB85C \uBCF5\uAD6C\uD560\uAE4C\uC694?")) return;
  const res = await fetch("/trashbins/trash/" + binId + "/restore", { method: "PATCH" });
  const result = await res.json();
  alert(res.ok ? "\uC4F0\uB808\uAE30\uD1B5\uC774 \uBCF5\uAD6C\uB418\uC5C8\uC2B5\uB2C8\uB2E4." : (result.message || "\uBCF5\uAD6C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."));
  await loadTrashList();
}

async function deleteTrashPermanently(binId) {
  if (!confirm("삭제하면 쓰레기통이 완전히 삭제됩니다. 계속할까요?")) return;
  const res = await fetch("/trashbins/trash/" + binId, { method: "DELETE" });
  const result = await res.json();
  alert(result.message || (res.ok ? "쓰레기통이 완전히 삭제되었습니다." : "삭제에 실패했습니다."));
  await loadTrashList();
}

async function resetDataWithOptions() {
  if (!canEditThreshold) return alert("\uC6B4\uC601\uC790\uB9CC \uCD08\uAE30\uD654\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");

  const excludeTypes = [];
  const excludeLabels = [];
  if (document.getElementById("excludeDanger")?.checked) {
    excludeTypes.push("danger");
    excludeLabels.push("\uC704\uD5D8");
  }
  if (document.getElementById("excludeWarning")?.checked) {
    excludeTypes.push("warning");
    excludeLabels.push("\uC8FC\uC758");
  }
  if (document.getElementById("excludeNormal")?.checked) {
    excludeTypes.push("normal");
    excludeLabels.push("\uC815\uC0C1");
  }

  const excludeText = excludeLabels.length ? excludeLabels.join(", ") + " \uC81C\uC678" : "\uC81C\uC678 \uC5C6\uC74C";
  const ok = confirm(
    "\uB370\uC774\uD130 \uCD08\uAE30\uD654\uB294 \uC54C\uB9BC \uAE30\uB85D, \uC13C\uC11C \uB370\uC774\uD130, \uC4F0\uB808\uAE30\uD1B5 \uB4F1\uB85D \uB370\uC774\uD130\uB97C \uC0AD\uC81C\uD569\uB2C8\uB2E4.\n" +
    "\uACC4\uC815, \uAD8C\uD55C, \uC2DC\uC2A4\uD15C \uC124\uC815 \uB370\uC774\uD130\uB294 \uC720\uC9C0\uB429\uB2C8\uB2E4.\n\n" +
    "\uC120\uD0DD\uC0AC\uD56D: " + excludeText + "\n" +
    "\uACC4\uC18D\uD560\uAE4C\uC694?"
  );
  if (!ok) return;

  try {
    const res = await fetch("/settings/api/data/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excludeTypes }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      return alert(result.message || "\uB370\uC774\uD130 \uCD08\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
    }
    alert((result.message || "\uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4.") + "\n\uC0AD\uC81C\uB41C \uC54C\uB9BC: " + (result.deletedAlerts || 0) + "\uAC74" + "\n\uC0AD\uC81C\uB41C \uC13C\uC11C \uB370\uC774\uD130: " + (result.deletedSensors || 0) + "\uAC74" + "\n\uC0AD\uC81C\uB41C \uC4F0\uB808\uAE30\uD1B5: " + (result.deletedTrashbins || 0) + "\uAC74");
  } catch (error) {
    alert("\uB370\uC774\uD130 \uCD08\uAE30\uD654 \uC694\uCCAD\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.");
  }
}

async function loadProfile() {
  const res = await fetch("/settings/api/profile");
  const result = await res.json();
  if (!result.success) return alert(result.message || "계정 정보를 불러오지 못했습니다.");
  const profile = result.profile;
  originalProfileEmail = profile.mgr_email || "";
  document.getElementById("profileName").value = profile.mgr_name || "";
  document.getElementById("profileOrg").value = profile.role === "operator" ? "광주광역시 동구청" : (profile.mgr_org || sessionStorage.getItem("mgr_org") || sessionStorage.getItem("organization") || "소속 기관 미등록");
  document.getElementById("profileEmail").value = profile.mgr_email || "";
  document.getElementById("profilePhone").value = profile.mgr_phone || "";
  const assignedRegionsInput = document.getElementById("profileAssignedRegions");
  if (assignedRegionsInput) {
    assignedRegionsInput.value = profile.role === "operator" ? "\uC804\uCCB4 \uAD6C\uC5ED" : formatAssignedRegions(profile.assigned_regions);
  }
  document.getElementById("accountRole").value = profile.role === "operator" ? "운영자" : "일반 관리자";
  document.getElementById("approvalStatus").value = Number(profile.is_approved) === 1 ? "승인 완료" : "승인 대기";

  const sidebarName = document.getElementById("settingsSidebarName");
  const sidebarEmail = document.getElementById("settingsSidebarEmail");
  if (sidebarName) sidebarName.textContent = profile.mgr_name || (profile.role === "operator" ? "운영자" : "관리자");
  if (sidebarEmail) sidebarEmail.textContent = profile.mgr_email || "";
}
async function saveProfile() {
  const nameInput = document.getElementById("profileName");
  const phoneInput = document.getElementById("profilePhone");
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!name) {
    nameInput.focus();
    return alert("이름은 필수입니다.");
  }

  if (!phone) {
    phoneInput.focus();
    return alert("휴대전화 번호는 필수입니다.");
  }

  const body = {
    mgr_name: name,
    mgr_phone: phone,
  };
  const res = await fetch("/settings/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await res.json();
  alert(result.message || (result.success ? "계정 정보가 저장되었습니다." : "계정 정보 저장에 실패했습니다."));
  if (!result.success) return;
  loadProfile();
}

async function withdrawAccount() {
  if (!confirm("정말 계정을 탈퇴하시겠습니까?")) return;
  const confirmText = prompt("계정 탈퇴를 진행하려면 '탈퇴'를 입력해주세요.");
  if (confirmText !== "탈퇴") return alert("계정 탈퇴가 취소되었습니다.");

  const res = await fetch("/settings/api/profile", { method: "DELETE" });
  const result = await res.json();
  if (!result.success) return alert(result.message || "계정 정보를 불러오지 못했습니다.");

  alert("탈퇴되었습니다.");
  sessionStorage.clear();
  location.replace("/");
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

function topbarEscapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function topbarAlertTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function topbarAlertBinId(item) {
  return String(item.display_bin_id || item.bin_id || "").padStart(2, "0");
}

function topbarAlertMessage(item) {
  return item.alert_msg || "\uD654\uC7AC \uC704\uD5D8 \uAC10\uC9C0 - \uC989\uAC01 \uB300\uC751 \uD544\uC694";
}

function renderTopbarAlerts() {
  const dangerAlerts = topbarAlerts.filter((item) => item.alert_type === "danger");
  const unreadDanger = dangerAlerts.some((item) => item.is_received !== "Y");

  if (topbarAlertDot) topbarAlertDot.classList.toggle("hide", !unreadDanger);
  if (!topbarAlertList || !topbarAllAlertList) return;

  if (!dangerAlerts.length) {
    const empty = '<div class="alert-empty">\uD45C\uC2DC\uD560 \uC704\uD5D8 \uC54C\uB9BC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</div>';
    topbarAlertList.innerHTML = empty;
    topbarAllAlertList.innerHTML = empty;
    return;
  }

  topbarAlertList.innerHTML = dangerAlerts.slice(0, 5).map((item) => {
    const isRead = item.is_received === "Y";
    const binId = topbarEscapeHtml(topbarAlertBinId(item));
    const location = topbarEscapeHtml(item.bin_loc || "");
    const message = topbarEscapeHtml(topbarAlertMessage(item));
    const time = topbarAlertTime(item.alerted_at);
    return '<div class="alert-item danger ' + (isRead ? "read" : "") + '">' +
      '<div class="alert-icon"><i class="ti ti-flame"></i></div>' +
      '<div class="alert-text"><strong>\uC704\uD5D8 \uAC10\uC9C0</strong><span>#' + binId + ' ' + location + '</span><small>' + message + '</small></div>' +
      '<span class="alert-time">' + time + '</span>' +
    '</div>';
  }).join("");

  topbarAllAlertList.innerHTML = dangerAlerts.map((item) => {
    const isRead = item.is_received === "Y";
    const binId = topbarEscapeHtml(topbarAlertBinId(item));
    const location = topbarEscapeHtml(item.bin_loc || "");
    const message = topbarEscapeHtml(topbarAlertMessage(item));
    const time = topbarAlertTime(item.alerted_at);
    return '<div class="all-alert-row danger ' + (isRead ? "read" : "") + '">' +
      '<div><strong>\uC704\uD5D8 \uAC10\uC9C0</strong><span>#' + binId + ' ' + location + '</span></div>' +
      '<p>' + message + '</p>' +
      '<time>' + time + '</time>' +
    '</div>';
  }).join("");
}

async function loadTopbarAlerts() {
  try {
    const response = await fetch("/alerts/list");
    const rows = await response.json();
    topbarAlerts = fidsApplyAlertReadState(Array.isArray(rows) ? rows : []);
  } catch (error) {
    topbarAlerts = [];
  }
  renderTopbarAlerts();
}

if (topbarAlertButton && topbarAlertDropdown) {
  topbarAlertButton.onclick = (event) => {
    event.stopPropagation();
    topbarAlertDropdown.classList.toggle("open");
  };
  if (topbarReadAllBtn) {
    topbarReadAllBtn.onclick = async () => {
      fidsMarkAlertsRead();
      await fetch("/alerts/read-all", { method: "POST" });
      await loadTopbarAlerts();
    };
  }
  if (topbarOpenAllAlertsBtn && topbarAllAlertOverlay) {
    topbarOpenAllAlertsBtn.onclick = () => {
      topbarAlertDropdown.classList.remove("open");
      topbarAllAlertOverlay.classList.add("open");
    };
  }
  if (topbarCloseAllAlertsBtn && topbarAllAlertOverlay) {
    topbarCloseAllAlertsBtn.onclick = () => topbarAllAlertOverlay.classList.remove("open");
  }
  if (topbarAllAlertOverlay) {
    topbarAllAlertOverlay.onclick = (event) => {
      if (event.target === topbarAllAlertOverlay) topbarAllAlertOverlay.classList.remove("open");
    };
  }
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".alert-area")) topbarAlertDropdown.classList.remove("open");
  });
  loadTopbarAlerts();
}

setNowText();
setServerCheckTime();
setInterval(setNowText, 1000);
applyPermission();
lockThresholdInputs();
loadThresholds();
loadSystemSettings();
loadProfile();


























