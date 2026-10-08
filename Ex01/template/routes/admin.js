const express = require("express");
const router = express.Router();

const conn = require("../config/db");
const requireOperator = require("../middlewares/requireOperator");
const { sendManagerApprovalMail, sendManagerRejectMail } = require("../utils/mail");

const GWANGJU_DONGS_BY_DISTRICT = {
  "동구": ["충장동", "동명동", "계림1동", "계림2동", "산수1동", "산수2동", "지산1동", "지산2동", "서남동", "학동", "학운동", "지원1동", "지원2동"],
  "남구": ["양림동", "방림1동", "방림2동", "봉선1동", "봉선2동", "사직동", "월산동", "월산4동", "월산5동", "백운1동", "백운2동", "주월1동", "주월2동", "진월동", "효덕동", "송암동", "대촌동"],
  "북구": ["중흥1동", "중흥2동", "중흥3동", "중앙동", "임동", "신안동", "용봉동", "운암1동", "운암2동", "운암3동", "동림동", "우산동", "풍향동", "문화동", "문흥1동", "문흥2동", "두암1동", "두암2동", "두암3동", "삼각동", "일곡동", "매곡동", "오치1동", "오치2동", "석곡동", "건국동", "양산동", "신용동"],
  "광산구": ["송정1동", "송정2동", "도산동", "신흥동", "어룡동", "우산동", "월곡1동", "월곡2동", "비아동", "첨단1동", "첨단2동", "신가동", "운남동", "수완동", "하남동", "임곡동", "동곡동", "평동", "삼도동", "본량동", "신창동"],
  "서구": ["양동", "양3동", "농성1동", "농성2동", "광천동", "유덕동", "치평동", "상무1동", "상무2동", "화정1동", "화정2동", "화정3동", "화정4동", "서창동", "금호1동", "금호2동", "풍암동", "동천동"],
};
const GWANGJU_DISTRICTS = Object.keys(GWANGJU_DONGS_BY_DISTRICT);

const MSG = {
  pendingListFail: "승인 대기 목록 조회 실패",
  approvedListFail: "승인 완료 목록 조회 실패",
  rejectedListFail: "거절 처리 목록 조회 실패",
  idRequired: "관리자 ID가 필요합니다.",
  lookupFail: "관리자 조회 실패",
  notFound: "관리자를 찾을 수 없습니다.",
  approveFail: "관리자 승인 실패",
  approveMailFail: "관리자 승인은 완료되었지만 이메일 발송은 실패했습니다.",
  approveDone: "관리자 승인이 완료되었고 승인 완료 이메일을 발송했습니다.",
  rejectFail: "관리자 거절 실패",
  rejectMailFail: "관리자 가입 요청은 거절되었지만 이메일 발송은 실패했습니다.",
  rejectDone: "관리자 가입 요청을 거절했고 거절 이메일을 발송했습니다.",
};

function normalizeRegions(value) {
  const list = Array.isArray(value) ? value : String(value || "").split(",");
  return Array.from(new Set(
    list
      .map((item) => String(item || "").trim())
      .filter((item) => item.length > 0 && item.length <= 30)
      .filter((item) => /^[\uAC00-\uD7A30-9\s\u00B7.-]+$/.test(item))
  ));
}

function extractDistrict(value) {
  const text = String(value || "");
  return GWANGJU_DISTRICTS.find((district) => text.includes(district)) || "";
}

function fetchDongsByDistrict(district) {
  const normalizedDistrict = extractDistrict(district);
  if (!normalizedDistrict) return [];
  return [...(GWANGJU_DONGS_BY_DISTRICT[normalizedDistrict] || [])];
}

function ensureAdminColumns(callback) {
  const alters = [
    "ALTER TABLE t_manager ADD COLUMN mgr_org VARCHAR(100) NULL",
    "ALTER TABLE t_manager ADD COLUMN assigned_regions VARCHAR(255) NULL",
    "ALTER TABLE t_manager MODIFY COLUMN assigned_regions VARCHAR(1000) NULL",
    "ALTER TABLE t_manager ADD COLUMN approval_status VARCHAR(20) NULL",
    "ALTER TABLE t_manager ADD COLUMN rejected_at DATETIME NULL",
  ];

  let index = 0;
  function next() {
    if (index >= alters.length) return callback(null);
    conn.query(alters[index], (err) => {
      index += 1;
      if (err && err.code !== "ER_DUP_FIELDNAME") return callback(err);
      next();
    });
  }

  next();
}

function managerSelect(whereClause) {
  return `
    SELECT mgr_id, mgr_email, mgr_name, mgr_phone, mgr_org, assigned_regions, approval_status, is_approved, joined_at, rejected_at
    FROM t_manager
    WHERE ${whereClause}
      AND role = 'manager'
    ORDER BY COALESCE(rejected_at, joined_at) DESC, mgr_id DESC
  `;
}

