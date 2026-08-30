import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import multer from "multer";
import { analyzePacket } from "./ml.js";

const app = express();
const PORT = 8080;
const SECRET_KEY = "cyber_stealth_secret_2024";

// Configure Multer for large uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, archiveDir);
  },
  filename: (req, file, cb) => {
    cb(null, `upload_${Date.now()}_${file.originalname}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // Support up to 500MB forensic files
});

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- DATABASE INITIALIZATION (Render-Ready) ---
const PERSISTENT_PATH = process.env.RENDER_DISK_PATH || __dirname;
const dbPath = path.join(PERSISTENT_PATH, "forensiai.db");
const archiveDir = path.join(PERSISTENT_PATH, "archive");

if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
  console.log(`📁 Archive Directory Created: ${archiveDir}`);
}

const db = new sqlite3.Database(dbPath);

// Enable high-concurrency WAL mode and set a busy timeout
db.serialize(() => {
  db.run('PRAGMA journal_mode = WAL;');
  db.run('PRAGMA busy_timeout = 5000;');

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'Analyst'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS incidents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT,
    sourceIp TEXT,
    destinationIp TEXT,
    userId TEXT,
    resource TEXT,
    category TEXT,
    riskLevel TEXT,
    action TEXT,
    threatScore REAL,
    raw_data TEXT
  )`);

  // Optimized Indexes for High-Performance Queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON incidents(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_risk ON incidents(riskLevel)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_category ON incidents(category)`);
});

// Set longer busy timeout to handle background ingestion locks more gracefully
db.run('PRAGMA busy_timeout = 30000;');

// --- AUTH MIDDLEWARE ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      console.error("❌ JWT Verification Error:", err.message);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
};

// --- AUTH ENDPOINTS ---
app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], (err) => {
    if (err) return res.status(400).json({ error: "Username already exists" });
    res.status(201).json({ message: "Analyst registered" });
  });
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  console.log(`🔐 Login Attempt: ${username}`);
  db.get("SELECT * FROM users WHERE username = ?", [username], async (err, user) => {
    if (err) {
      console.error("❌ Login DB Error:", err);
      return res.status(500).json({ error: "Auth System Error" });
    }
    if (!user) return res.status(400).json({ error: "Analyst not found" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET_KEY, { expiresIn: "24h" });
    console.log(`✅ Login Success: ${username}`);
    res.json({ token, user: { username: user.username, role: user.role } });
  });
});

// --- CORE SOC ENDPOINTS ---

