const express = require("express");
const conn = require("../config/db");
const requireOperator = require("../middlewares/requireOperator");

const router = express.Router();

const defaultThresholds = Object.freeze({
  dangerTemp: 80,
  warningTemp: 55,
  dangerSmoke: 300,
  warningSmoke: 100,
});

const defaultSystemSettings = Object.freeze({
  dataInterval: "10\uCD08",
  reconnectDelay: "30\uCD08",
  retryCount: "5\uD68C",
  offlineAlert: "Y",
  retentionPeriod: "90\uC77C",
  autoDelete: "Y",
  exportRange: "\uCD5C\uADFC 30\uC77C",
});

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    conn.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function requireLogin(req, res, next) {
  if (req.session && req.session.user) return next();
  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ success: false, message: "로그인이 필요합니다." });
  }
  return res.redirect("/login");
}

async function ensureManagerColumns() {
  try {
    await query("ALTER TABLE t_manager ADD COLUMN mgr_org VARCHAR(100) NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
}

function toClient(row) {
  return {
    dangerTemp: Number(row.danger_temp),
    warningTemp: Number(row.warning_temp),
    dangerSmoke: Number(row.danger_smoke),
    warningSmoke: Number(row.warning_smoke),
  };
}

async function ensureThresholdTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS t_fire_threshold (
      id INT NOT NULL PRIMARY KEY,
      danger_temp DECIMAL(5,1) NOT NULL,
      warning_temp DECIMAL(5,1) NOT NULL,
      danger_smoke INT NOT NULL,
      warning_smoke INT NOT NULL,
      updated_by INT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(
    `INSERT IGNORE INTO t_fire_threshold
      (id, danger_temp, warning_temp, danger_smoke, warning_smoke)
     VALUES (1, ?, ?, ?, ?)`,
    [defaultThresholds.dangerTemp, defaultThresholds.warningTemp, defaultThresholds.dangerSmoke, defaultThresholds.warningSmoke]
  );
}

async function getThresholds() {
  await ensureThresholdTable();
  const rows = await query("SELECT * FROM t_fire_threshold WHERE id = 1");
  if (!rows.length) return defaultThresholds;
  return toClient(rows[0]);
}

async function ensureSystemSettingTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS t_system_setting (
      setting_key VARCHAR(50) NOT NULL PRIMARY KEY,
      setting_value VARCHAR(100) NOT NULL,
      updated_by INT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  for (const [key, value] of Object.entries(defaultSystemSettings)) {
    await query(
      "INSERT IGNORE INTO t_system_setting (setting_key, setting_value) VALUES (?, ?)",
      [key, value]
    );
  }
}

async function getSystemSettings() {
  await ensureSystemSettingTable();
  const rows = await query("SELECT setting_key, setting_value FROM t_system_setting");
  const settings = { ...defaultSystemSettings };
  rows.forEach((row) => {
    settings[row.setting_key] = row.setting_value;
  });
  return settings;
}

async function saveSystemSettings(next, userId) {
  await ensureSystemSettingTable();
  for (const [key, value] of Object.entries(next)) {
    await query(
      `INSERT INTO t_system_setting (setting_key, setting_value, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
      [key, String(value), userId]
    );
  }
  return getSystemSettings();
}

router.get("/", requireLogin, (req, res) => {
  res.render("settings", { user: req.session.user || null });
});

router.get("/api/thresholds", requireLogin, async (req, res) => {
  try {
    const thresholds = await getThresholds();
    res.json({ success: true, thresholds });
  } catch (err) {
    console.error("임계값 조회 실패:", err);
    res.status(500).json({ success: false, message: "임계값을 불러오지 못했습니다." });
  }
});

router.post("/api/thresholds", requireOperator, async (req, res) => {
  const next = {
    dangerTemp: Number(req.body.dangerTemp),
    warningTemp: Number(req.body.warningTemp),
    dangerSmoke: Number(req.body.dangerSmoke),
    warningSmoke: Number(req.body.warningSmoke),
  };

  if (Object.values(next).some((value) => !Number.isFinite(value))) {
    return res.status(400).json({ success: false, message: "숫자 값을 입력해주세요." });
  }

  if (next.warningTemp >= next.dangerTemp) {
    return res.status(400).json({ success: false, message: "주의 온도는 위험 온도보다 낮아야 합니다." });
  }

  if (next.warningSmoke >= next.dangerSmoke) {
    return res.status(400).json({ success: false, message: "주의 연기감지값은 위험 연기감지값보다 낮아야 합니다." });
  }

  try {
    await ensureThresholdTable();
    await query(
      `UPDATE t_fire_threshold
       SET danger_temp = ?, warning_temp = ?, danger_smoke = ?, warning_smoke = ?, updated_by = ?
       WHERE id = 1`,
      [next.dangerTemp, next.warningTemp, next.dangerSmoke, next.warningSmoke, req.session.user.user_id]
    );

    const thresholds = await getThresholds();
    res.json({ success: true, thresholds, message: "임계값이 변경되었습니다." });
  } catch (err) {
    console.error("임계값 저장 실패:", err);
    res.status(500).json({ success: false, message: "임계값 저장에 실패했습니다." });
  }
});

router.post("/api/thresholds/reset", requireOperator, async (req, res) => {
  try {
    await ensureThresholdTable();
    await query(
      `UPDATE t_fire_threshold
       SET danger_temp = ?, warning_temp = ?, danger_smoke = ?, warning_smoke = ?, updated_by = ?
       WHERE id = 1`,
      [defaultThresholds.dangerTemp, defaultThresholds.warningTemp, defaultThresholds.dangerSmoke, defaultThresholds.warningSmoke, req.session.user.user_id]
    );

    const thresholds = await getThresholds();
    res.json({ success: true, thresholds, message: "기본 임계값으로 초기화되었습니다." });
  } catch (err) {
    console.error("임계값 초기화 실패:", err);
    res.status(500).json({ success: false, message: "임계값 초기화에 실패했습니다." });
  }
});

router.get("/api/system", requireLogin, async (req, res) => {
  try {
    const settings = await getSystemSettings();
    res.json({ success: true, settings });
  } catch (err) {
    console.error("system settings load failed:", err);
    res.status(500).json({ success: false, message: "\uC124\uC815\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

router.post("/api/system/network", requireLogin, async (req, res) => {
  const next = {
    dataInterval: req.body.dataInterval || defaultSystemSettings.dataInterval,
    reconnectDelay: req.body.reconnectDelay || defaultSystemSettings.reconnectDelay,
    retryCount: req.body.retryCount || defaultSystemSettings.retryCount,
    offlineAlert: req.body.offlineAlert === "Y" ? "Y" : "N",
  };

  try {
    const settings = await saveSystemSettings(next, req.session.user.user_id);
    res.json({ success: true, settings, message: "\uB124\uD2B8\uC6CC\uD06C \uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
  } catch (err) {
    console.error("network settings save failed:", err);
    res.status(500).json({ success: false, message: "\uB124\uD2B8\uC6CC\uD06C \uC124\uC815 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

router.post("/api/system/data", requireLogin, async (req, res) => {
  const next = {
    retentionPeriod: req.body.retentionPeriod || defaultSystemSettings.retentionPeriod,
    autoDelete: req.body.autoDelete === "Y" ? "Y" : "N",
    exportRange: req.body.exportRange || defaultSystemSettings.exportRange,
  };

  try {
    const settings = await saveSystemSettings(next, req.session.user.user_id);
    res.json({ success: true, settings, message: "\uB370\uC774\uD130 \uAD00\uB9AC \uC124\uC815\uC774 \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
  } catch (err) {
    console.error("data settings save failed:", err);
    res.status(500).json({ success: false, message: "\uB370\uC774\uD130 \uAD00\uB9AC \uC124\uC815 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
  }
});

router.get("/api/profile", requireLogin, async (req, res) => {
  try {
    await ensureManagerColumns();
    const rows = await query(
      `SELECT mgr_id, mgr_email, mgr_name, mgr_phone, mgr_org, is_approved, role
       FROM t_manager
       WHERE mgr_id = ?`,
      [req.session.user.user_id]
    );

    if (!rows.length) {
      return res.status(404).json({ success: false, message: "계정 정보를 찾을 수 없습니다." });
    }

    res.json({ success: true, profile: rows[0] });
  } catch (err) {
    console.error("계정 정보 조회 실패:", err);
    res.status(500).json({ success: false, message: "계정 정보를 불러오지 못했습니다." });
  }
});

router.post("/api/profile", requireLogin, async (req, res) => {
  const user = req.session.user;
  const name = String(req.body.mgr_name || "").trim();
  const org = String(req.body.mgr_org || "").trim();
  const email = String(req.body.mgr_email || "").trim();
  const phone = String(req.body.mgr_phone || "").trim();

  if (!name || !email) {
    return res.status(400).json({ success: false, message: "이름과 이메일은 필수입니다." });
  }

  try {
    await ensureManagerColumns();
    const rows = await query("SELECT mgr_email, role FROM t_manager WHERE mgr_id = ?", [user.user_id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "계정 정보를 찾을 수 없습니다." });
    }

    const currentEmail = rows[0].mgr_email;
    const emailChanged = currentEmail !== email;
    const shouldRequireApproval = emailChanged && rows[0].role !== "operator";

    await query(
      `UPDATE t_manager
       SET mgr_name = ?, mgr_org = ?, mgr_email = ?, mgr_phone = ?, is_approved = CASE WHEN ? THEN 0 ELSE is_approved END
       WHERE mgr_id = ?`,
      [name, org, email, phone, shouldRequireApproval, user.user_id]
    );

    req.session.user.email = email;
    if (shouldRequireApproval) {
      req.session.user.approval_status = 0;
    }

    res.json({
      success: true,
      requiresApproval: shouldRequireApproval,
      message: shouldRequireApproval
        ? "이메일이 변경되어 관리자 승인이 다시 필요합니다."
        : "계정 정보가 저장되었습니다.",
      profile: { mgr_name: name, mgr_org: org, mgr_email: email, mgr_phone: phone },
    });
  } catch (err) {
    console.error("계정 정보 저장 실패:", err);
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(400).json({ success: false, message: "이미 사용 중인 이메일입니다." });
    }
    res.status(500).json({ success: false, message: "계정 정보 저장에 실패했습니다." });
  }
});

router.get("/api/export/trashbins", (req, res) => {
  const sql = `
    SELECT
      tb.bin_id,
      tb.bin_loc,
      tb.installed_at,
      sd.alert_type,
      sd.smoke_value,
      sd.temp_value,
      sd.flame_value
    FROM t_trashbin tb
    LEFT JOIN (
      SELECT s1.*
      FROM sensor_data s1
      INNER JOIN (
        SELECT bin_id, MAX(created_at) AS latest_time
        FROM sensor_data
        GROUP BY bin_id
      ) s2
        ON s1.bin_id = s2.bin_id
       AND s1.created_at = s2.latest_time
    ) sd
      ON tb.bin_id = sd.bin_id
    WHERE tb.deleted_at IS NULL OR tb.deleted_at IS NULL
    ORDER BY tb.bin_id ASC
  `;

  conn.query(sql, (err, rows) => {
    if (err) {
      console.error("내보내기용 쓰레기통 데이터 조회 실패:", err);
      return res.status(500).json([]);
    }

    res.json(rows);
  });
});

module.exports = router;