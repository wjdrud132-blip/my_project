const express = require("express");
const router = express.Router();

const conn = require("../config/db");
const { judgeDanger, defaultThresholds, trainSensorModel } = require("../utils/aiJudge");
const { filterRowsByRegion, canViewLocation, dedupeRowsByLocation } = require("../utils/regionScope");

function displayBinId(binId) {
  return binId;
}

const SENSOR_ONLINE_LIMIT_MS = 10000;
const pendingAlertKeys = new Set();
const SAME_ALERT_COOLDOWN_MINUTES = 2;

function getSensorAgeMs(sensorCreatedAt) {
  if (!sensorCreatedAt) return null;
  const sensorTime = new Date(sensorCreatedAt).getTime();
  if (!Number.isFinite(sensorTime)) return null;
  return Date.now() - sensorTime;
}

function isSensorOnline(sensorCreatedAt) {
  const ageMs = getSensorAgeMs(sensorCreatedAt);
  return ageMs !== null && ageMs >= 0 && ageMs <= SENSOR_ONLINE_LIMIT_MS;
}

let cachedSensorModel = null;
let cachedSensorModelAt = 0;
const SENSOR_MODEL_CACHE_MS = 300000;
const lastStatusByBin = new Map();

function getSensorModel(thresholds, callback) {
  const now = Date.now();
  if (cachedSensorModel && now - cachedSensorModelAt < SENSOR_MODEL_CACHE_MS) {
    return callback(null, cachedSensorModel);
  }

  const sql = `
    SELECT
      bin_id,
      temp,
      gas,
      flame,
      ir_count,
      fire_risk,
      CASE
        WHEN prev_created_at IS NULL OR TIMESTAMPDIFF(SECOND, prev_created_at, created_at) <= 0 THEN NULL
        ELSE GREATEST(temp - prev_temp, 0) / GREATEST(TIMESTAMPDIFF(SECOND, prev_created_at, created_at) / 60, 1)
      END AS temp_rise_per_min,
      CASE
        WHEN prev_created_at IS NULL OR TIMESTAMPDIFF(SECOND, prev_created_at, created_at) <= 0 THEN NULL
        ELSE GREATEST(gas - prev_gas, 0) / GREATEST(TIMESTAMPDIFF(SECOND, prev_created_at, created_at) / 60, 1)
      END AS gas_rise_per_min
    FROM (
      SELECT
        s.*,
        LAG(s.temp) OVER (PARTITION BY s.bin_id ORDER BY s.created_at, s.sensor_id) AS prev_temp,
        LAG(s.gas) OVER (PARTITION BY s.bin_id ORDER BY s.created_at, s.sensor_id) AS prev_gas,
        LAG(s.ir_count) OVER (PARTITION BY s.bin_id ORDER BY s.created_at, s.sensor_id) AS prev_ir_count,
        LAG(s.created_at) OVER (PARTITION BY s.bin_id ORDER BY s.created_at, s.sensor_id) AS prev_created_at
      FROM (
        SELECT *
        FROM t_sensor
        WHERE temp IS NOT NULL
          AND gas IS NOT NULL
        ORDER BY created_at DESC, sensor_id DESC
        LIMIT 5000
      ) s
    ) sensor_changes
  `;

  conn.query(sql, (err, rows) => {
    if (err) {
      console.error("t_sensor AI 학습 데이터 조회 실패:", err);
      return callback(null, { available: false, sampleCount: 0, reason: "t_sensor 학습 데이터를 불러오지 못해 기존 임계값 기준을 사용합니다." });
    }

    cachedSensorModel = trainSensorModel(rows, thresholds);
    cachedSensorModelAt = now;
    callback(null, cachedSensorModel);
  });
}