app.post("/api/ingest",(req, res) => {
  const { data } = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: "Invalid signal format" });

  const stmt = db.prepare(`INSERT INTO incidents (timestamp, sourceIp, destinationIp, userId, resource, category, riskLevel, action, threatScore, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  data.forEach((packet) => {
    const analysis = analyzePacket(packet);
    stmt.run(
      packet.timestamp || new Date().toISOString(),
      packet.sourceIp || "0.0.0.0",
      packet.destinationIp || "0.0.0.0",
      packet.userId || "system",
      packet.resource || "N/A",
      analysis.category,
      analysis.riskLevel,
      analysis.action,
      analysis.threatScore,
      packet.raw_data || JSON.stringify(packet)
    );
  });

  stmt.finalize();
  res.json({ message: "Signal uplink successful", count: data.length });
});

app.post("/api/upload",(req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      console.error("❌ Multer Error:", err);
      return res.status(400).json({ error: `Upload Protocol Error: ${err.message}` });
    } else if (err) {
      console.error("❌ Unknown Upload Error:", err);
      return res.status(500).json({ error: "Forensic Uplink Interrupted" });
    }

    if (!req.file) return res.status(400).json({ error: "No telemetry packet provided" });

    const filePath = req.file.path;
    console.log(`📡 Forensic Uplink Received: ${req.file.originalname}`);

    res.json({
      message: "Forensic uplink initiated. Processing in SOC background.",
      filename: req.file.filename,
      status: "processing"
    });

    // Quantum-Stream Bulk Ingestion Task (Extreme Hybrid)
    setImmediate(async () => {
      let count = 0;
      const SUPER_BULK_SIZE = 1000;
      let buffer = [];

      try {
        // Option B: Enable Turbo Mode
        db.run('PRAGMA synchronous = OFF;');
        db.run('PRAGMA journal_mode = MEMORY;');

        const stream = fs.createReadStream(filePath).pipe(csv());

        for await (const packet of stream) {
          const analysis = analyzePacket(packet);
          buffer.push([
            packet.timestamp || new Date().toISOString(),
            packet.sourceIp || "0.0.0.0",
            packet.destinationIp || "0.0.0.0",
            packet.userId || "system",
            packet.resource || "N/A",
            analysis.category,
            analysis.riskLevel,
            analysis.action,
            analysis.threatScore,
            JSON.stringify(packet)
          ]);

          if (buffer.length >= SUPER_BULK_SIZE) {
            const placeholders = buffer.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
            const sql = `INSERT INTO incidents (timestamp, sourceIp, destinationIp, userId, resource, category, riskLevel, action, threatScore, raw_data) VALUES ${placeholders}`;
            const params = buffer.flat();

            await new Promise((resolve, reject) => {
              db.run(sql, params, (err) => err ? reject(err) : resolve());
            });

            count += buffer.length;
            buffer = [];

            if (count % 10000 === 0) {
              console.log(`⚡ Quantum Ingest: ${count} signals synchronized...`);
              await new Promise(resolve => setTimeout(resolve, 20)); // Minimal yield for UI
            }
          }
        }

        if (buffer.length > 0) {
          const placeholders = buffer.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
          const sql = `INSERT INTO incidents (timestamp, sourceIp, destinationIp, userId, resource, category, riskLevel, action, threatScore, raw_data) VALUES ${placeholders}`;
          const params = buffer.flat();
          await new Promise((resolve, reject) => db.run(sql, params, (err) => err ? reject(err) : resolve()));
          count += buffer.length;
        }

        console.log(`✅ Quantum Ingest Complete: ${count} signals total.`);
      } catch (err) {
        console.error("❌ Quantum Ingest Error:", err);
      } finally {
        // Reset to Safe Mode
        db.run('PRAGMA synchronous = NORMAL;');
        db.run('PRAGMA journal_mode = WAL;');
      }
    });
  });
});

app.get("/api/archive",(req, res) => {
  const archivePath = path.join(process.cwd(), "archive");
  if (!fs.existsSync(archivePath)) {
    return res.json([]);
  }

  const files = fs.readdirSync(archivePath)
    .filter(file => file.endsWith(".csv"))
    .map(file => {
      const stats = fs.statSync(path.join(archivePath, file));
      return {
        name: file,
        size: (stats.size / (1024 * 1024)).toFixed(2) + " MB",
        modified: stats.mtime
      };
    });

  res.json(files);
});

app.post("/api/archive/ingest",(req, res) => {
  const { filename } = req.body;
  const filePath = path.join(process.cwd(), "archive", filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Archive file not found" });
  }

  // Quantum-Stream Bulk Ingestion for Archives
  (async () => {
    let count = 0;
    const SUPER_BULK_SIZE = 1000;
    let buffer = [];

    try {
      db.run('PRAGMA synchronous = OFF;');
      db.run('PRAGMA journal_mode = MEMORY;');

      const stream = fs.createReadStream(filePath).pipe(csv());
      for await (const row of stream) {
        const packet = {
          timestamp: row.timestamp || row.Timestamp || new Date().toISOString(),
          sourceIp: row.sourceIp || row.Source || row.src || "0.0.0.0",
          destinationIp: row.destinationIp || row.Destination || row.dst || "0.0.0.0",
          userId: row.userId || "system",
          resource: row.resource || "N/A",
          category: row.category || row.Label || "Unclassified"
        };
        const analysis = analyzePacket(packet);

        buffer.push([
          packet.timestamp,
          packet.sourceIp,
          packet.destinationIp,
          packet.userId,
          packet.resource,
          analysis.category,
          analysis.riskLevel,
          analysis.action,
          analysis.threatScore,
          JSON.stringify(row)
        ]);

        if (buffer.length >= SUPER_BULK_SIZE) {
          const placeholders = buffer.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
          const sql = `INSERT INTO incidents (timestamp, sourceIp, destinationIp, userId, resource, category, riskLevel, action, threatScore, raw_data) VALUES ${placeholders}`;
          const params = buffer.flat();

          await new Promise((resolve, reject) => {
            db.run(sql, params, (err) => err ? reject(err) : resolve());
          });

          count += buffer.length;
          buffer = [];
          if (count % 10000 === 0) {
            console.log(`⚡ Quantum Archive Sync: ${count} signals indexed...`);
            await new Promise(resolve => setTimeout(resolve, 20));
          }
        }
      }

      if (buffer.length > 0) {
        const placeholders = buffer.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const sql = `INSERT INTO incidents (timestamp, sourceIp, destinationIp, userId, resource, category, riskLevel, action, threatScore, raw_data) VALUES ${placeholders}`;
        const params = buffer.flat();
        await new Promise((resolve, reject) => db.run(sql, params, (err) => err ? reject(err) : resolve()));
        count += buffer.length;
      }

      console.log(`✅ Quantum Archive Complete: ${count} signals total.`);
      res.json({ message: `Archive ${filename} ingested successfully`, count });
    } catch (err) {
      console.error("❌ Quantum Archive Error:", err);
      if (!res.headersSent) res.status(500).json({ error: "Forensic stream failure" });
    } finally {
      db.run('PRAGMA synchronous = NORMAL;');
      db.run('PRAGMA journal_mode = WAL;');
    }
  })();
});

app.get("/api/dashboard",async (req, res) => {
  console.log("📊 Dashboard Request Received...");
  try {
    // Perform high-speed SQL aggregations
    console.log("--- Executing SQL Aggregations ---");
    const totalLogs = await new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM incidents", (err, row) => resolve(row?.count || 0)));
    console.log(`--- Total Logs: ${totalLogs} ---`);

    const suspiciousEvents = await new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM incidents WHERE riskLevel != 'Low'", (err, row) => resolve(row?.count || 0)));
    const activeIncidents = await new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM incidents WHERE riskLevel = 'High'", (err, row) => resolve(row?.count || 0)));

    const categoryData = await new Promise((resolve) => {
      db.all("SELECT category as name, COUNT(*) as value FROM incidents GROUP BY category ORDER BY value DESC LIMIT 10", (err, rows) => resolve(rows || []));
    });

    const timeData = await new Promise((resolve) => {
      db.all(`SELECT strftime('%H:00', timestamp) as name, COUNT(*) as value FROM incidents GROUP BY name ORDER BY name ASC LIMIT 24`, (err, rows) => resolve(rows || []));
    });

    const recentAlerts = await new Promise((resolve) => {
      db.all("SELECT * FROM incidents WHERE riskLevel = 'High' ORDER BY id DESC LIMIT 5", (err, rows) => resolve(rows || []));
    });

    console.log("✅ Dashboard Data Synthesized.");
    res.json({
      totalLogs,
      suspiciousEvents,
      activeIncidents,
      riskLevel: suspiciousEvents > (totalLogs * 0.3) ? "High" : "Low",
      lineChartData: timeData,
      barChartData: categoryData.map(c => ({
        name: c.name.length > 15 ? c.name.substring(0, 12) + '...' : c.name,
        value: c.value
      })),
      recentAlerts
    });
  } catch (err) {
    console.error("❌ Dashboard Optimization Error:", err);
    res.status(500).json({ error: "Intelligence Engine Timeout" });
  }
});

app.get("/api/incidents",(req, res) => {
  db.all("SELECT * FROM incidents ORDER BY id DESC LIMIT 100", [], (err, rows) => {
    if (err) return res.sendStatus(500);
    res.json(rows);
  });
});

app.get("/api/notifications",(req, res) => {
  db.all("SELECT * FROM incidents WHERE riskLevel = 'High' ORDER BY id DESC LIMIT 5", [], (err, rows) => {
    if (err) return res.sendStatus(500);
    const notifications = rows.map(r => ({
      id: r.id,
      title: `Critical Alert: ${r.action}`,
      timestamp: new Date(r.timestamp).toLocaleTimeString(),
      riskLevel: "High"
    }));
    res.json(notifications);
  });
});

app.get("/api/timeline",(req, res) => {
  db.all("SELECT id, timestamp, action as title, category as description, riskLevel as status FROM incidents ORDER BY id DESC LIMIT 20", [], (err, rows) => {
    if (err) return res.sendStatus(500);
    res.json(rows);
  });
});

import { getKnowledgeForIncident } from "./knowledge_base.js";

app.post("/api/chat",(req, res) => {
  const { message } = req.body;
  db.all("SELECT * FROM incidents ORDER BY id DESC LIMIT 200", [], (err, rows) => {
    if (err) return res.status(500).json({ error: "DB error" });

    const total = rows.length;
    const high = rows.filter(r => r.riskLevel === "High").length;
    const categories = {};
    rows.forEach(r => { categories[r.category] = (categories[r.category] || 0) + 1; });
    const topCategory = Object.entries(categories).sort((a, b) => b[1] - a[1])[0];
    const knowledge = topCategory ? getKnowledgeForIncident(topCategory[0], "") : null;

    const sourceIps = {};
    rows.forEach(r => { if (r.sourceIp) sourceIps[r.sourceIp] = (sourceIps[r.sourceIp] || 0) + 1; });
    const topIp = Object.entries(sourceIps).sort((a, b) => b[1] - a[1])[0];

    const avgThreat = total > 0 ? (rows.reduce((s, r) => s + parseFloat(r.threatScore || 0), 0) / total).toFixed(1) : 0;

    const lowerMsg = message.toLowerCase();
    let response = "";

    if (lowerMsg.includes("summar") || lowerMsg.includes("overview") || lowerMsg.includes("status")) {
      response = `📊 INVESTIGATION SUMMARY\n\n` +
        `Total Signals: ${total} | High Risk: ${high} | Avg Threat: ${avgThreat}/100\n\n` +
        `🔍 PRIMARY PATTERN: ${topCategory ? topCategory[0] : "None"}\n` +
        `🛡️ TECHNIQUE: ${knowledge ? knowledge.technique : "Generic Pattern"}\n` +
        `📝 DESCRIPTION: ${knowledge ? knowledge.description : "Continuous monitoring recommended."}\n\n` +
        `💡 MITIGATION STEPS:\n` +
        (knowledge ? knowledge.mitigation.map(m => `• ${m}`).join("\n") : "• Maintain standard SOC posture.\n• Review logs for anomalies.") +
        `\n\nRecommendation: ${high > 5 ? "⚠️ Escalate to Tier-2 SOC immediately." : "✅ Risk posture is stable."}`;
    } else if (lowerMsg.includes("high") || lowerMsg.includes("critical")) {
      const highEvents = rows.filter(r => r.riskLevel === "High").slice(0, 5);
      response = `🔴 HIGH RISK EVENTS (${high} total)\n\n` + (highEvents.length > 0
        ? highEvents.map(e => `• [${e.category}] ${e.sourceIp} → ${e.destinationIp} | Score: ${e.threatScore} | ${e.action}`).join("\n")
        : "No high risk events detected.");
    } else if (lowerMsg.includes("recommend") || lowerMsg.includes("action") || lowerMsg.includes("mitigat")) {
      response = `🛡️ SOC MITIGATION PLAYBOOK\n\n` +
        `Based on current buffer (${topCategory ? topCategory[0] : "N/A"}): \n\n` +
        (knowledge ? knowledge.mitigation.map(m => `✅ ${m}`).join("\n") : "• Review top source IP: " + (topIp ? topIp[0] : "N/A") + "\n• Perform baseline audit.") +
        `\n\n• Primary Actor: ${topIp ? topIp[0] : "Internal/Unknown"}\n• Recommended Action: ${high > 5 ? "Activate Incident Response" : "Log & Monitor"}`;
    } else {
      response = `🤖 ForensiAI Neural Analyst\n\nBuffer Status: ${total} signals indexed | ${high} high-risk\n\nTry asking: "Summarize the findings", "What are the mitigation steps?", or "Show high risk events".`;
    }

    res.json({ response });
  });
});

app.get("/api/report",async (req, res) => {
  console.log("📄 Generating Forensic Integrity Report...");
  try {
    const total = await new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM incidents", (err, row) => resolve(Number(row?.count || 0))));
    const high = await new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM incidents WHERE riskLevel = 'High'", (err, row) => resolve(Number(row?.count || 0))));
    const medium = await new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM incidents WHERE riskLevel = 'Medium'", (err, row) => resolve(Number(row?.count || 0))));
    const low = await new Promise((resolve) => db.get("SELECT COUNT(*) as count FROM incidents WHERE riskLevel = 'Low'", (err, row) => resolve(Number(row?.count || 0))));

    console.log(`📊 Report Stats: Total=${total}, High=${high}`);

    const categoryBreakdown = await new Promise((resolve) => {
      db.all("SELECT category as name, COUNT(*) as count FROM incidents GROUP BY category ORDER BY count DESC", (err, rows) => resolve(rows || []));
    });

    const topIps = await new Promise((resolve) => {
      db.all("SELECT sourceIp as ip, COUNT(*) as count FROM incidents WHERE sourceIp IS NOT NULL GROUP BY sourceIp ORDER BY count DESC LIMIT 10", (err, rows) => resolve(rows || []));
    });

    const avgScoreResult = await new Promise((resolve) => db.get("SELECT AVG(threatScore) as avg FROM incidents", (err, row) => resolve(row?.avg)));
    const avgScore = avgScoreResult ? Number(avgScoreResult).toFixed(1) : "0.0";

    const recentHighRisk = await new Promise((resolve) => {
      db.all("SELECT sourceIp, destinationIp, category, action, threatScore, timestamp FROM incidents WHERE riskLevel = 'High' ORDER BY id DESC LIMIT 5", (err, rows) => resolve(rows || []));
    });

    const riskScore = high > (total * 0.3) ? "Critical" : high > (total * 0.1) ? "High" : total > 0 ? "Stable" : "No Data";

    console.log("✅ Report Synthesis Complete.");
    res.json({
      summary: "ForensiAI Network Integrity Report",
      generationTime: new Date().toISOString(),
      incidents: total,
      high, medium, low,
      avgThreatScore: avgScore,
      riskScore,
      categoryBreakdown,
      topSourceIps: topIps,
      recentHighRisk
    });
  } catch (err) {
    console.error("❌ Reporting Optimization Error:", err);
    res.status(500).json({ error: "Reporting Engine Failure" });
  }
});

const server = app.listen(PORT, () => {
  console.log(`SOC ENGINE ACTIVE ON PORT ${PORT}`);
});

// Hardened connection settings for large forensic uplinks
server.timeout = 600000; // 10 minutes
server.keepAliveTimeout = 610000;
server.headersTimeout = 620000;