function getManagerById(mgrId, callback) {
  ensureAdminColumns((columnErr) => {
    if (columnErr) return callback(columnErr);

    const sql = `
      SELECT mgr_id, mgr_email, mgr_name, mgr_phone, mgr_org, assigned_regions, approval_status, is_approved, joined_at, rejected_at
      FROM t_manager
      WHERE mgr_id = ?
        AND role = 'manager'
    `;

    conn.query(sql, [mgrId], (err, rows) => {
      if (err) return callback(err);
      callback(null, rows[0]);
    });
  });
}

router.get("/regions/dongs", requireOperator, async (req, res) => {
  const district = extractDistrict(req.query.district || req.query.org);
  if (!district) {
    return res.status(400).json({ success: false, message: "\uAD11\uC8FC\uAD11\uC5ED\uC2DC \uAD6C \uC815\uBCF4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", dongs: [] });
  }

  try {
    const dongs = await fetchDongsByDistrict(district);
    res.json({ success: true, district, dongs });
  } catch (error) {
    console.error("\uB3D9 \uBAA9\uB85D \uC870\uD68C \uC2E4\uD328:", error.message);
    res.status(500).json({ success: false, message: error.message, district, dongs: [] });
  }
});

router.get("/managers", requireOperator, (req, res) => {
  ensureAdminColumns((columnErr) => {
    if (columnErr) {
      console.error("admin column ensure failed:", columnErr);
      return res.status(500).json({ message: MSG.pendingListFail });
    }

    conn.query(managerSelect("is_approved = '0' AND (approval_status IS NULL OR approval_status = 'pending')"), (err, rows) => {
      if (err) {
        console.error("pending manager list failed:", err);
        return res.status(500).json({ message: MSG.pendingListFail });
      }

      res.json(rows);
    });
  });
});

router.get("/managers/approved", requireOperator, (req, res) => {
  ensureAdminColumns((columnErr) => {
    if (columnErr) {
      console.error("admin column ensure failed:", columnErr);
      return res.status(500).json({ message: MSG.approvedListFail });
    }

    conn.query(managerSelect("is_approved = '1' AND (approval_status IS NULL OR approval_status = 'approved')"), (err, rows) => {
      if (err) {
        console.error("approved manager list failed:", err);
        return res.status(500).json({ message: MSG.approvedListFail });
      }

      res.json(rows);
    });
  });
});

router.get("/managers/rejected", requireOperator, (req, res) => {
  ensureAdminColumns((columnErr) => {
    if (columnErr) {
      console.error("admin column ensure failed:", columnErr);
      return res.status(500).json({ message: MSG.rejectedListFail });
    }

    conn.query(managerSelect("approval_status = 'rejected'"), (err, rows) => {
      if (err) {
        console.error("rejected manager list failed:", err);
        return res.status(500).json({ message: MSG.rejectedListFail });
      }

      res.json(rows);
    });
  });
});

router.post("/managers/approve", requireOperator, (req, res) => {
  const { mgr_id } = req.body;
  const assignedRegions = normalizeRegions(req.body.assigned_regions || req.body.regions);

  if (!mgr_id) {
    return res.status(400).json({ message: MSG.idRequired });
  }

  getManagerById(mgr_id, (findErr, manager) => {
    if (findErr) {
      console.error("manager lookup failed:", findErr);
      return res.status(500).json({ message: MSG.lookupFail });
    }

    if (!manager) {
      return res.status(404).json({ message: MSG.notFound });
    }

    const sql = `
      UPDATE t_manager
      SET is_approved = '1',
          approval_status = 'approved',
          assigned_regions = ?,
          rejected_at = NULL
      WHERE mgr_id = ?
        AND role = 'manager'
    `;

    conn.query(sql, [assignedRegions.join(","), mgr_id], async (err) => {
      if (err) {
        console.error("manager approve failed:", err);
        return res.status(500).json({ message: MSG.approveFail });
      }

      try {
        await sendManagerApprovalMail(manager);
      } catch (mailErr) {
        console.error("approval mail failed:", mailErr);
        return res.json({ message: MSG.approveMailFail });
      }

      res.json({ message: MSG.approveDone });
    });
  });
});

router.post("/managers/reject", requireOperator, (req, res) => {
  const { mgr_id } = req.body;

  if (!mgr_id) {
    return res.status(400).json({ message: MSG.idRequired });
  }

  getManagerById(mgr_id, (findErr, manager) => {
    if (findErr) {
      console.error("manager lookup failed:", findErr);
      return res.status(500).json({ message: MSG.lookupFail });
    }

    if (!manager) {
      return res.status(404).json({ message: MSG.notFound });
    }

    const sql = `
      UPDATE t_manager
      SET is_approved = '0',
          approval_status = 'rejected',
          rejected_at = NOW()
      WHERE mgr_id = ?
        AND role = 'manager'
        AND is_approved = '0'
        AND (approval_status IS NULL OR approval_status = 'pending')
    `;

    conn.query(sql, [mgr_id], async (err) => {
      if (err) {
        console.error("manager reject failed:", err);
        return res.status(500).json({ message: MSG.rejectFail });
      }

      try {
        await sendManagerRejectMail(manager);
      } catch (mailErr) {
        console.error("reject mail failed:", mailErr);
        return res.json({ message: MSG.rejectMailFail });
      }

      res.json({ message: MSG.rejectDone });
    });
  });
});

module.exports = router;