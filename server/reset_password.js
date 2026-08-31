import bcrypt from "bcryptjs";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new sqlite3.Database(path.join(__dirname, "forensiai.db"));

const newPassword = "admin123";
const hash = bcrypt.hashSync(newPassword, 10);

db.run(
  `UPDATE users SET password = ? WHERE username = 'admin'`,
  [hash],
  function (err) {
    if (err) {
      console.error("❌ Error:", err.message);
    } else {
      console.log("✅ Admin password reset to: admin123");
    }
    db.close();
  }
);
