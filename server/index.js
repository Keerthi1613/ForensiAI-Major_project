import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import sqlite3 from "sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import csv from "csv-parser";
import multer from "multer";
import { fileURLToPath } from "url";
import { analyzePacket } from "./ml.js";
import { sanitizeFilename, validateDataset, parseCSVLine } from "./datasetValidator.js";
import { profileDataset } from "./datasetProfiler.js";
import { MLPreprocessingPipeline } from "./mlPreprocessingPipeline.js";

const app = express();
const PORT = 8080;
const SECRET_KEY = "cyber_stealth_secret_2024";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- STORAGE & DATABASE INITIALIZATION (Render-Ready) ---
const PERSISTENT_PATH = process.env.RENDER_DISK_PATH || __dirname;
const dbPath = path.join(PERSISTENT_PATH, "forensiai.db");
const archiveDir = path.join(PERSISTENT_PATH, "archive");
const datasetsDir = path.join(PERSISTENT_PATH, "uploads", "datasets");

if (!fs.existsSync(archiveDir)) {
  fs.mkdirSync(archiveDir, { recursive: true });
  console.log(`📁 Archive Directory Created: ${archiveDir}`);
}

if (!fs.existsSync(datasetsDir)) {
  fs.mkdirSync(datasetsDir, { recursive: true });
  console.log(`📁 Datasets Upload Directory Created: ${datasetsDir}`);
}

// Configure Multer for archive uploads
const archiveStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, archiveDir);
  },
  filename: (req, file, cb) => {
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, `upload_${Date.now()}_${sanitized}`);
  }
});
const upload = multer({
  storage: archiveStorage,
  limits: { fileSize: 500 * 1024 * 1024 } // Support up to 500MB forensic files
});

