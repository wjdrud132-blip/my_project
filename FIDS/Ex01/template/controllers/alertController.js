const alertModel = require("../models/alertModel");

exports.renderAlertPage = (req, res) => {
  res.render("alert");
};

exports.getLogs = async (req, res) => {
  try {
    const rows = await alertModel.getLogs(req);

    res.json({
      success: true,
      rows
    });
  } catch (err) {
    console.error("알림 기록 조회 실패:", err);

    res.status(500).json({
      success: false,
      message: "알림 기록 조회 실패"
    });
  }
};

exports.getStats = async (req, res) => {
  try {
    const stats = await alertModel.getStats(req);

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error("알림 통계 조회 실패:", err);

    res.status(500).json({
      success: false,
      message: "알림 통계 조회 실패"
    });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const result = await alertModel.markAllRead(req);

    res.json({
      success: true,
      message: "전체 읽음 처리 완료",
      changedRows: result.changedRows
    });
  } catch (err) {
    console.error("전체 읽음 처리 실패:", err);

    res.status(500).json({
      success: false,
      message: "전체 읽음 처리 실패"
    });
  }
};

exports.markSelectedRead = async (req, res) => {
  try {
    const result = await alertModel.markSelectedRead(req, req.body.alertIds);

    res.json({
      success: true,
      message: "선택 읽음 처리 완료",
      changedRows: result.changedRows
    });
  } catch (err) {
    console.error("선택 읽음 처리 실패:", err);

    res.status(500).json({
      success: false,
      message: "선택 읽음 처리 실패"
    });
  }
};

exports.deleteSelected = async (req, res) => {
  try {
    const result = await alertModel.deleteSelected(req, req.body.alertIds);

    res.json({
      success: true,
      message: "알림 기록 삭제 완료",
      deletedRows: result.affectedRows || 0
    });
  } catch (err) {
    console.error("알림 기록 삭제 실패:", err);

    res.status(500).json({
      success: false,
      message: "알림 기록 삭제 실패"
    });
  }
};