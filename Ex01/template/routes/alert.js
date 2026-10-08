const express = require("express");
const router = express.Router();

const conn = require("../config/db");
const { filterRowsByRegion, dedupeRowsByLocation, buildLocationWhere } = require("../utils/regionScope");
const { judgeDanger, defaultThresholds, trainSensorModel } = require("../utils/aiJudge");

function displayBinId(binId) {
  return binId;
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    conn.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}


async function getThresholds() {
  try {
    const rows = await query("SELECT danger_temp, warning_temp, danger_gas, warning_gas FROM t_fire_threshold WHERE id = 1");
    const row = rows && rows[0];
    if (!row) return defaultThresholds;
    return {
      dangerTemp: Number(row.danger_temp),
      warningTemp: Number(row.warning_temp),
      dangerSmoke: Number(row.danger_gas),
      warningSmoke: Number(row.warning_gas),
    };
  } catch (err) {
    return defaultThresholds;
  }
}

async function getAiEnabled() {
  try {
    const rows = await query("SELECT setting_value FROM t_system_setting WHERE setting_key = 'aiJudge'");
    return rows && rows[0] ? rows[0].setting_value !== "N" : true;
  } catch (err) {
    return true;
  }
}

let cachedSensorModel = null;
let cachedSensorModelAt = 0;
const SENSOR_MODEL_CACHE_MS = 300000;

async function getSensorModel(thresholds) {
  const now = Date.now();
  if (cachedSensorModel && now - cachedSensorModelAt < SENSOR_MODEL_CACHE_MS) {
    return cachedSensorModel;
  }

  try {
    const rows = await query(`
      SELECT
        bin_id,
        temp,
        gas,
        flame,
        fire_risk,
        CASE
          WHEN prev_created_at IS NULL OR TIMESTAMPDIFF(SECOND, prev_created_at, created_at) <= 0 THEN NULL
          ELSE GREATEST(temp - prev_temp, 0) / GREATEST(TIMESTAMPDIFF(SECOND, prev_created_at, created_at) / 60, 1)
        END AS temp_change,
        CASE
          WHEN prev_created_at IS NULL OR TIMESTAMPDIFF(SECOND, prev_created_at, created_at) <= 0 THEN NULL
          ELSE GREATEST(gas - prev_gas, 0) / GREATEST(TIMESTAMPDIFF(SECOND, prev_created_at, created_at) / 60, 1)
        END AS gas_change
      FROM (
        SELECT
          s.*,
          LAG(s.temp) OVER (PARTITION BY s.bin_id ORDER BY s.created_at, s.sensor_id) AS prev_temp,
          LAG(s.gas) OVER (PARTITION BY s.bin_id ORDER BY s.created_at, s.sensor_id) AS prev_gas,
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
    `);

    cachedSensorModel = trainSensorModel(rows, thresholds);
    cachedSensorModelAt = now;
    return cachedSensorModel;
  } catch (err) {
    console.error("AI 학습 데이터 조회 실패:", err);
    return { available: false, sampleCount: 0 };
  }
}

async function getScopedAlerts(req) {
  const sql = `
    SELECT
      COALESCE(a.alert_id, b.bin_id) AS alert_id,
      b.bin_id,
      CASE
        WHEN s.fire_risk = 2 THEN 'danger'
        WHEN s.fire_risk = 1 THEN 'warning'
        WHEN a.alert_type IS NOT NULL THEN a.alert_type
        ELSE 'normal'
      END AS rule_status,
      COALESCE(a.alert_msg, '') AS alert_msg,
      COALESCE(s.created_at, a.alerted_at, b.created_at) AS alerted_at,
      COALESCE(a.is_received, 'N') AS is_received,
      b.bin_loc,
      b.installed_at,
      s.temp AS temp_value,
      s.gas AS smoke_value,
      s.flame AS flame_value,
      s.fire_risk
    FROM t_trashbin b
    LEFT JOIN t_sensor s
      ON s.sensor_id = (
        SELECT s2.sensor_id
        FROM t_sensor s2
        WHERE s2.bin_id = b.bin_id
        ORDER BY s2.created_at DESC, s2.sensor_id DESC
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
  `

  const thresholds = await getThresholds();
  const aiEnabled = await getAiEnabled();
  const rows = dedupeRowsByLocation(filterRowsByRegion(req, await query(sql), "bin_loc"), "bin_loc");

  return rows.map((row) => {
    const ai = judgeDanger({ ...row, alert_type: row.rule_status, alert_msg: row.alert_msg || "" }, thresholds, aiEnabled);
    return {
      ...row,
      display_bin_id: displayBinId(row.bin_id),
      alert_type: ai.status,
      ai_enabled: aiEnabled ? "Y" : "N",
      temp_value: ai.sensor.temp,
      smoke_value: ai.sensor.smoke,
      flame_value: ai.sensor.flame,
    };
  }).sort((a, b) => {
    const rank = (type) => type === "danger" ? 1 : type === "warning" ? 2 : 3;
    return rank(a.alert_type) - rank(b.alert_type) || new Date(b.alerted_at) - new Date(a.alerted_at) || Number(a.bin_id) - Number(b.bin_id);
  });
}

