function getUser(reqOrUser) {
  if (!reqOrUser) return {};
  if (reqOrUser.session && reqOrUser.session.user) return reqOrUser.session.user;
  return reqOrUser;
}

function isOperator(reqOrUser) {
  const user = getUser(reqOrUser);
  return user.role === "operator";
}

function parseRegions(value) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRegions(reqOrUser) {
  const user = getUser(reqOrUser);
  if (isOperator(user)) return null;
  const regions = parseRegions(user.assigned_regions || user.manager_regions || user.regions);
  return regions.length ? regions : null;
}

function normalizeLocation(location) {
  return String(location || "").replace(/\s+/g, " ").trim();
}

function locationMatchesRegions(location, regions) {
  if (!regions || !regions.length) return true;
  const normalized = normalizeLocation(location);
  return regions.some((region) => normalized.includes(region));
}

function canViewLocation(reqOrUser, location) {
  if (isOperator(reqOrUser)) return true;
  return locationMatchesRegions(location, getRegions(reqOrUser));
}

function filterRowsByRegion(reqOrUser, rows, locationKey = "bin_loc") {
  if (!Array.isArray(rows)) return [];
  if (isOperator(reqOrUser)) return rows;
  const regions = getRegions(reqOrUser);
  if (!regions) return rows;
  return rows.filter((row) => locationMatchesRegions(row[locationKey], regions));
}

function dedupeRowsByLocation(rows, locationKey = "bin_loc") {
  if (!Array.isArray(rows)) return [];

  const byLocation = new Map();
  rows.forEach((row) => {
    const location = normalizeLocation(row[locationKey]);
    const key = location || `__bin_${row.bin_id}`;
    const prev = byLocation.get(key);
    if (!prev || Number(row.bin_id) < Number(prev.bin_id)) {
      byLocation.set(key, row);
    }
  });

  return Array.from(byLocation.values());
}

function buildLocationWhere(reqOrUser, column = "bin_loc") {
  if (isOperator(reqOrUser)) return { clause: "", params: [] };
  const regions = getRegions(reqOrUser);
  if (!regions || !regions.length) return { clause: "", params: [] };

  const conditions = regions.map(() => `${column} LIKE ?`).join(" OR ");
  return {
    clause: ` AND (${conditions})`,
    params: regions.map((region) => `%${region}%`),
  };
}

module.exports = {
  getRegions,
  isOperator,
  canViewLocation,
  filterRowsByRegion,
  dedupeRowsByLocation,
  buildLocationWhere,
};