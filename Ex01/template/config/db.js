const mysql = require("mysql2");

const conn = mysql.createConnection({
  host: "project-db-campus.smhrd.com",
  port: 3307,
  user: "IGNIX",
  password: "1234",
  database: "IGNIX",
});

conn.connect((err) => {
  if (err) {
    console.error("MySQL 연결 실패:", err);
    return;
  }

  console.log("MySQL 연결 성공");
});

module.exports = conn;