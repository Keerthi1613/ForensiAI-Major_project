import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateDataset, sanitizeFilename, isBinaryBuffer, parseCSVLine } from "../datasetValidator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, "temp_test_files");

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, testName, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✅ PASS: ${testName}`);
  } else {
    failedTests++;
    console.error(`  ❌ FAIL: ${testName} - ${message}`);
  }
}

async function runTests() {
  console.log("\n========================================================");
  console.log("  FORENSIAI MODULE 1 - DATASET VALIDATION TEST SUITE");
  console.log("========================================================\n");

  // ----------------------------------------------------
  // TEST 1: Valid CSV Dataset
  // ----------------------------------------------------
  console.log("▶ Running Test 1: Valid CSV Dataset...");
  const validCsvPath = path.join(tempDir, "valid_network_traffic.csv");
  const validContent = 
`timestamp,sourceIp,destinationIp,protocol,threatScore,label
2026-08-31T20:00:00Z,192.168.1.50,10.0.0.1,TCP,15.5,Normal
2026-08-31T20:01:00Z,192.168.1.51,10.0.0.2,UDP,85.2,DDoS
2026-08-31T20:02:00Z,192.168.1.52,10.0.0.3,TCP,42.0,PortScan`;
  fs.writeFileSync(validCsvPath, validContent, "utf8");

  const validReport = await validateDataset(validCsvPath, {
    originalFilename: "valid_network_traffic.csv"
  });

  assert(validReport.isValid === true, "Valid CSV - isValid is true", `Got isValid=${validReport.isValid}`);
  assert(validReport.status === "VALID", "Valid CSV - status is VALID", `Got status=${validReport.status}`);
  assert(validReport.metadata.rowCount === 3, "Valid CSV - rowCount is 3", `Got rowCount=${validReport.metadata.rowCount}`);
  assert(validReport.metadata.columnCount === 6, "Valid CSV - columnCount is 6", `Got columnCount=${validReport.metadata.columnCount}`);
  assert(validReport.metadata.columnNames.length === 6, "Valid CSV - columnNames parsed", `Got ${validReport.metadata.columnNames}`);
  assert(validReport.errors.length === 0, "Valid CSV - zero errors", `Got errors: ${validReport.errors}`);

  // ----------------------------------------------------
  // TEST 2: Empty CSV (0 Bytes)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 2: Empty CSV (0 Bytes)...");
  const emptyCsvPath = path.join(tempDir, "empty_dataset.csv");
  fs.writeFileSync(emptyCsvPath, "", "utf8");

  const emptyReport = await validateDataset(emptyCsvPath, {
    originalFilename: "empty_dataset.csv"
  });

  assert(emptyReport.isValid === false, "Empty CSV - isValid is false", `Got isValid=${emptyReport.isValid}`);
  assert(emptyReport.status === "INVALID", "Empty CSV - status is INVALID", `Got status=${emptyReport.status}`);
  assert(emptyReport.errors.some(e => e.includes("empty")), "Empty CSV - reports empty error", `Got errors: ${emptyReport.errors}`);

  // ----------------------------------------------------
  // TEST 3: Header Only CSV (0 Data Rows)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 3: Header Only CSV (0 Data Rows)...");
  const headerOnlyPath = path.join(tempDir, "header_only.csv");
  fs.writeFileSync(headerOnlyPath, "timestamp,sourceIp,destinationIp\n", "utf8");

  const headerOnlyReport = await validateDataset(headerOnlyPath, {
    originalFilename: "header_only.csv",
    minRows: 1
  });

  assert(headerOnlyReport.isValid === false, "Header Only - isValid is false", `Got isValid=${headerOnlyReport.isValid}`);
  assert(headerOnlyReport.errors.some(e => e.includes("data row")), "Header Only - reports minimum rows error", `Got errors: ${headerOnlyReport.errors}`);

  // ----------------------------------------------------
  // TEST 4: Malformed CSV (Unclosed Quote & Jagged Column Count)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 4: Malformed CSV...");
  const malformedCsvPath = path.join(tempDir, "malformed.csv");
  const malformedContent = 
`timestamp,sourceIp,destinationIp,action
2026-08-31T20:00:00Z,192.168.1.1,10.0.0.1,ALLOWED
2026-08-31T20:01:00Z,192.168.1.2,"UNCLOSED QUOTE VALUE,10.0.0.2
2026-08-31T20:02:00Z,192.168.1.3`; // Missing columns
  fs.writeFileSync(malformedCsvPath, malformedContent, "utf8");

  const malformedReport = await validateDataset(malformedCsvPath, {
    originalFilename: "malformed.csv"
  });

  assert(malformedReport.isValid === false, "Malformed CSV - isValid is false", `Got isValid=${malformedReport.isValid}`);
  assert(malformedReport.status === "INVALID", "Malformed CSV - status is INVALID", `Got status=${malformedReport.status}`);
  assert(malformedReport.errors.some(e => e.toLowerCase().includes("malformed") || e.includes("columns, expected")), "Malformed CSV - detected formatting errors", `Got errors: ${malformedReport.errors}`);

  // ----------------------------------------------------
  // TEST 5: Oversized File Limit
  // ----------------------------------------------------
  console.log("\n▶ Running Test 5: Oversized File Limit...");
  const oversizedPath = path.join(tempDir, "oversized.csv");
  fs.writeFileSync(oversizedPath, "col1,col2\nval1,val2\n", "utf8");

  // Enforce small maxFileSize limit (10 bytes) for test
  const oversizedReport = await validateDataset(oversizedPath, {
    originalFilename: "oversized.csv",
    maxFileSize: 10
  });

  assert(oversizedReport.isValid === false, "Oversized File - isValid is false", `Got isValid=${oversizedReport.isValid}`);
  assert(oversizedReport.errors.some(e => e.includes("exceeds maximum limit")), "Oversized File - reports size error", `Got errors: ${oversizedReport.errors}`);

  // ----------------------------------------------------
  // TEST 6: Invalid File Extension (.exe / .json)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 6: Invalid File Extension...");
  const invalidExtPath = path.join(tempDir, "malware_payload.exe");
  fs.writeFileSync(invalidExtPath, "not,a,real,csv", "utf8");

  const invalidExtReport = await validateDataset(invalidExtPath, {
    originalFilename: "malware_payload.exe"
  });

  assert(invalidExtReport.isValid === false, "Invalid Extension - isValid is false", `Got isValid=${invalidExtReport.isValid}`);
  assert(invalidExtReport.errors.some(e => e.includes("extension")), "Invalid Extension - reports extension error", `Got errors: ${invalidExtReport.errors}`);

  // ----------------------------------------------------
  // TEST 7: Duplicate Columns in Header
  // ----------------------------------------------------
  console.log("\n▶ Running Test 7: Duplicate Columns...");
  const duplicateCsvPath = path.join(tempDir, "duplicate_cols.csv");
  const duplicateContent = 
`timestamp,sourceIp,destinationIp,SourceIp,action
2026-08-31T20:00:00Z,192.168.1.1,10.0.0.1,192.168.1.1,BLOCKED`;
  fs.writeFileSync(duplicateCsvPath, duplicateContent, "utf8");

  const duplicateReport = await validateDataset(duplicateCsvPath, {
    originalFilename: "duplicate_cols.csv"
  });

  assert(duplicateReport.isValid === false, "Duplicate Columns - isValid is false", `Got isValid=${duplicateReport.isValid}`);
  assert(duplicateReport.errors.some(e => e.toLowerCase().includes("duplicate column")), "Duplicate Columns - reports duplicate error", `Got errors: ${duplicateReport.errors}`);

  // ----------------------------------------------------
  // TEST 8: Invalid Encoding / Binary Garbage disguised as CSV
  // ----------------------------------------------------
  console.log("\n▶ Running Test 8: Invalid Encoding / Binary Content...");
  const binaryCsvPath = path.join(tempDir, "fake_binary.csv");
  // Write raw binary with null bytes and non-printable bytes
  const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x7f, 0x80, 0xff, 0x00, 0x1b, 0x04, 0x00]);
  fs.writeFileSync(binaryCsvPath, binaryBuffer);

  const binaryReport = await validateDataset(binaryCsvPath, {
    originalFilename: "fake_binary.csv"
  });

  assert(binaryReport.isValid === false, "Binary Content - isValid is false", `Got isValid=${binaryReport.isValid}`);
  assert(binaryReport.errors.some(e => e.toLowerCase().includes("binary") || e.includes("encoding")), "Binary Content - reports encoding/binary error", `Got errors: ${binaryReport.errors}`);

  // ----------------------------------------------------
  // TEST 9: UTF-8 BOM Handling & Warnings on Null Cells
  // ----------------------------------------------------
  console.log("\n▶ Running Test 9: UTF-8 BOM & Data Quality Warnings...");
  const bomCsvPath = path.join(tempDir, "bom_with_nulls.csv");
  const bomContent = "\uFEFFtimestamp,sourceIp,destinationIp,action\n2026-08-31T20:00:00Z,192.168.1.1,,ALLOWED\n2026-08-31T20:01:00Z,192.168.1.2,10.0.0.2,NULL\n";
  fs.writeFileSync(bomCsvPath, bomContent, "utf8");

  const bomReport = await validateDataset(bomCsvPath, {
    originalFilename: "bom_with_nulls.csv"
  });

  assert(bomReport.isValid === true, "BOM & Warnings - isValid is true", `Got isValid=${bomReport.isValid}`);
  assert(bomReport.status === "WARNING", "BOM & Warnings - status is WARNING", `Got status=${bomReport.status}`);
  assert(bomReport.metadata.encoding.includes("BOM"), "BOM & Warnings - detected BOM", `Got encoding=${bomReport.metadata.encoding}`);
  assert(bomReport.warnings.length > 0, "BOM & Warnings - warnings recorded", `Got warnings=${bomReport.warnings}`);

  // ----------------------------------------------------
  // TEST 10: Filename Sanitization Security Check
  // ----------------------------------------------------
  console.log("\n▶ Running Test 10: Filename Sanitization Security Check...");
  const unsafeName1 = "../../../etc/passwd";
  const unsafeName2 = "dataset; rm -rf /; .csv";
  const unsafeName3 = "normal_forensics-2026.08.31.csv";

  assert(!sanitizeFilename(unsafeName1).includes(".."), "Sanitize: strips path traversal", `Got ${sanitizeFilename(unsafeName1)}`);
  assert(!sanitizeFilename(unsafeName2).includes(";"), "Sanitize: strips shell injection characters", `Got ${sanitizeFilename(unsafeName2)}`);
  assert(sanitizeFilename(unsafeName3) === "normal_forensics-2026.08.31.csv", "Sanitize: preserves valid filename", `Got ${sanitizeFilename(unsafeName3)}`);

  // Cleanup temp files
  try {
    const files = fs.readdirSync(tempDir);
    for (const f of files) {
      fs.unlinkSync(path.join(tempDir, f));
    }
    fs.rmdirSync(tempDir);
  } catch (e) {
    // Ignore cleanup error
  }

  console.log("\n========================================================");
  console.log(`  TOTAL TESTS: ${totalTests}`);
  console.log(`  PASSED:      ${passedTests}`);
  console.log(`  FAILED:      ${failedTests}`);
  console.log("========================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
