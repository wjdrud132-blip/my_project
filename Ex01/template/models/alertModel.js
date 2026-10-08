const conn = require("../config/db");
const { filterRowsByRegion, buildLocationWhere } = require("../utils/regionScope");

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    conn.query(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }

      resolve(rows);
    });
  });
}

async function getLogs(req) {
  const sql = `
    SELECT
      a.alert_id,
      a.bin_id,
      a.bin_id AS display_bin_id,
      a.alert_type,
      a.alert_msg,
      a.alerted_at,
      a.is_received,
      a.received_at,
      b.bin_loc,
      b.installed_at,
      s.temp AS temp_value,
      s.gas AS smoke_value,
      s.flame AS flame_value
    FROM t_alert a
    LEFT JOIN t_trashbin b ON a.bin_id = b.bin_id
    LEFT JOIN t_sensor s
      ON s.sensor_id = (
        SELECT s2.sensor_id
        FROM t_sensor s2
        WHERE s2.bin_id = a.bin_id
        AND s2.created_at <= a.alerted_at
        ORDER BY s2.created_at DESC, s2.sensor_id DESC
        LIMIT 1
      )
    WHERE (b.network_status IS NULL OR b.network_status <> 9)
      AND a.alert_type <> 'normal'
      AND a.alert_id = (
        SELECT MIN(a2.alert_id)
        FROM t_alert a2
        WHERE a2.bin_id = a.bin_id
          AND a2.alert_type = a.alert_type
          AND a2.alerted_at = a.alerted_at
      )
    ORDER BY
      a.alerted_at DESC,
      a.alert_id DESC
  `;

  return filterRowsByRegion(req, await query(sql), "bin_loc");
}

async function getStats(req) {
  const rows = await getLogs(req);

  return {
    total: rows.length,
    danger: rows.filter((row) => row.alert_type === "danger").length,
    warning: rows.filter((row) => row.alert_type === "warning").length,
    normal: rows.filter((row) => row.alert_type === "normal").length
  };
}

async function markAllRead(req) {
  const scope = buildLocationWhere(req, "b.bin_loc");
  const sql = `
    UPDATE t_alert a
    LEFT JOIN t_trashbin b ON a.bin_id = b.bin_id
    SET
      a.received_at = COALESCE(a.received_at, NOW()),
      a.is_received = 'Y'
    WHERE (a.is_received <> 'Y' OR a.received_at IS NULL)
      AND a.alert_type <> 'normal'
      AND (b.network_status IS NULL OR b.network_status <> 9)
      ${scope.clause}
  `;

  return await query(sql, scope.params);
}


async function markSelectedRead(req, alertIds) {
  const ids = (Array.isArray(alertIds) ? alertIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!ids.length) return { changedRows: 0 };

  const scope = buildLocationWhere(req, "b.bin_loc");
  const placeholders = ids.map(() => "?").join(",");
  const sql = `
    UPDATE t_alert a
    LEFT JOIN t_trashbin b ON a.bin_id = b.bin_id
    SET
      a.received_at = COALESCE(a.received_at, NOW()),
      a.is_received = 'Y'
    WHERE a.alert_id IN (${placeholders})
      AND (a.is_received <> 'Y' OR a.received_at IS NULL)
      AND a.alert_type <> 'normal'
      AND (b.network_status IS NULL OR b.network_status <> 9)
      ${scope.clause}
  `;

  return await query(sql, [...ids, ...scope.params]);
}

async function deleteSelected(req, alertIds) {
  const ids = (Array.isArray(alertIds) ? alertIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);

  if (!ids.length) return { affectedRows: 0 };

  const scope = buildLocationWhere(req, "b.bin_loc");
  const placeholders = ids.map(() => "?").join(",");

  const sql = `
    DELETE a
    FROM t_alert a
    INNER JOIN (
      SELECT *
      FROM (
        SELECT DISTINCT
          a0.bin_id,
          a0.alert_type,
          a0.alerted_at
        FROM t_alert a0
        LEFT JOIN t_trashbin b
          ON a0.bin_id = b.bin_id
        WHERE a0.alert_id IN (${placeholders})
          ${scope.clause}
      ) target_rows
    ) target
      ON target.bin_id = a.bin_id
      AND target.alert_type = a.alert_type
      AND target.alerted_at = a.alerted_at
  `;

  return await query(sql, [...ids, ...scope.params]);
}
module.exports = {
  getLogs,
  getStats,
  markAllRead,
  markSelectedRead,
  deleteSelected
};









