const express = require("express");
const conn = require("../config/db");
const requireOperator = require("../middlewares/requireOperator");

const router = express.Router();

const defaultThresholds = Object.freeze({
  dangerTemp: 60,
  warningTemp: 40,
  dangerSmoke: 230,
  warningSmoke: 150,
});

const defaultSystemSettings = Object.freeze({
  dataInterval: "10\uCD08",
  reconnectDelay: "30\uCD08",
  retryCount: "5\uD68C",
  offlineAlert: "Y",
  retentionPeriod: "90\uC77C",
  autoDelete: "Y",
  exportRange: "\uCD5C\uADFC 30\uC77C",
  aiJudge: "Y",
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
  try {
    await query("ALTER TABLE t_manager ADD COLUMN assigned_regions VARCHAR(1000) NULL");
  } catch (err) {
    if (err.code !== "ER_DUP_FIELDNAME") throw err;
  }
}

function toClient(row) {
  return {
    dangerTemp: Number(row.danger_temp),
    warningTemp: Number(row.warning_temp),
    dangerSmoke: Number(row.danger_gas),
    warningSmoke: Number(row.warning_gas),
  };
}

async function ensureThresholdTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS t_fire_threshold (
      id INT NOT NULL PRIMARY KEY,
      danger_temp DECIMAL(5,1) NOT NULL,
      warning_temp DECIMAL(5,1) NOT NULL,
      danger_gas INT NOT NULL,
      warning_gas INT NOT NULL,
      updated_by INT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await query(
    `INSERT IGNORE INTO t_fire_threshold
      (id, danger_temp, warning_temp, danger_gas, warning_gas)
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
  settings.aiJudge = "Y";
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
function getManagerProfileSelectSql(whereClause) {
  return `SELECT mgr_id, mgr_email, mgr_name, mgr_phone, mgr_org, assigned_regions, is_approved, role
          FROM t_manager
          WHERE ${whereClause}`;
}

async function getCurrentManagerProfile(sessionUser = {}) {
  await ensureManagerColumns();

  const managerId = sessionUser.user_id || sessionUser.mgr_id || null;
  const managerEmail = sessionUser.mgr_email || sessionUser.email || null;
  let rows = [];

  if (managerId && managerEmail) {
    rows = await query(
      `${getManagerProfileSelectSql("mgr_id = ? OR mgr_email = ?")}
       ORDER BY CASE WHEN mgr_email = ? THEN 0 WHEN mgr_id = ? THEN 1 ELSE 2 END
       LIMIT 1`,
      [managerId, managerEmail, managerEmail, managerId]
    );
  } else if (managerId) {
    rows = await query(getManagerProfileSelectSql("mgr_id = ?"), [managerId]);
  } else if (managerEmail) {
    rows = await query(getManagerProfileSelectSql("mgr_email = ?"), [managerEmail]);
  }

  if (!rows.length) return null;

  const profile = rows[0];
  if (profile.role === "operator") {
    profile.mgr_org = "광주광역시 동구청";
    profile.assigned_regions = "전체 구역";
  }

  return profile;
}

function syncSessionUser(req, profile) {
  const currentUser = {
    ...(req.session.user || {}),
    ...profile,
    user_id: profile.mgr_id,
    mgr_id: profile.mgr_id,
    name: profile.mgr_name,
    email: profile.mgr_email,
    approval_status: profile.is_approved,
  };
  req.session.user = currentUser;
  return currentUser;
}

router.get("/", requireLogin, async (req, res) => {
  let currentUser = req.session.user || {};

  try {
    const profile = await getCurrentManagerProfile(currentUser);
    if (profile) {
      currentUser = syncSessionUser(req, profile);
    }
  } catch (err) {
    console.error("설정 페이지 계정 정보 조회 실패:", err);
  }

  res.render("settings", { currentUser });
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
       SET danger_temp = ?, warning_temp = ?, danger_gas = ?, warning_gas = ?, updated_by = ?
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
       SET danger_temp = ?, warning_temp = ?, danger_gas = ?, warning_gas = ?, updated_by = ?
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
    aiJudge: "Y",
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
    const profile = await getCurrentManagerProfile(req.session.user || {});

    if (!profile) {
      return res.status(404).json({ success: false, message: "계정 정보를 찾을 수 없습니다." });
    }

    syncSessionUser(req, profile);
    res.json({ success: true, profile });
  } catch (err) {
    console.error("계정 정보 조회 실패:", err);
    res.status(500).json({ success: false, message: "계정 정보를 불러오지 못했습니다." });
  }
});

router.post("/api/profile", requireLogin, async (req, res) => {
  const user = req.session.user;
  const userId = user.user_id || user.mgr_id;
  const name = String(req.body.mgr_name || "").trim();
  const phone = String(req.body.mgr_phone || "").trim();

  if (!name) {
    return res.status(400).json({ success: false, message: "이름은 필수입니다." });
  }

  if (!phone) {
    return res.status(400).json({ success: false, message: "휴대전화 번호는 필수입니다." });
  }

  try {
    const currentProfile = await getCurrentManagerProfile(user);
    if (!currentProfile) {
      return res.status(404).json({ success: false, message: "계정 정보를 찾을 수 없습니다." });
    }

    await query(
      `UPDATE t_manager
       SET mgr_name = ?, mgr_phone = ?
       WHERE mgr_id = ?`,
      [name, phone, currentProfile.mgr_id]
    );

    const nextProfile = {
      ...currentProfile,
      mgr_name: name,
      mgr_phone: phone,
    };
    syncSessionUser(req, nextProfile);

    res.json({
      success: true,
      requiresApproval: false,
      message: "계정 정보가 저장되었습니다.",
      profile: nextProfile,
    });
  } catch (err) {
    console.error("계정 정보 저장 실패:", err);
    res.status(500).json({ success: false, message: "계정 정보 저장에 실패했습니다." });
  }
});
router.delete("/api/profile", requireLogin, async (req, res) => {
  const user = req.session.user || {};
  const userId = user.user_id || user.mgr_id;

  if (!userId) {
    return res.status(400).json({ success: false, message: "탈퇴할 계정 정보를 찾을 수 없습니다." });
  }

  try {
    const rows = await query("SELECT mgr_id, mgr_email, role FROM t_manager WHERE mgr_id = ?", [userId]);
    if (!rows.length) {
      return res.status(404).json({ success: false, message: "계정 정보를 찾을 수 없습니다." });
    }

    const transferRows = await query(
      `SELECT mgr_id
       FROM t_manager
       WHERE mgr_id <> ? AND role = 'operator'
       ORDER BY mgr_id
       LIMIT 1`,
      [userId]
    );

    const fallbackRows = transferRows.length
      ? transferRows
      : await query(
          `SELECT mgr_id
           FROM t_manager
           WHERE mgr_id <> ?
           ORDER BY role = 'operator' DESC, mgr_id
           LIMIT 1`,
          [userId]
        );

    const transferMgrId = fallbackRows.length ? fallbackRows[0].mgr_id : null;

    await query("START TRANSACTION");

    if (transferMgrId) {
      await query("UPDATE t_alert SET mgr_id = ? WHERE mgr_id = ?", [transferMgrId, userId]);
      await query("UPDATE t_trashbin SET mgr_id = ? WHERE mgr_id = ?", [transferMgrId, userId]);
    } else {
      await query("DELETE FROM t_alert WHERE mgr_id = ?", [userId]);
      await query("DELETE FROM t_trashbin WHERE mgr_id = ?", [userId]);
    }

    await query("DELETE FROM t_manager WHERE mgr_id = ?", [userId]);
    await query("COMMIT");

    req.session.destroy((err) => {
      if (err) {
        console.error("계정 탈퇴 후 세션 종료 실패:", err);
      }
      res.clearCookie("connect.sid");
      res.json({ success: true, message: "탈퇴되었습니다." });
    });
  } catch (err) {
    try { await query("ROLLBACK"); } catch (rollbackErr) { console.error("계정 탈퇴 롤백 실패:", rollbackErr); }
    console.error("계정 탈퇴 실패:", err);
    res.status(500).json({ success: false, message: "계정 탈퇴에 실패했습니다." });
  }
});
router.post("/api/data/reset", requireOperator, async (req, res) => {
  const excludeTypes = Array.isArray(req.body.excludeTypes) ? req.body.excludeTypes : [];
  const allowedTypes = ["danger", "warning", "normal"];
  const resetTypes = allowedTypes.filter((type) => !excludeTypes.includes(type));

  if (resetTypes.length === 0) {
    return res.json({
      success: true,
      deletedCount: 0,
      deletedAlerts: 0,
      deletedSensors: 0,
      deletedTrashbins: 0,
      message: "\uC81C\uC678\uD560 \uB370\uC774\uD130\uB9CC \uC120\uD0DD\uB418\uC5B4 \uCD08\uAE30\uD654\uD560 \uD56D\uBAA9\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."
    });
  }

  const typeConditions = [];
  if (resetTypes.includes("danger")) typeConditions.push("bin_id IN (1, 2, 3, 4)");
  if (resetTypes.includes("warning")) typeConditions.push("bin_id IN (5, 6, 7)");
  if (resetTypes.includes("normal")) typeConditions.push("bin_id NOT IN (1, 2, 3, 4, 5, 6, 7)");
  const whereByType = "(" + typeConditions.join(" OR ") + ")";

  try {
    await query("START TRANSACTION");
    const alertResult = await query("DELETE FROM t_alert WHERE " + whereByType);
    let sensorResult = { affectedRows: 0 };
    try {
      sensorResult = await query("DELETE FROM sensor_data WHERE " + whereByType);
    } catch (sensorErr) {
      if (sensorErr.code !== "ER_NO_SUCH_TABLE") throw sensorErr;
    }
    const trashbinResult = await query("DELETE FROM t_trashbin WHERE " + whereByType);
    await query("COMMIT");

    const deletedAlerts = alertResult.affectedRows || 0;
    const deletedSensors = sensorResult.affectedRows || 0;
    const deletedTrashbins = trashbinResult.affectedRows || 0;
    res.json({
      success: true,
      deletedCount: deletedAlerts + deletedSensors + deletedTrashbins,
      deletedAlerts,
      deletedSensors,
      deletedTrashbins,
      message: "\uC6B4\uC601 \uB370\uC774\uD130\uAC00 \uCD08\uAE30\uD654\uB418\uC5C8\uC2B5\uB2C8\uB2E4."
    });
  } catch (err) {
    try { await query("ROLLBACK"); } catch (rollbackErr) { console.error("data reset rollback failed:", rollbackErr); }
    console.error("data reset failed:", err);
    res.status(500).json({
      success: false,
      message: "\uB370\uC774\uD130 \uCD08\uAE30\uD654\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4."
    });
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