function rowForCurrentSensor(row) {
  const online = isSensorOnline(row.sensor_created_at);
  if (online) {
    return {
      ...row,
      sensor_online: "Y",
      sensor_age_seconds: Math.floor(getSensorAgeMs(row.sensor_created_at) / 1000),
    };
  }

  return {
    ...row,
    sensor_online: "N",
    sensor_age_seconds: getSensorAgeMs(row.sensor_created_at) === null ? null : Math.floor(getSensorAgeMs(row.sensor_created_at) / 1000),
    network_status: 0,
    alert_type: "normal",
    alert_msg: "",
    temp_value: null,
    smoke_value: null,
    flame_value: null,
    ir_count: null,
    prev_ir_count: null,
    fire_risk: null,
  };
}

function queryAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    conn.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function alertMessageFor(row) {
  const reason = String(row.ai_reason || row.alert_msg || "");

  if (row.alert_type === "danger") {
    if (reason.includes("불꽃")) return "불꽃 감지 및 센서값 상승 - 즉각 대응 필요";
    if (reason.includes("연기") && reason.includes("온도")) return "온도·연기 위험 기준 초과 - 즉각 대응 필요";
    if (reason.includes("연기")) return "연기 감지값 위험 기준 초과 - 즉각 대응 필요";
    if (reason.includes("온도")) return "온도 위험 기준 초과 - 즉각 대응 필요";
    return "화재 위험 감지 - 즉각 대응 필요";
  }

  if (row.alert_type === "warning") {
    if (reason.includes("연기값 증가폭") || reason.includes("연기값이 학습 데이터")) return "연기 센서 증가폭 이상 감지";
    if (reason.includes("온도 증가폭") || reason.includes("온도 증가폭이 학습 데이터")) return "온도 센서 증가폭 이상 감지";
    if (reason.includes("연기") && reason.includes("온도")) return "온도·연기 주의 기준 감지";
    if (reason.includes("연기")) return "연기 감지값 주의 기준 초과";
    if (reason.includes("온도")) return "온도 상승 주의 관찰";
    if (reason.includes("햇빛") || reason.includes("주변 환경")) return "주변 환경 영향 가능성 - 주의 관찰";
    return "주의 상태 감지 - 모니터링 필요";
  }

  return "";
}

function alertStatusRank(status) {
  if (status === "danger") return 2;
  if (status === "warning") return 1;
  return 0;
}

function alertStatusOf(status) {
  if (status === "danger" || status === "warning") return status;
  return "normal";
}

async function getPreviousSensorStatus(row, thresholds, aiEnabled, sensorModel) {
  const previousRows = await queryAsync(
    `SELECT
       temp AS temp_value,
       gas AS smoke_value,
       flame AS flame_value,
       ir_count,
       fire_risk,
       created_at AS sensor_created_at
     FROM t_sensor
     WHERE bin_id = ?
       AND (
         created_at < ?
         OR (created_at = ? AND sensor_id < ?)
       )
     ORDER BY created_at DESC, sensor_id DESC
     LIMIT 1`,
    [row.bin_id, row.sensor_created_at, row.sensor_created_at, row.sensor_id || 0]
  );

  if (!previousRows.length) return "normal";

  const previous = previousRows[0];
  const ruleStatus = previous.fire_risk === 2 ? "danger" : previous.fire_risk === 1 ? "warning" : "normal";
  const ai = judgeDanger(
    { ...previous, bin_id: row.bin_id, alert_type: ruleStatus, alert_msg: "" },
    thresholds,
    aiEnabled,
    sensorModel
  );

  return alertStatusOf(ai.status);
}


