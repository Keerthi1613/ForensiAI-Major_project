import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { profileDataset, calculateNumericalStats, isTimestampCandidate, isMissingValue } from "../datasetProfiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, "temp_profile_test_files");

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

async function runProfilingTests() {
  console.log("\n========================================================");
  console.log("  FORENSIAI MODULE 2 - DATASET PROFILING TEST SUITE");
  console.log("========================================================\n");

  // ----------------------------------------------------
  // TEST 1: Normal Balanced Dataset
  // ----------------------------------------------------
  console.log("▶ Running Test 1: Normal Dataset with Mixed Types...");
  const normalPath = path.join(tempDir, "normal_traffic.csv");
  const normalCsv = 
`timestamp,sourceIp,packetSize,duration,protocol,attack_type
2026-08-31T20:00:00Z,192.168.1.1,100,1.5,TCP,Normal
2026-08-31T20:01:00Z,192.168.1.2,500,2.0,UDP,DDoS
2026-08-31T20:02:00Z,192.168.1.3,1200,3.5,TCP,Normal
2026-08-31T20:03:00Z,192.168.1.4,250,0.5,HTTP,PortScan`;
  fs.writeFileSync(normalPath, normalCsv, "utf8");

  const normalProfile = await profileDataset(normalPath);

  assert(normalProfile.summary.totalRows === 4, "Normal: totalRows is 4", `Got ${normalProfile.summary.totalRows}`);
  assert(normalProfile.summary.totalColumns === 6, "Normal: totalColumns is 6", `Got ${normalProfile.summary.totalColumns}`);
  assert(normalProfile.summary.numericalFeatureCount === 2, "Normal: numerical count is 2 (packetSize, duration)", `Got ${normalProfile.summary.numericalFeatureCount}`);
  assert(normalProfile.features.numericalColumns.includes("packetSize"), "Normal: packetSize is numerical", `Got ${normalProfile.features.numericalColumns}`);
  assert(normalProfile.features.numericalColumns.includes("duration"), "Normal: duration is numerical", `Got ${normalProfile.features.numericalColumns}`);
  assert(normalProfile.summary.timestampCandidateCount === 1, "Normal: timestamp detected", `Got ${normalProfile.summary.timestampCandidateCount}`);

  // ----------------------------------------------------
  // TEST 2: Missing Values Detection & Statistics
  // ----------------------------------------------------
  console.log("\n▶ Running Test 2: Missing Values & Null Rates...");
  const missingPath = path.join(tempDir, "missing_data.csv");
  const missingCsv = 
`sourceIp,bytes,status
192.168.1.1,100,OK
192.168.1.2,NaN,
192.168.1.3,NULL,FAILED
192.168.1.4,200,OK`;
  fs.writeFileSync(missingPath, missingCsv, "utf8");

  const missingProfile = await profileDataset(missingPath);

  assert(missingProfile.summary.totalMissingValues === 3, "Missing: detected 3 total missing cells", `Got ${missingProfile.summary.totalMissingValues}`);
  const bytesProfile = missingProfile.features.profiles.find(p => p.name === "bytes");
  assert(bytesProfile.missingCount === 2, "Missing: 'bytes' has 2 missing values", `Got ${bytesProfile.missingCount}`);
  assert(bytesProfile.missingPercentage === 50, "Missing: 'bytes' is 50% missing", `Got ${bytesProfile.missingPercentage}%`);

  // ----------------------------------------------------
  // TEST 3: Categorical Statistics & Frequency Distribution
  // ----------------------------------------------------
  console.log("\n▶ Running Test 3: Categorical Frequencies & Top Values...");
  const catPath = path.join(tempDir, "categorical_data.csv");
  const catCsv = 
`protocol,action
TCP,ALLOW
TCP,ALLOW
TCP,BLOCK
UDP,ALLOW
ICMP,BLOCK`;
  fs.writeFileSync(catPath, catCsv, "utf8");

  const catProfile = await profileDataset(catPath);

  const protoProfile = catProfile.features.profiles.find(p => p.name === "protocol");
  assert(protoProfile.inferredType === "categorical", "Categorical: protocol inferred as categorical", `Got ${protoProfile.inferredType}`);
  assert(protoProfile.categoricalStats.uniqueCount === 3, "Categorical: protocol has 3 unique values", `Got ${protoProfile.categoricalStats.uniqueCount}`);
  assert(protoProfile.categoricalStats.topValue === "TCP", "Categorical: topValue is TCP", `Got ${protoProfile.categoricalStats.topValue}`);
  assert(protoProfile.categoricalStats.topFrequency === 3, "Categorical: topFrequency is 3", `Got ${protoProfile.categoricalStats.topFrequency}`);
  assert(protoProfile.categoricalStats.topPercentage === 60, "Categorical: topPercentage is 60%", `Got ${protoProfile.categoricalStats.topPercentage}%`);

  // ----------------------------------------------------
  // TEST 4: Numerical Statistics (Min, Max, Mean, Median, StdDev, Q25, Q75)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 4: Numerical Summary Stats...");
  const numPath = path.join(tempDir, "numerical_data.csv");
  // Values: 10, 20, 30, 40, 50 -> Min=10, Max=50, Mean=30, Median=30
  const numCsv = 
`score,latency
10,1.0
20,2.0
30,3.0
40,4.0
50,5.0`;
  fs.writeFileSync(numPath, numCsv, "utf8");

  const numProfile = await profileDataset(numPath);
  const scoreProfile = numProfile.features.profiles.find(p => p.name === "score");

  assert(scoreProfile.numericalStats.min === 10, "Numeric: min is 10", `Got ${scoreProfile.numericalStats.min}`);
  assert(scoreProfile.numericalStats.max === 50, "Numeric: max is 50", `Got ${scoreProfile.numericalStats.max}`);
  assert(scoreProfile.numericalStats.mean === 30, "Numeric: mean is 30", `Got ${scoreProfile.numericalStats.mean}`);
  assert(scoreProfile.numericalStats.median === 30, "Numeric: median is 30", `Got ${scoreProfile.numericalStats.median}`);
  assert(scoreProfile.numericalStats.q25 === 20, "Numeric: q25 is 20", `Got ${scoreProfile.numericalStats.q25}`);
  assert(scoreProfile.numericalStats.q75 === 40, "Numeric: q75 is 40", `Got ${scoreProfile.numericalStats.q75}`);

  // ----------------------------------------------------
  // TEST 5: Exact Duplicate Rows Detection
  // ----------------------------------------------------
  console.log("\n▶ Running Test 5: Duplicate Rows Detection...");
  const dupPath = path.join(tempDir, "duplicate_rows.csv");
  const dupCsv = 
`ip,port,protocol
192.168.1.1,80,TCP
192.168.1.1,80,TCP
192.168.1.1,80,TCP
10.0.0.1,443,HTTPS`;
  fs.writeFileSync(dupPath, dupCsv, "utf8");

  const dupProfile = await profileDataset(dupPath);

  assert(dupProfile.summary.duplicateRowCount === 2, "Duplicate: detected 2 duplicate rows", `Got ${dupProfile.summary.duplicateRowCount}`);
  assert(dupProfile.summary.duplicateRowPercentage === 50, "Duplicate: 50% duplicate rows", `Got ${dupProfile.summary.duplicateRowPercentage}%`);

  // ----------------------------------------------------
  // TEST 6: Dataset With Target & Class Counts
  // ----------------------------------------------------
  console.log("\n▶ Running Test 6: Dataset with Supervised Target...");
  const targetPath = path.join(tempDir, "dataset_with_target.csv");
  const targetCsv = 
`src_ip,bytes,threat_category
1.1.1.1,100,Benign
1.1.1.2,200,Benign
1.1.1.3,300,Malware
1.1.1.4,400,Phishing`;
  fs.writeFileSync(targetPath, targetCsv, "utf8");

  const targetProfile = await profileDataset(targetPath);

  assert(targetProfile.target.hasTarget === true, "Target: hasTarget is true", `Got ${targetProfile.target.hasTarget}`);
  assert(targetProfile.target.targetColumn === "threat_category", "Target: targetColumn is threat_category", `Got ${targetProfile.target.targetColumn}`);
  assert(targetProfile.target.classCount === 3, "Target: 3 distinct classes (Benign, Malware, Phishing)", `Got ${targetProfile.target.classCount}`);
  assert(targetProfile.target.classCounts["Benign"] === 2, "Target: Benign count is 2", `Got ${targetProfile.target.classCounts["Benign"]}`);

  // ----------------------------------------------------
  // TEST 7: Dataset Without Target (No Supervised Target)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 7: Dataset Without Target...");
  const noTargetPath = path.join(tempDir, "unlabeled_data.csv");
  const noTargetCsv = 
`source_ip,destination_ip,port_number,bytes_transferred
192.168.1.1,10.0.0.1,80,1024
192.168.1.2,10.0.0.2,443,2048
192.168.1.3,10.0.0.3,8080,4096`;
  fs.writeFileSync(noTargetPath, noTargetCsv, "utf8");

  const noTargetProfile = await profileDataset(noTargetPath);

  assert(noTargetProfile.target.hasTarget === false, "No Target: hasTarget is false", `Got ${noTargetProfile.target.hasTarget}`);
  assert(noTargetProfile.target.targetColumn === null, "No Target: targetColumn is null", `Got ${noTargetProfile.target.targetColumn}`);
  assert(noTargetProfile.target.message.includes("No supervised target detected"), "No Target: explicit message shown", `Got ${noTargetProfile.target.message}`);

  // ----------------------------------------------------
  // TEST 8: Highly Imbalanced Target (e.g. 99 Normal vs 1 Attack)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 8: Highly Imbalanced Target...");
  const imbalPath = path.join(tempDir, "imbalanced_target.csv");
  let imbalCsv = "id,value,attack_label\n";
  for (let i = 0; i < 99; i++) {
    imbalCsv += `${i},${i * 10},Normal\n`;
  }
  imbalCsv += "99,990,Infiltration\n"; // 1 Attack
  fs.writeFileSync(imbalPath, imbalCsv, "utf8");

  const imbalProfile = await profileDataset(imbalPath);

  assert(imbalProfile.target.hasTarget === true, "Imbalanced: hasTarget is true", `Got ${imbalProfile.target.hasTarget}`);
  assert(imbalProfile.target.imbalanceRatio === 99.0, "Imbalanced: ratio is 99.0:1", `Got ${imbalProfile.target.imbalanceRatio}`);
  assert(imbalProfile.target.isImbalanced === true, "Imbalanced: isImbalanced is true", `Got ${imbalProfile.target.isImbalanced}`);
  assert(imbalProfile.target.imbalanceSeverity === "Severe", "Imbalanced: severity is Severe", `Got ${imbalProfile.target.imbalanceSeverity}`);

  // ----------------------------------------------------
  // TEST 9: Manual Target Selection Override
  // ----------------------------------------------------
  console.log("\n▶ Running Test 9: Manual Target Selection Override...");
  const customTargetProfile = await profileDataset(noTargetPath, {
    targetColumn: "port_number"
  });

  assert(customTargetProfile.target.hasTarget === true, "Custom Target: hasTarget is true", `Got ${customTargetProfile.target.hasTarget}`);
  assert(customTargetProfile.target.targetColumn === "port_number", "Custom Target: target is port_number", `Got ${customTargetProfile.target.targetColumn}`);

  // Cleanup temp files
  try {
    const files = fs.readdirSync(tempDir);
    for (const f of files) {
      fs.unlinkSync(path.join(tempDir, f));
    }
    fs.rmdirSync(tempDir);
  } catch (e) {}

  console.log("\n========================================================");
  console.log(`  TOTAL TESTS: ${totalTests}`);
  console.log(`  PASSED:      ${passedTests}`);
  console.log(`  FAILED:      ${failedTests}`);
  console.log("========================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

runProfilingTests();
