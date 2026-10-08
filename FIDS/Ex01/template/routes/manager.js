const express = require("express");
const router = express.Router();
const conn = require("../config/db");

const emailCodes = {};
const EMAIL_CODE_TTL_MS = 5 * 60 * 1000;
const passwordResetCodes = {};
const passwordResetVerified = {};

function ensureManagerOrgColumn(callback) {
  const alters = [
    "ALTER TABLE t_manager ADD COLUMN mgr_org VARCHAR(100) NULL",
    "ALTER TABLE t_manager ADD COLUMN assigned_regions VARCHAR(255) NULL",
    "ALTER TABLE t_manager ADD COLUMN approval_status VARCHAR(20) NULL",
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

router.post("/email/send", (req, res) => {
  const { mgr_email } = req.body;

  if (!mgr_email) {
    return res.send("이메일을 입력해주세요.");
  }

  const email = mgr_email.trim();

  conn.query("SELECT mgr_id FROM t_manager WHERE mgr_email = ?", [email], (err, rows) => {
    if (err) {
      console.error("이메일 중복 확인 실패:", err);
      return res.status(500).send("이메일 중복 확인에 실패했습니다.");
    }

    if (rows.length > 0) {
      return res.status(409).send("중복된 이메일입니다.");
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    emailCodes[email] = {
      code,
      expiresAt: Date.now() + EMAIL_CODE_TTL_MS
    };

    console.log("이메일:", email);
    console.log("인증번호:", code);

    res.send("인증번호가 발송되었습니다.");
  });
});

router.post("/email/check", (req, res) => {
  const { mgr_email, code } = req.body;

  if (!mgr_email || !code) {
    return res.send("이메일과 인증번호를 입력해주세요.");
  }

  const email = mgr_email.trim();
  const inputCode = String(code).trim();
  const saved = emailCodes[email];

  if (!saved) {
    return res.status(400).send("인증번호를 먼저 발송해주세요.");
  }

  const savedCode = typeof saved === "string" ? saved : saved.code;
  const expiresAt = typeof saved === "string" ? 0 : saved.expiresAt;

  if (expiresAt && Date.now() > expiresAt) {
    delete emailCodes[email];
    return res.status(410).send("인증 시간이 만료되었습니다. 인증번호를 다시 발송해주세요.");
  }

  if (savedCode === inputCode) {
    delete emailCodes[email];
    return res.send("이메일 인증 성공");
  }

  res.send("인증번호가 일치하지 않습니다.");
});


router.post("/password/send-code", (req, res) => {
  const { mgr_email } = req.body;
  if (!mgr_email) {
    return res.json({ success: false, message: "\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }

  const email = mgr_email.trim();
  conn.query("SELECT mgr_id FROM t_manager WHERE mgr_email = ?", [email], (err, rows) => {
    if (err) {
      console.error("password reset account lookup failed:", err);
      return res.status(500).json({ success: false, message: "\uC11C\uBC84 \uC624\uB958\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4." });
    }

    if (!rows.length) {
      return res.json({ success: false, message: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uACC4\uC815\uC785\uB2C8\uB2E4." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    passwordResetCodes[email] = code;
    passwordResetVerified[email] = false;

    console.log("[\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30] \uC774\uBA54\uC77C:", email);
    console.log("[\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30] \uC778\uC99D\uBC88\uD638:", code);

    res.json({ success: true, message: "\uC778\uC99D\uBC88\uD638\uAC00 \uBC1C\uC1A1\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
  });
});

router.post("/password/verify-code", (req, res) => {
  const { mgr_email, code } = req.body;
  if (!mgr_email || !code) {
    return res.json({ success: false, message: "\uC774\uBA54\uC77C\uACFC \uC778\uC99D\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }

  const email = mgr_email.trim();
  const inputCode = String(code).trim();
  if (passwordResetCodes[email] !== inputCode) {
    return res.json({ success: false, message: "\uC778\uC99D\uBC88\uD638\uAC00 \uC77C\uCE58\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." });
  }

  passwordResetVerified[email] = true;
  res.json({ success: true, message: "\uC774\uBA54\uC77C \uC778\uC99D\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
});

router.post("/password/reset", (req, res) => {
  const { mgr_email, mgr_pw } = req.body;
  if (!mgr_email || !mgr_pw) {
    return res.json({ success: false, message: "\uC774\uBA54\uC77C\uACFC \uC0C8 \uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }

  const email = mgr_email.trim();
  const password = String(mgr_pw).trim();
  if (!passwordResetVerified[email]) {
    return res.json({ success: false, message: "\uC774\uBA54\uC77C \uC778\uC99D\uC744 \uBA3C\uC800 \uC644\uB8CC\uD574\uC8FC\uC138\uC694." });
  }
  if (password.length < 8) {
    return res.json({ success: false, message: "\uBE44\uBC00\uBC88\uD638\uB294 8\uC790 \uC774\uC0C1\uC73C\uB85C \uC785\uB825\uD574\uC8FC\uC138\uC694." });
  }

  conn.query("UPDATE t_manager SET mgr_pw = ? WHERE mgr_email = ?", [password, email], (err, result) => {
    if (err) {
      console.error("password reset failed:", err);
      return res.status(500).json({ success: false, message: "\uBE44\uBC00\uBC88\uD638 \uC7AC\uC124\uC815\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4." });
    }
    if (result.affectedRows === 0) {
      return res.json({ success: false, message: "\uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uACC4\uC815\uC785\uB2C8\uB2E4." });
    }

    delete passwordResetCodes[email];
    delete passwordResetVerified[email];
    res.json({ success: true, message: "\uBE44\uBC00\uBC88\uD638\uAC00 \uC7AC\uC124\uC815\uB418\uC5C8\uC2B5\uB2C8\uB2E4." });
  });
});

router.get("/test", (req, res) => {
  res.send("manager router 연결 성공");
});

router.post("/join", (req, res) => {
  const { mgr_email, mgr_pw, mgr_name, mgr_phone, mgr_org } = req.body;

  if (!mgr_email || !mgr_pw || !mgr_name) {
    return res.send("필수 회원정보가 누락되었습니다.");
  }

  if (!mgr_phone || !mgr_phone.trim()) {
    return res.status(400).send("\uD734\uB300\uC804\uD654 \uBC88\uD638\uB294 \uD544\uC218\uC785\uB2C8\uB2E4.");
  }

  const email = mgr_email.trim();
  const password = mgr_pw.trim();
  const name = mgr_name.trim();
  const phone = mgr_phone.trim();
  const org = mgr_org ? mgr_org.trim() : "";

  const sql = `
    INSERT INTO t_manager
    (mgr_email, mgr_pw, mgr_name, mgr_phone, mgr_org, is_approved, role)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  ensureManagerOrgColumn((columnErr) => {
    if (columnErr) {
      console.error("소속기관 컬럼 확인 실패:", columnErr);
      return res.send("회원가입 신청 실패");
    }

    conn.query("SELECT mgr_id FROM t_manager WHERE mgr_email = ?", [email], (dupErr, rows) => {
      if (dupErr) {
        console.error("이메일 중복 확인 실패:", dupErr);
        return res.status(500).send("이메일 중복 확인에 실패했습니다.");
      }

      if (rows.length > 0) {
        return res.status(409).send("중복된 이메일입니다.");
      }

      conn.query(sql, [email, password, name, phone, org, 0, "manager"], (err) => {
        if (err) {
          console.error("회원가입 신청 실패:", err);

          if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).send("중복된 이메일입니다.");
          }

          return res.send("회원가입 신청 실패");
        }

        res.send("회원가입 신청 완료");
      });
    });
  });
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

router.post("/login", (req, res) => {
  const { mgr_email, mgr_pw } = req.body;

  if (!mgr_email || !mgr_pw) {
    return res.json({ success: false, message: "이메일과 비밀번호를 입력해주세요." });
  }

  ensureManagerOrgColumn((columnErr) => {
    if (columnErr) {
      console.error("소속기관 컬럼 확인 실패:", columnErr);
      return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
    }

    const sql = `
      SELECT mgr_id, mgr_email, mgr_pw, mgr_name, mgr_org, assigned_regions, approval_status, is_approved, role
      FROM t_manager
      WHERE mgr_email = ?
    `;

    conn.query(sql, [mgr_email], (err, rows) => {
      if (err) {
        console.error("로그인 조회 실패:", err);
        return res.status(500).json({ success: false, message: "서버 오류가 발생했습니다." });
      }

      if (rows.length === 0) {
        return res.json({ success: false, message: "존재하지 않는 계정입니다." });
      }

      const user = rows[0];

      if (user.mgr_pw !== mgr_pw) {
        return res.json({ success: false, message: "비밀번호가 일치하지 않습니다." });
      }

      if (user.role !== "operator" && (user.approval_status === "rejected" || Number(user.is_approved) === -1)) {
        return res.json({ success: false, message: "관리자 가입 요청이 거절된 계정입니다." });
      }

      if (user.role !== "operator" && Number(user.is_approved) !== 1) {
        return res.json({ success: false, message: "관리자 승인 대기 중입니다." });
      }

      req.session.user = {
        user_id: user.mgr_id,
        mgr_id: user.mgr_id,
        email: user.mgr_email,
        mgr_email: user.mgr_email,
        name: user.mgr_name,
        mgr_name: user.mgr_name,
        mgr_org: user.mgr_org,
        assigned_regions: user.assigned_regions,
        role: user.role,
        approval_status: user.approval_status || user.is_approved,
      };

      return res.json({
        success: true,
        message: user.role === "operator" ? "운영자 로그인 성공" : "로그인 성공",
        role: user.role,
        redirect: user.role === "operator" ? "/admin/approval" : "/dashboard",
        user: {
          mgr_id: user.mgr_id,
          mgr_email: user.mgr_email,
          mgr_name: user.mgr_name,
          mgr_org: user.mgr_org,
          assigned_regions: user.assigned_regions,
        },
      });
    });
  });
});

module.exports = router;