router.get("/danger/latest", async (req, res) => {
  try {
    const danger = (await getScopedAlerts(req)).find((row) => row.alert_type === "danger");
    if (!danger) return res.json({ hasDanger: false });

    res.json({
      hasDanger: true,
      alert_id: danger.alert_id,
      bin_id: danger.bin_id,
      display_bin_id: displayBinId(danger.bin_id),
      location: danger.bin_loc,
      alert_msg: danger.alert_msg,
      alerted_at: danger.alerted_at,
      temp_value: danger.temp_value,
      smoke_value: danger.smoke_value,
      flame_value: danger.flame_value,
    });
  } catch (err) {
    console.error("위험 알림 조회 실패:", err);
    res.status(500).json({ hasDanger: false, message: "위험 알림 조회 실패" });
  }
});

router.get("/list", async (req, res) => {
  try {
    res.json(await getScopedAlerts(req));
  } catch (err) {
    console.error("알림 목록 조회 실패:", err);
    res.status(500).json({ message: "알림 목록 조회 실패" });
  }
});


router.get("/daily-records", async (req, res) => {
  try {
    const scope = buildLocationWhere(req, "b.bin_loc");

    const sql = `
      SELECT
        s.sensor_id AS alert_id,
        b.bin_id,
        b.bin_id AS display_bin_id,
        b.bin_loc,
        b.installed_at,
        b.network_status,

        s.sensor_id,
        s.temp AS temp_value,
        s.gas AS smoke_value,
        s.flame AS flame_value,
        s.fire_risk,
        s.created_at AS alerted_at,
        DATE_FORMAT(s.created_at, '%Y-%m-%d') AS record_date,

        CASE
          WHEN s.fire_risk = 2 THEN 'danger'
          WHEN s.fire_risk = 1 THEN 'warning'
          ELSE 'normal'
        END AS alert_type,

        '' AS alert_msg,
        'N' AS is_received,
        NULL AS received_at
      FROM t_sensor s
      INNER JOIN t_trashbin b
        ON b.bin_id = s.bin_id
      WHERE s.created_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
        AND s.fire_risk IN (1, 2)
        AND IFNULL(b.network_status, 1) <> 9
        ${scope.clause}
      ORDER BY s.created_at DESC, s.sensor_id DESC
      LIMIT 3000
    `;

    const rawRows = await query(sql, scope.params);

    const bestByBinDate = new Map();
    const severityRank = (type) => type === "danger" ? 1 : type === "warning" ? 2 : 3;

    rawRows.forEach((row) => {
      const key = `${row.bin_id}-${row.record_date}`;
      const old = bestByBinDate.get(key);

      const rowRank = severityRank(row.alert_type);
      const oldRank = old ? severityRank(old.alert_type) : 99;

      if (!old || rowRank < oldRank || (rowRank === oldRank && new Date(row.alerted_at) > new Date(old.alerted_at))) {
        bestByBinDate.set(key, row);
      }
    });

    const rows = Array.from(bestByBinDate.values())
      .sort((a, b) => new Date(b.alerted_at) - new Date(a.alerted_at) || Number(a.bin_id) - Number(b.bin_id))
      .map((row) => ({
        ...row,
        display_bin_id: displayBinId(row.bin_id),
      }));

    res.json(rows);
  } catch (err) {
    console.error("날짜별 센서 기록 조회 실패:", err);
    res.status(500).json({ message: "날짜별 센서 기록 조회 실패" });
  }
});
router.post("/read-all", async (req, res) => {
  try {
    const scope = buildLocationWhere(req, "b.bin_loc");
    const result = await query(`
      UPDATE t_alert a
      LEFT JOIN t_trashbin b ON a.bin_id = b.bin_id
      SET
        a.received_at = COALESCE(a.received_at, NOW()),
        a.is_received = 'Y'
      WHERE (a.is_received <> 'Y' OR a.received_at IS NULL)
        AND a.alert_type <> 'normal'
        AND (b.network_status IS NULL OR b.network_status <> 9)
        ${scope.clause}
    `, scope.params);

    res.json({
      message: "모든 알림을 읽음 처리했습니다.",
      changedRows: result.changedRows || 0,
    });
  } catch (err) {
    console.error("상단 알림 전체 읽음 처리 실패:", err);
    res.status(500).json({ message: "모든 알림 읽음 처리 실패" });
  }
});

module.exports = router;
