async function getLatestSavedAlertStatus(row) {
  const rows = await queryAsync(
    `SELECT alert_type
     FROM t_alert
     WHERE bin_id = ?
       AND alert_type IN ('danger', 'warning')
     ORDER BY alerted_at DESC, alert_id DESC
     LIMIT 1`,
    [row.bin_id]
  );

  return rows.length ? rows[0].alert_type : null;
}
async function hasRecentSameAlert(row) {
  const rows = await queryAsync(
    `SELECT alert_id
     FROM t_alert
     WHERE bin_id = ?
       AND alert_type = ?
       AND alerted_at >= DATE_SUB(?, INTERVAL ? MINUTE)
       AND alerted_at <= ?
     LIMIT 1`,
    [
      row.bin_id,
      row.alert_type,
      row.sensor_created_at,
      SAME_ALERT_COOLDOWN_MINUTES,
      row.sensor_created_at,
    ]
  );

  return rows.length > 0;
}
async function saveSensorAlertIfNeeded(row, thresholds, aiEnabled, sensorModel) {
  if (!row || row.sensor_online !== "Y") return;
  if (row.alert_type !== "danger" && row.alert_type !== "warning") return;
  if (!row.bin_id || !row.sensor_created_at || !row.mgr_id) return;

  const alertTime = new Date(row.sensor_created_at).getTime();
  const alertKey = `${row.bin_id}|${row.alert_type}|${Number.isFinite(alertTime) ? alertTime : row.sensor_created_at}`;
  if (pendingAlertKeys.has(alertKey)) return;

  pendingAlertKeys.add(alertKey);
  try {
    const exists = await queryAsync(
      `SELECT alert_id
       FROM t_alert
       WHERE bin_id = ?
         AND alert_type = ?
         AND alerted_at = ?
       LIMIT 1`,
      [row.bin_id, row.alert_type, row.sensor_created_at]
    );

    if (exists.length) return;

    const previousStatus = await getPreviousSensorStatus(row, thresholds, aiEnabled, sensorModel);
    const latestSavedStatus = await getLatestSavedAlertStatus(row);
    if (previousStatus === row.alert_type && latestSavedStatus === row.alert_type) return;

    if (await hasRecentSameAlert(row)) return;

    await queryAsync(
      `INSERT INTO t_alert
        (bin_id, alert_type, alert_msg, alerted_at, is_received, received_at, mgr_id)
       SELECT ?, ?, ?, ?, 'N', NULL, ?
       FROM DUAL
       WHERE NOT EXISTS (
         SELECT 1
         FROM t_alert
         WHERE bin_id = ?
           AND alert_type = ?
           AND alerted_at >= DATE_SUB(?, INTERVAL ? MINUTE)
           AND alerted_at <= ?
       )`,
      [
        row.bin_id,
        row.alert_type,
        alertMessageFor(row),
        row.sensor_created_at,
        row.mgr_id,
        row.bin_id,
        row.alert_type,
        row.sensor_created_at,
        SAME_ALERT_COOLDOWN_MINUTES,
        row.sensor_created_at,
      ]
    );
  } finally {
    pendingAlertKeys.delete(alertKey);
  }
}
async function saveSensorAlerts(judgedRows, thresholds, aiEnabled, sensorModel) {
  const targets = judgedRows
    .filter((row) => row.alert_type === "danger" || row.alert_type === "warning")
    .sort((a, b) => new Date(a.sensor_created_at) - new Date(b.sensor_created_at) || alertStatusRank(b.alert_type) - alertStatusRank(a.alert_type));

  for (const row of targets) {
    try {
      await saveSensorAlertIfNeeded(row, thresholds, aiEnabled, sensorModel);
    } catch (err) {
      console.error("센서 알림 기록 저장 실패:", err);
    }
  }
}

