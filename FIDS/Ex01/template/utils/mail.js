let nodemailer = null;

try {
  nodemailer = require("nodemailer");
} catch (error) {
  nodemailer = null;
}

function hasMailConfig() {
  return Boolean(process.env.FIDS_MAIL_HOST && process.env.FIDS_MAIL_USER && process.env.FIDS_MAIL_PASS);
}

async function sendMail({ to, subject, text }) {
  if (!to) return;

  if (!nodemailer || !hasMailConfig()) {
    console.log("[FIDS mail preview]");
    console.log("to:", to);
    console.log("subject:", subject);
    console.log("text:", text);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.FIDS_MAIL_HOST,
    port: Number(process.env.FIDS_MAIL_PORT || 587),
    secure: process.env.FIDS_MAIL_SECURE === "true",
    auth: {
      user: process.env.FIDS_MAIL_USER,
      pass: process.env.FIDS_MAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.FIDS_MAIL_FROM || process.env.FIDS_MAIL_USER,
    to,
    subject,
    text,
  });
}

function sendManagerApprovalMail(manager) {
  const name = manager.mgr_name || "\uAD00\uB9AC\uC790";
  return sendMail({
    to: manager.mgr_email,
    subject: "[FIDS] \uAD00\uB9AC\uC790 \uACC4\uC815 \uC2B9\uC778\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    text: name + "\uB2D8, FIDS \uAD00\uB9AC\uC790 \uACC4\uC815 \uC2B9\uC778\uC774 \uC644\uB8CC\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC774\uC81C \uB85C\uADF8\uC778 \uD6C4 \uAD00\uB9AC\uC790 \uD398\uC774\uC9C0\uB97C \uC774\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  });
}

function sendManagerRejectMail(manager) {
  const name = manager.mgr_name || "\uAD00\uB9AC\uC790";
  return sendMail({
    to: manager.mgr_email,
    subject: "[FIDS] \uAD00\uB9AC\uC790 \uACC4\uC815 \uC2B9\uC778 \uC694\uCCAD\uC774 \uAC70\uC808\uB418\uC5C8\uC2B5\uB2C8\uB2E4.",
    text: name + "\uB2D8, FIDS \uAD00\uB9AC\uC790 \uACC4\uC815 \uC2B9\uC778 \uC694\uCCAD\uC774 \uAC70\uC808\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC790\uC138\uD55C \uB0B4\uC6A9\uC740 \uC6B4\uC601\uC790\uC5D0\uAC8C \uBB38\uC758\uD574\uC8FC\uC138\uC694.",
  });
}

module.exports = {
  sendManagerApprovalMail,
  sendManagerRejectMail,
};
