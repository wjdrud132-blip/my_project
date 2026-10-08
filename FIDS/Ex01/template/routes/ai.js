const express = require("express");
const { judgeDanger, defaultThresholds } = require("../utils/aiJudge");

const router = express.Router();

router.post("/judge", (req, res) => {
  const row = {
    bin_id: req.body.bin_id,
    bin_loc: req.body.location || req.body.bin_loc,
    alert_type: req.body.alert_type || "normal",
    alert_msg: req.body.alert_msg || `\uC628\uB3C4 ${req.body.temperature} / \uC5F0\uAE30 \uAC10\uC9C0\uAC12 ${req.body.smoke} / \uBD88\uAF43 \uAC10\uC9C0 ${req.body.flame}`,
  };
  const thresholds = {
    dangerTemp: Number(req.body.dangerTemp) || defaultThresholds.dangerTemp,
    warningTemp: Number(req.body.warningTemp) || defaultThresholds.warningTemp,
    dangerSmoke: Number(req.body.dangerSmoke) || defaultThresholds.dangerSmoke,
    warningSmoke: Number(req.body.warningSmoke) || defaultThresholds.warningSmoke,
  };
  const result = judgeDanger(row, thresholds, req.body.enabled !== false);
  res.json({ success: true, ...result });
});

module.exports = router;