async function saveRecentSensorAlerts(req, thresholds, aiEnabled, sensorModel) {
  const recentSql = `
    SELECT
      b.bin_id,
      b.bin_loc,
      b.mgr_id,
      b.network_status,
      s.sensor_id,
      s.temp AS temp_value,
      s.gas AS smoke_value,
      s.flame AS flame_value,
      s.ir_count,
      s.fire_risk,
      s.created_at AS sensor_created_at,
      s.prev_temp,
      s.prev_gas,
      s.prev_ir_count,
      s.prev_created_at,
      CASE
        WHEN s.prev_created_at IS NULL OR TIMESTAMPDIFF(SECOND, s.prev_created_at, s.created_at) <= 0 THEN NULL
        ELSE GREATEST(s.temp - s.prev_temp, 0) / GREATEST(TIMESTAMPDIFF(SECOND, s.prev_created_at, s.created_at) / 60, 1)
      END AS temp_rise_per_min,
      CASE
        WHEN s.prev_created_at IS NULL OR TIMESTAMPDIFF(SECOND, s.prev_created_at, s.created_at) <= 0 THEN NULL
        ELSE GREATEST(s.gas - s.prev_gas, 0) / GREATEST(TIMESTAMPDIFF(SECOND, s.prev_created_at, s.created_at) / 60, 1)
      END AS gas_rise_per_min
    FROM t_trashbin b
    INNER JOIN (
      SELECT
        sensor_changes.*,
        LAG(sensor_changes.temp) OVER (PARTITION BY sensor_changes.bin_id ORDER BY sensor_changes.created_at, sensor_changes.sensor_id) AS prev_temp,
        LAG(sensor_changes.gas) OVER (PARTITION BY sensor_changes.bin_id ORDER BY sensor_changes.created_at, sensor_changes.sensor_id) AS prev_gas,
        LAG(sensor_changes.ir_count) OVER (PARTITION BY sensor_changes.bin_id ORDER BY sensor_changes.created_at, sensor_changes.sensor_id) AS prev_ir_count,
        LAG(sensor_changes.created_at) OVER (PARTITION BY sensor_changes.bin_id ORDER BY sensor_changes.created_at, sensor_changes.sensor_id) AS prev_created_at
      FROM (
        SELECT *
        FROM t_sensor
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
      ) sensor_changes
    ) s ON s.bin_id = b.bin_id
    WHERE IFNULL(b.network_status, 1) <> 9
    ORDER BY s.created_at ASC, s.sensor_id ASC
    LIMIT 1000
  `;

const recentRows = filterRowsByRegion(req, await queryAsync(recentSql), "bin_loc");

const judgedRows = recentRows.map((row) => {
  const ruleStatus = row.fire_risk === 2 ? "danger" : row.fire_risk === 1 ? "warning" : "normal";

  const prevStatus = lastStatusByBin.get(String(row.bin_id)) || "normal";

  const ai = judgeDanger(
    { ...row, sensor_online: "Y", alert_type: ruleStatus, alert_msg: "" },
    thresholds,
    aiEnabled,
    sensorModel,
    prevStatus
  );

  lastStatusByBin.set(String(row.bin_id), ai.status);

  return {
      ...row,
      sensor_online: "Y",
      rule_status: ruleStatus,
      alert_type: ai.status,
      ai_enabled: aiEnabled ? "Y" : "N",
      ai_status: ai.status,
      ai_reason: ai.reason.join(" "),
      temp_value: ai.sensor.temp,
      smoke_value: ai.sensor.smoke,
      flame_value: ai.sensor.flame,
    };
  });

  await saveSensorAlerts(judgedRows, thresholds, aiEnabled, sensorModel);
}
router.get("/list", (req, res) => {
  const sql = `
    SELECT
      b.bin_id,
      b.bin_loc,
      b.installed_at,
      b.mgr_id,
      b.network_status,
      b.created_at,
      COALESCE(NULLIF(b.installer_name, ''), m.mgr_name) AS mgr_name,
      COALESCE(NULLIF(b.installer_phone, ''), m.mgr_phone) AS mgr_phone,
      a.alert_id,
      CASE
        WHEN s.fire_risk = 2 THEN 'danger'
        WHEN s.fire_risk = 1 THEN 'warning'
        WHEN a.alert_type IS NOT NULL THEN a.alert_type
        ELSE 'normal'
      END AS alert_type,
      COALESCE(a.alert_msg, '') AS alert_msg,
      COALESCE(s.created_at, a.alerted_at, b.created_at) AS alerted_at,
      a.is_received,
      s.sensor_id,
      s.temp AS temp_value,
      s.gas AS smoke_value,
      s.flame AS flame_value,
      s.ir_count,
      s.fire_risk,
      s.created_at AS sensor_created_at,

      p.temp AS prev_temp,
      p.gas AS prev_gas,
      p.ir_count AS prev_ir_count,
      p.created_at AS prev_created_at,

      CASE
        WHEN p.created_at IS NULL OR TIMESTAMPDIFF(SECOND, p.created_at, s.created_at) <= 0 THEN NULL
        ELSE GREATEST(s.temp - p.temp, 0) / GREATEST(TIMESTAMPDIFF(SECOND, p.created_at, s.created_at) / 60, 1)
      END AS temp_rise_per_min,

      CASE
        WHEN p.created_at IS NULL OR TIMESTAMPDIFF(SECOND, p.created_at, s.created_at) <= 0 THEN NULL
        ELSE GREATEST(s.gas - p.gas, 0) / GREATEST(TIMESTAMPDIFF(SECOND, p.created_at, s.created_at) / 60, 1)
      END AS gas_rise_per_min

    FROM t_trashbin b
    LEFT JOIN t_manager m
      ON b.mgr_id = m.mgr_id

    LEFT JOIN t_sensor s
      ON s.sensor_id = (
        SELECT latest.sensor_id
        FROM t_sensor latest
        WHERE latest.bin_id = b.bin_id
        ORDER BY latest.created_at DESC, latest.sensor_id DESC
        LIMIT 1
      )

    LEFT JOIN t_sensor p
      ON p.sensor_id = (
        SELECT prev.sensor_id
        FROM t_sensor prev
        WHERE prev.bin_id = b.bin_id
          AND s.sensor_id IS NOT NULL
          AND (
            prev.created_at < s.created_at
            OR (prev.created_at = s.created_at AND prev.sensor_id < s.sensor_id)
          )
        ORDER BY prev.created_at DESC, prev.sensor_id DESC
        LIMIT 1
      )
    LEFT JOIN t_alert a
      ON a.alert_id = (
        SELECT a2.alert_id
        FROM t_alert a2
        WHERE a2.bin_id = b.bin_id
        ORDER BY a2.alerted_at DESC, a2.alert_id DESC
        LIMIT 1
      )
    WHERE IFNULL(b.network_status, 1) <> 9
    ORDER BY
      CASE
        WHEN s.fire_risk = 2 OR a.alert_type = 'danger' THEN 1
        WHEN s.fire_risk = 1 OR a.alert_type = 'warning' THEN 2
        ELSE 3
      END,
      b.bin_id ASC
  `

  conn.query(sql, (err, rows) => {
    if (err) {
      console.error("쓰레기통 목록 조회 실패:", err);
      return res.status(500).json({ message: "쓰레기통 목록 조회 실패" });
    }

    rows = dedupeRowsByLocation(filterRowsByRegion(req, rows, "bin_loc"), "bin_loc");

    const thresholdSql = "SELECT danger_temp, warning_temp, danger_gas, warning_gas FROM t_fire_threshold WHERE id = 1";
    const aiSql = "SELECT setting_value FROM t_system_setting WHERE setting_key = 'aiJudge'";

    conn.query(thresholdSql, (thresholdErr, thresholdRows) => {
      const thresholdRow = thresholdRows && thresholdRows[0];
      const thresholds = thresholdErr || !thresholdRow ? defaultThresholds : {
        dangerTemp: Number(thresholdRow.danger_temp),
        warningTemp: Number(thresholdRow.warning_temp),
        dangerSmoke: Number(thresholdRow.danger_gas),
        warningSmoke: Number(thresholdRow.warning_gas),
      };

      conn.query(aiSql, (aiErr, aiRows) => {
        const aiEnabled = !aiErr && aiRows && aiRows[0] ? aiRows[0].setting_value !== "N" : true;

        getSensorModel(thresholds, (modelErr, sensorModel) => {
          const judgedRows = rows.map((row) => {
            const currentRow = rowForCurrentSensor(row);
            const ruleStatus = currentRow.alert_type;
            const prevStatus = lastStatusByBin.get(currentRow.bin_id) || "normal";
            const ai = judgeDanger(currentRow, thresholds, aiEnabled, sensorModel, prevStatus);
            //lastStatusByBin.set(currentRow.bin_id, ai.status);
            return {
              ...currentRow,
              display_bin_id: displayBinId(currentRow.bin_id),
              rule_status: ruleStatus,
              alert_type: ai.status,
              ai_enabled: aiEnabled ? "Y" : "N",
              ai_status: ai.status,
              ai_reason: currentRow.sensor_online === "Y" ? ai.reason.join(" ") : "최근 센서 데이터 수신이 없어 오프라인으로 표시합니다.",
              ai_confidence: currentRow.sensor_online === "Y" ? ai.confidence : 0,
              ai_model_sample_count: sensorModel && sensorModel.sampleCount ? sensorModel.sampleCount : 0,
              temp_value: currentRow.sensor_online === "Y" ? ai.sensor.temp : null,
              smoke_value: currentRow.sensor_online === "Y" ? ai.sensor.smoke : null,
              flame_value: currentRow.sensor_online === "Y" ? ai.sensor.flame : null,
            };
          }).sort((a, b) => {
            const rank = (type) => type === "danger" ? 1 : type === "warning" ? 2 : 3;
            return rank(a.alert_type) - rank(b.alert_type) || Number(a.bin_id) - Number(b.bin_id);
          });
          res.json(judgedRows);

          saveRecentSensorAlerts(req, thresholds, aiEnabled, sensorModel)
            .then(() => saveSensorAlerts(judgedRows, thresholds, aiEnabled, sensorModel))
            .catch((err) => console.error("알림 기록 저장 실패:", err));
        });
      });
    });
  });
});

