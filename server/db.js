import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, "forensiai.db");
const db = new sqlite3.Database(dbPath);

// Initialize tables
db.serialize(() => {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'Analyst'
    )
  `);

  // Incidents table (cached from CSV)
  db.run(`
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      timestamp TEXT,
      user TEXT,
      ipAddress TEXT,
      action TEXT,
      riskLevel TEXT,
      category TEXT,
      threatScore REAL
    )
  `);

  // Stats table (to keep historical dashboard snapshots)
  db.run(`
    CREATE TABLE IF NOT EXISTS dashboard_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      totalLogs INTEGER,
      suspiciousEvents INTEGER,
      riskLevel TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Datasets table (Module 1: Ingestion & Validation metadata, Module 2: Profiling summary)
  db.run(`
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      originalFilename TEXT NOT NULL,
      fileSize INTEGER NOT NULL,
      rowCount INTEGER NOT NULL,
      columnCount INTEGER NOT NULL,
      columnNames TEXT NOT NULL,
      validationStatus TEXT NOT NULL,
      validationDetails TEXT,
      profileDetails TEXT,
      uploadedBy TEXT DEFAULT 'Analyst',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migration: add profileDetails column if not already present
  db.run(`ALTER TABLE datasets ADD COLUMN profileDetails TEXT`, () => {});
});

export const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

export const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

export const get = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

export default db;