// Configure Multer for Module 1 Dataset Ingestion
const datasetStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, datasetsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
    const sanitized = sanitizeFilename(file.originalname);
    cb(null, `dataset_${uniqueSuffix}_${sanitized}`);
  }
});
const datasetUpload = multer({
  storage: datasetStorage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

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

  // Module 1: Ingested Datasets Metadata Table
  db.run(`CREATE TABLE IF NOT EXISTS datasets (
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
  )`);

  // Migration: add profileDetails column if not already present
  db.run(`ALTER TABLE datasets ADD COLUMN profileDetails TEXT`, () => {});

  // Optimized Indexes for High-Performance Queries
  db.run(`CREATE INDEX IF NOT EXISTS idx_timestamp ON incidents(timestamp)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_risk ON incidents(riskLevel)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_category ON incidents(category)`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_dataset_created ON datasets(createdAt)`);
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

// --- MODULE 1: DATASET INGESTION & VALIDATION ENDPOINTS ---

// Upload and Validate CSV Dataset
app.post("/api/datasets/upload", (req, res) => {
  datasetUpload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      console.error("❌ Multer Error:", err);
      return res.status(400).json({
        success: false,
        error: `File Upload Error: ${err.message}`,
        validation: {
          status: "ERROR",
          isValid: false,
          errors: [`File Upload Error: ${err.message}`],
          warnings: [],
          checks: { fileExtension: false, fileSize: false, encoding: false, csvStructure: false, columnCount: false, duplicateColumns: false, rowCount: false }
        }
      });
    } else if (err) {
      console.error("❌ Upload Error:", err);
      return res.status(500).json({
        success: false,
        error: "Dataset upload stream interrupted",
        validation: {
          status: "ERROR",
          isValid: false,
          errors: ["Dataset upload stream interrupted"],
          warnings: [],
          checks: {}
        }
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No dataset file provided",
        validation: {
          status: "INVALID",
          isValid: false,
          errors: ["No dataset file provided in request."],
          warnings: [],
          checks: {}
        }
      });
    }

    const filePath = req.file.path;
    const storedFilename = req.file.filename;
    const originalFilename = sanitizeFilename(req.file.originalname);

    console.log(`📥 Dataset Uplink Received: ${originalFilename} (${storedFilename})`);

    // Extract authenticated user if token present
    let uploadedBy = "Analyst";
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, SECRET_KEY);
        if (decoded?.username) uploadedBy = decoded.username;
      } catch (e) {
        // Fall back to Analyst
      }
    }

    try {
      // Execute comprehensive validation pipeline
      const validationReport = await validateDataset(filePath, {
        originalFilename,
        maxFileSize: 500 * 1024 * 1024,
        minRows: 1,
        minColumns: 2
      });

      const datasetId = `ds_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

      if (!validationReport.isValid) {
        // If invalid, clean up uploaded temporary file
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (e) {}
        }

        return res.status(400).json({
          success: false,
          error: "Dataset validation failed",
          dataset: {
            id: null,
            filename: originalFilename,
            originalFilename,
            fileSize: validationReport.metadata.fileSize,
            fileSizeFormatted: validationReport.metadata.fileSizeFormatted,
            rowCount: validationReport.metadata.rowCount,
            columnCount: validationReport.metadata.columnCount,
            columnNames: validationReport.metadata.columnNames,
            validationStatus: validationReport.status,
            uploadedBy
          },
          validation: validationReport
        });
      }

      // Valid or Warning: Persist metadata in database
      const validationDetails = JSON.stringify({
        errors: validationReport.errors,
        warnings: validationReport.warnings,
        checks: validationReport.checks,
        sampleRows: validationReport.metadata.sampleRows
      });

      const columnNamesJson = JSON.stringify(validationReport.metadata.columnNames);

      await new Promise((resolve, reject) => {
        db.run(
          `INSERT INTO datasets (id, filename, originalFilename, fileSize, rowCount, columnCount, columnNames, validationStatus, validationDetails, uploadedBy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            datasetId,
            storedFilename,
            originalFilename,
            validationReport.metadata.fileSize,
            validationReport.metadata.rowCount,
            validationReport.metadata.columnCount,
            columnNamesJson,
            validationReport.status,
            validationDetails,
            uploadedBy
          ],
          (insertErr) => {
            if (insertErr) reject(insertErr);
            else resolve();
          }
        );
      });

      console.log(`✅ Dataset Ingested & Validated: ${datasetId} [${validationReport.status}] (${validationReport.metadata.rowCount} rows, ${validationReport.metadata.columnCount} cols)`);

      return res.status(200).json({
        success: true,
        message: "Dataset uploaded and validated successfully",
        dataset: {
          id: datasetId,
          filename: originalFilename,
          originalFilename,
          fileSize: validationReport.metadata.fileSize,
          fileSizeFormatted: validationReport.metadata.fileSizeFormatted,
          rowCount: validationReport.metadata.rowCount,
          columnCount: validationReport.metadata.columnCount,
          columnNames: validationReport.metadata.columnNames,
          validationStatus: validationReport.status,
          uploadedBy,
          createdAt: new Date().toISOString()
        },
        validation: validationReport
      });
    } catch (valErr) {
      console.error("❌ Dataset Validation Error:", valErr);
      return res.status(500).json({
        success: false,
        error: `Dataset processing error: ${valErr.message}`,
        validation: {
          status: "ERROR",
          isValid: false,
          errors: [valErr.message],
          warnings: [],
          checks: {}
        }
      });
    }
  });
});

// Active Profiling Jobs tracking for live frontend progress reporting
const activeProfilingJobs = new Map();

// Progress Endpoint for live profiling status
app.get("/api/datasets/:id/profile/progress", (req, res) => {
  const { id } = req.params;
  const job = activeProfilingJobs.get(id);
  if (job) {
    res.json(job);
  } else {
    res.json({
      status: "idle",
      rowsProcessed: 0,
      progress: 0,
      message: "No active profiling job running"
    });
  }
});

// List all ingested datasets
app.get("/api/datasets", (req, res) => {
  db.all("SELECT * FROM datasets ORDER BY createdAt DESC", [], (err, rows) => {
    if (err) {
      console.error("❌ Datasets Fetch DB Error:", err);
      return res.status(500).json({ error: "Failed to retrieve datasets" });
    }
    const datasets = (rows || []).map(r => {
      let parsedCols = [];
      let parsedDetails = {};
      let parsedProfile = null;
      try { parsedCols = JSON.parse(r.columnNames || "[]"); } catch (e) {}
      try { parsedDetails = JSON.parse(r.validationDetails || "{}"); } catch (e) {}
      try { parsedProfile = JSON.parse(r.profileDetails || "null"); } catch (e) {}

      return {
        id: r.id,
        filename: r.originalFilename || r.filename,
        originalFilename: r.originalFilename,
        fileSize: r.fileSize,
        rowCount: r.rowCount,
        columnCount: r.columnCount,
        columnNames: parsedCols,
        validationStatus: r.validationStatus,
        validationDetails: parsedDetails,
        profile: parsedProfile,
        uploadedBy: r.uploadedBy,
        createdAt: r.createdAt
      };
    });
    res.json(datasets);
  });
});

// Get dataset by ID
app.get("/api/datasets/:id", (req, res) => {
  db.get("SELECT * FROM datasets WHERE id = ?", [req.params.id], (err, row) => {
    if (err) {
      console.error("❌ Dataset Fetch DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!row) {
      return res.status(404).json({ error: "Dataset not found" });
    }

    let parsedCols = [];
    let parsedDetails = {};
    let parsedProfile = null;
    try { parsedCols = JSON.parse(row.columnNames || "[]"); } catch (e) {}
    try { parsedDetails = JSON.parse(row.validationDetails || "{}"); } catch (e) {}
    try { parsedProfile = JSON.parse(row.profileDetails || "null"); } catch (e) {}

    res.json({
      id: row.id,
      filename: row.originalFilename || row.filename,
      originalFilename: row.originalFilename,
      fileSize: row.fileSize,
      rowCount: row.rowCount,
      columnCount: row.columnCount,
      columnNames: parsedCols,
      validationStatus: row.validationStatus,
      validationDetails: parsedDetails,
      profile: parsedProfile,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt
    });
  });
});

// Module 2: Profile Dataset
app.get("/api/datasets/:id/profile", async (req, res) => {
  const { id } = req.params;
  const targetColumn = req.query.targetColumn;

  db.get("SELECT * FROM datasets WHERE id = ?", [id], async (err, row) => {
    if (err) {
      console.error("❌ Dataset Profiling DB Error:", err);
      return res.status(500).json({ error: "Database error" });
    }
    if (!row) {
      return res.status(404).json({ error: "Dataset not found" });
    }

    const filePath = path.join(datasetsDir, row.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Dataset source file not found on disk" });
    }

    // Return cached profile if already computed for the same target column
    let cachedProfile = null;
    try { cachedProfile = JSON.parse(row.profileDetails || "null"); } catch (e) {}
    if (cachedProfile && (!targetColumn || cachedProfile.target?.targetColumn === targetColumn)) {
      return res.json({
        datasetId: id,
        filename: row.originalFilename || row.filename,
        originalFilename: row.originalFilename,
        fileSize: row.fileSize,
        validationStatus: row.validationStatus,
        profile: cachedProfile
      });
    }

    try {
      console.log(`📊 Streaming Dataset Profiler: ${row.originalFilename} (${id})...`);
      activeProfilingJobs.set(id, {
        rowsProcessed: 0,
        progress: 0,
        status: "processing",
        message: `Profiling ${row.originalFilename}...`,
        startTime: Date.now()
      });

      const profile = await profileDataset(filePath, {
        targetColumn,
        onProgress: (p) => {
          activeProfilingJobs.set(id, {
            rowsProcessed: p.rowsProcessed,
            progress: p.progress,
            status: p.status,
            message: `Processed ${p.rowsProcessed.toLocaleString()} rows (${p.progress}%)...`,
            startTime: activeProfilingJobs.get(id)?.startTime || Date.now()
          });
        }
      });

      activeProfilingJobs.set(id, {
        rowsProcessed: profile.summary.totalRows,
        progress: 100,
        status: "completed",
        message: "Profiling completed successfully."
      });

      // Cache profile summary in SQLite
      db.run("UPDATE datasets SET profileDetails = ? WHERE id = ?", [JSON.stringify(profile), id], () => {});
      
      res.json({
        datasetId: id,
        filename: row.originalFilename || row.filename,
        originalFilename: row.originalFilename,
        fileSize: row.fileSize,
        validationStatus: row.validationStatus,
        profile
      });
    } catch (profileErr) {
      activeProfilingJobs.set(id, {
        rowsProcessed: 0,
        progress: 0,
        status: "error",
        message: profileErr.message
      });
      console.error("❌ Profiling Engine Error:", profileErr);
      res.status(500).json({ error: `Profiling failed: ${profileErr.message}` });
    }
  });
});

app.post("/api/datasets/:id/profile", async (req, res) => {
  const { id } = req.params;
  const { targetColumn } = req.body;

  db.get("SELECT * FROM datasets WHERE id = ?", [id], async (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(404).json({ error: "Dataset not found" });

    const filePath = path.join(datasetsDir, row.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Dataset source file not found on disk" });
    }

    try {
      console.log(`📊 Streaming Dataset Profiler (Target Update): ${row.originalFilename} (${id})...`);
      activeProfilingJobs.set(id, {
        rowsProcessed: 0,
        progress: 0,
        status: "processing",
        message: `Profiling ${row.originalFilename}...`,
        startTime: Date.now()
      });

      const profile = await profileDataset(filePath, {
        targetColumn,
        onProgress: (p) => {
          activeProfilingJobs.set(id, {
            rowsProcessed: p.rowsProcessed,
            progress: p.progress,
            status: p.status,
            message: `Processed ${p.rowsProcessed.toLocaleString()} rows (${p.progress}%)...`,
            startTime: activeProfilingJobs.get(id)?.startTime || Date.now()
          });
        }
      });

      activeProfilingJobs.set(id, {
        rowsProcessed: profile.summary.totalRows,
        progress: 100,
        status: "completed",
        message: "Profiling completed successfully."
      });

      // Cache updated profile in SQLite
      db.run("UPDATE datasets SET profileDetails = ? WHERE id = ?", [JSON.stringify(profile), id], () => {});

      res.json({
        datasetId: id,
        filename: row.originalFilename || row.filename,
        originalFilename: row.originalFilename,
        fileSize: row.fileSize,
        validationStatus: row.validationStatus,
        profile
      });
    } catch (profileErr) {
      activeProfilingJobs.set(id, {
        rowsProcessed: 0,
        progress: 0,
        status: "error",
        message: profileErr.message
      });
      console.error("❌ Profiling Engine Error:", profileErr);
      res.status(500).json({ error: `Profiling failed: ${profileErr.message}` });
    }
  });
});

// Helper to read all CSV rows from file
async function loadCsvRows(filePath) {
  const readline = (await import("readline")).default;
  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let headers = [];
  let isFirstLine = true;
  const rows = [];

  for await (let rawLine of rl) {
    if (isFirstLine && rawLine.charCodeAt(0) === 0xfeff) rawLine = rawLine.slice(1);
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const parsed = parseCSVLine(rawLine);
    if (parsed.unclosedQuote) continue;

    if (isFirstLine) {
      isFirstLine = false;
      headers = parsed.fields.map(h => h.trim());
      continue;
    }

    const rowObj = {};
    headers.forEach((h, idx) => {
      rowObj[h] = parsed.fields[idx] ?? "";
    });
    rows.push(rowObj);
  }

  return { headers, rows };
}

// Module 3: Preprocess Dataset (Train/Test Split, Fit, Transform, Leakage-Proof)
app.post("/api/datasets/:id/preprocess", async (req, res) => {
  const { id } = req.params;
  const { 
    targetColumn,
    testSize = 0.2, 
    numericalScaling = "standard", 
    categoricalEncoding = "onehot",
    deriveTimestamps = true,
    handleIdentifiers = "exclude",
    randomSeed = 42
  } = req.body || {};

  db.get("SELECT * FROM datasets WHERE id = ?", [id], async (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(404).json({ error: "Dataset not found" });

    const filePath = path.join(datasetsDir, row.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Dataset source file not found on disk" });
    }

    try {
      console.log(`⚙️ Executing ML Preprocessing Pipeline for ${row.originalFilename} (${id})...`);
      const { headers, rows } = await loadCsvRows(filePath);

      if (rows.length === 0) {
        return res.status(400).json({ error: "Dataset contains no data rows to preprocess" });
      }

      // Step 1: Train / Test Split BEFORE fitting (Zero Data Leakage)
      const { trainRows, testRows } = MLPreprocessingPipeline.trainTestSplit(rows, {
        testSize: Number(testSize),
        shuffle: true,
        randomSeed: Number(randomSeed),
        targetColumn
      });

      // Step 2: Instantiate Pipeline
      const pipeline = new MLPreprocessingPipeline({
        targetColumn: targetColumn || null,
        numericalScaling,
        categoricalEncoding,
        deriveTimestamps,
        handleIdentifiers,
        randomSeed: Number(randomSeed)
      });

      // Step 3: Fit STRICTLY on training split
      pipeline.fit(trainRows);

      // Step 4: Transform train and test splits
      const trainTransformed = pipeline.transform(trainRows);
      const testTransformed = pipeline.transform(testRows);

      res.json({
        datasetId: id,
        filename: row.originalFilename || row.filename,
        leakagePreventionAudit: {
          isLeakageProof: true,
          status: "VERIFIED",
          trainRowCount: trainRows.length,
          testRowCount: testRows.length,
          splitRatio: `${((1 - testSize) * 100).toFixed(0)}% / ${(testSize * 100).toFixed(0)}%`,
          message: "Preprocessing transformers fitted strictly on training partition with zero test sample leakage."
        },
        pipelineConfig: pipeline.options,
        schema: {
          featureNames: pipeline.outputFeatureSchema,
          featureCount: pipeline.outputFeatureSchema.length,
          featureMetadata: pipeline.featureMetadata,
          numericalFeatures: pipeline.numericalFeatures,
          categoricalFeatures: pipeline.categoricalFeatures,
          timestampFeatures: pipeline.timestampFeatures,
          identifierFeatures: pipeline.identifierFeatures,
          excludedFeatures: pipeline.excludedFeatures,
          targetColumn: pipeline.targetColumn,
          targetClasses: pipeline.targetParams.classes || []
        },
        matrices: {
          trainShape: [trainTransformed.rowCount, trainTransformed.featureCount],
          testShape: [testTransformed.rowCount, testTransformed.featureCount],
          sampleTransformedTrain: trainTransformed.X.slice(0, 5),
          sampleTransformedTest: testTransformed.X.slice(0, 5),
          sampleTrainTarget: trainTransformed.y.slice(0, 5),
          sampleTestTarget: testTransformed.y.slice(0, 5)
        }
      });
    } catch (prepErr) {
      console.error("❌ Preprocessing Engine Error:", prepErr);
      res.status(500).json({ error: `Preprocessing failed: ${prepErr.message}` });
    }
  });
});

app.get("/api/datasets/:id/preprocess/schema", async (req, res) => {
  const { id } = req.params;
  const targetColumn = req.query.targetColumn;

  db.get("SELECT * FROM datasets WHERE id = ?", [id], async (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(404).json({ error: "Dataset not found" });

    const filePath = path.join(datasetsDir, row.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Dataset file not found" });
    }

    try {
      const { rows } = await loadCsvRows(filePath);
      const pipeline = new MLPreprocessingPipeline({ targetColumn });
      pipeline.fit(rows.slice(0, 100)); // Quick fit on sample for schema preview

      res.json({
        datasetId: id,
        featureNames: pipeline.outputFeatureSchema,
        featureMetadata: pipeline.featureMetadata,
        excludedFeatures: pipeline.excludedFeatures
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// Delete dataset by ID
app.delete("/api/datasets/:id", (req, res) => {
  db.get("SELECT * FROM datasets WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: "Database error" });
    if (!row) return res.status(404).json({ error: "Dataset not found" });

    const filePath = path.join(datasetsDir, row.filename);
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.error("Could not delete dataset file:", e); }
    }

    db.run("DELETE FROM datasets WHERE id = ?", [req.params.id], (delErr) => {
      if (delErr) return res.status(500).json({ error: "Failed to delete dataset record" });
      res.json({ message: "Dataset deleted successfully", id: req.params.id });
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