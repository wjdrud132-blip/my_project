function requireOperator(req, res, next) {
  const user = req.session && req.session.user;

  if (user && user.role === "operator") {
    return next();
  }

  if (req.originalUrl === "/admin/approval") {
    return res.redirect(user ? "/dashboard" : "/login");
  }

  return res.status(403).json({
    success: false,
    message: "운영자만 접근할 수 있습니다.",
  });
}

module.exports = requireOperator;