router.get("/trash/list", (req, res) => {
  const sql = `
    SELECT
      b.bin_id,
      b.bin_loc,
      b.installed_at,
      b.mgr_id,
      b.network_status,
      b.created_at,
      COALESCE(NULLIF(b.installer_name, ''), m.mgr_name) AS mgr_name
    FROM t_trashbin b
    LEFT JOIN t_manager m
      ON b.mgr_id = m.mgr_id
    WHERE b.network_status = 9
    ORDER BY b.bin_id ASC
  `;

  conn.query(sql, (err, rows) => {
    if (err) {
      console.error("휴지통 목록 조회 실패:", err);
      return res.status(500).json({ message: "휴지통 목록 조회 실패" });
    }

    res.json(filterRowsByRegion(req, rows, "bin_loc").map((row) => ({ ...row, display_bin_id: displayBinId(row.bin_id) })));
  });
});

router.patch("/trash/:bin_id/restore", (req, res) => {
  const { bin_id } = req.params;

  conn.query(
    "UPDATE t_trashbin SET network_status = 1 WHERE bin_id = ? AND network_status = 9",
    [bin_id],
    (err, result) => {
      if (err) {
        console.error("\uD734\uC9C0\uD1B5 \uBCF5\uAD6C \uC2E4\uD328:", err);
        return res.status(500).json({ message: "\uBCF5\uAD6C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "\uBCF5\uAD6C\uD560 \uC4F0\uB808\uAE30\uD1B5\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." });
      }

      res.json({ message: "\uC4F0\uB808\uAE30\uD1B5\uC774 \uBCF5\uAD6C\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
    }
  );
});

router.delete("/trash/:bin_id", (req, res) => {
  const { bin_id } = req.params;

  conn.query("DELETE FROM t_alert WHERE bin_id = ?", [bin_id], (alertErr) => {
    if (alertErr) {
      console.error("휴지통 알림 완전 삭제 실패:", alertErr);
      return res.status(500).json({ message: "알림 데이터 삭제 실패" });
    }

    conn.query("DELETE FROM t_trashbin WHERE bin_id = ? AND network_status = 9", [bin_id], (err, result) => {
      if (err) {
        console.error("휴지통 쓰레기통 완전 삭제 실패:", err);
        return res.status(500).json({ message: "완전 삭제 실패" });
      }

      if (result.affectedRows === 0) {
        return res.status(404).json({ message: "휴지통에서 삭제할 쓰레기통을 찾을 수 없습니다." });
      }

      res.json({ message: "쓰레기통이 완전히 삭제되었습니다." });
    });
  });
});

router.post("/", (req, res) => {
  const { bin_loc, installed_at, network_status } = req.body;
  const mgr_id = req.body.mgr_id || req.session?.user?.user_id || req.session?.user?.mgr_id;
  const rawBinId = String(req.body.bin_id || req.body.display_bin_id || "").trim();
  const numericBinId = rawBinId.replace(/[^0-9]/g, "");
  const bin_id = numericBinId ? Number(numericBinId) : null;
  const installer_name = String(req.body.manager_name || req.body.installer_name || "").trim();
  const installer_phone = String(req.body.manager_phone || req.body.installer_phone || "").trim();

  if (!bin_id || !Number.isInteger(bin_id) || bin_id < 1) {
    return res.status(400).json({ message: "쓰레기통 ID를 입력해주세요." });
  }

  if (!bin_loc || !installed_at || !mgr_id) {
    return res.status(400).json({ message: "위치와 설치일을 입력하고 로그인 상태를 확인해주세요." });
  }

  const sql = `
    INSERT INTO t_trashbin
      (bin_id, bin_loc, installed_at, mgr_id, network_status, installer_name, installer_phone)
    VALUES
      (?, ?, ?, ?, ?, ?, ?)
  `;

  conn.query(sql, [bin_id, bin_loc, installed_at, mgr_id, network_status || 1, installer_name || null, installer_phone || null], (err) => {
    if (err) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(409).json({ message: "이미 등록된 쓰레기통 ID입니다." });
      }

      console.error("쓰레기통 등록 실패:", err);
      return res.status(500).json({ message: "쓰레기통 등록 실패" });
    }

    res.json({
      message: "쓰레기통이 등록되었습니다.",
      bin_id,
    });
  });
});
router.delete("/:bin_id", (req, res) => {
  const { bin_id } = req.params;

  const sql = `
    UPDATE t_trashbin
    SET network_status = 9
    WHERE bin_id = ?
  `;

  conn.query(sql, [bin_id], (err, result) => {
    if (err) {
      console.error("쓰레기통 휴지통 이동 실패:", err);
      return res.status(500).json({ message: "쓰레기통 휴지통 이동 실패" });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "이동할 쓰레기통을 찾을 수 없습니다." });
    }

    res.json({ message: "쓰레기통이 휴지통으로 이동되었습니다." });
  });
});

router.get("/sensor-history", (req, res) => {
  const sql = `
    SELECT *
    FROM (
      SELECT
        s.sensor_id,
        s.bin_id,
        b.bin_loc,
        b.network_status,
        s.temp,
        s.gas,
        s.flame,
        s.ir_count,
        s.fire_risk,
        s.created_at
      FROM t_sensor s
      INNER JOIN t_trashbin b ON b.bin_id = s.bin_id
      WHERE IFNULL(b.network_status, 1) <> 9
      ORDER BY s.created_at DESC, s.sensor_id DESC
      LIMIT 120
    ) recent_sensor
    ORDER BY created_at ASC, sensor_id ASC
  `;

  conn.query(sql, (err, rows) => {
    if (err) {
      console.error("센서 이력 조회 실패:", err);
      return res.status(500).json({ message: "센서 이력 조회 실패" });
    }

    res.json(filterRowsByRegion(req, rows, "bin_loc"));
  });
});

module.exports = router;






























