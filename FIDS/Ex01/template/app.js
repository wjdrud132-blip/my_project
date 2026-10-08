const express = require("express");
const session = require("express-session");
const conn = require("./config/db");
const managerRouter = require("./routes/manager");
const adminRouter = require("./routes/admin");
const alertRouter = require("./routes/alert");
const trashbinRouter = require("./routes/trashbin");
const alertRecordRouter = require("./routes/alertRouter");
const settingsRouter = require("./routes/settings");
const aiRouter = require("./routes/ai");
const requireOperator = require("./middlewares/requireOperator");

const app = express();

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: "fids-session-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 8
  }
}));


const protectedPagePaths = ["/dashboard", "/trashbins", "/realtime", "/alert", "/settings", "/admin/approval"];
app.use(protectedPagePaths, (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  next();
});

app.use("/manager", managerRouter);
app.use("/admin", adminRouter);
app.use("/alerts", alertRouter);
app.use("/trashbins", trashbinRouter);
app.use("/alert", alertRecordRouter);
app.use("/settings", settingsRouter);
app.use("/ai", aiRouter);

app.get("/join", (req, res) => {
  res.render("join");
});

app.get("/email-check", (req, res) => {
  res.render("email-check");
});

app.get("/password", (req, res) => {
  res.render("password");
});

app.get("/pending", (req, res) => {
  res.render("pending");
});

app.get("/find-password", (req, res) => {
  res.render("find-password");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.get("/admin/approval", requireOperator, (req, res) => {
  res.render("admin-approval");
});

app.get("/", (req, res) => {
  res.render("main");
});

app.get("/main", (req, res) => {
  res.render("main");
});

app.get("/dashboard", (req, res) => {
  res.render("dashboard");
});

app.get("/trashbins", (req, res) => {
  res.render("trashbins");
});

app.get("/realtime", (req, res) => {
  res.render("realtime");
});

app.set("view engine", "ejs");
app.set("views", __dirname + "/views");

app.listen(3000);







