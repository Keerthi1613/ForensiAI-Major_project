import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MLPreprocessingPipeline } from "../mlPreprocessingPipeline.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, "temp_prep_test_files");

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

async function runPreprocessingTests() {
  console.log("\n========================================================");
  console.log("  FORENSIAI MODULE 3 - ML PREPROCESSING PIPELINE TESTS");
  console.log("========================================================\n");

  // ----------------------------------------------------
  // TEST 1: Missing Numerical Values Imputation
  // ----------------------------------------------------
  console.log("▶ Running Test 1: Missing Numerical Values Imputation...");
  const trainData1 = [
    { packet_bytes: "100", duration: "10" },
    { packet_bytes: "200", duration: "20" },
    { packet_bytes: "300", duration: "30" } // Median packet_bytes = 200
  ];

  const pipeline1 = new MLPreprocessingPipeline({
    numericalScaling: "none",
    imputationStrategy: { numerical: "median" }
  });
  pipeline1.fit(trainData1);

  const testWithMissing = [
    { packet_bytes: null, duration: "15" },
    { packet_bytes: "NaN", duration: "25" }
  ];
  const transformed1 = pipeline1.transform(testWithMissing);

  assert(transformed1.X.length === 2, "Missing Num: transformed 2 rows", `Got ${transformed1.X.length}`);
  // Expected imputed value for packet_bytes is median (200)
  assert(transformed1.X[0][0] === 200, "Missing Num: null imputed with train median (200)", `Got ${transformed1.X[0][0]}`);
  assert(transformed1.X[1][0] === 200, "Missing Num: NaN imputed with train median (200)", `Got ${transformed1.X[1][0]}`);

  // ----------------------------------------------------
  // TEST 2: Missing Categorical Values Imputation
  // ----------------------------------------------------
  console.log("\n▶ Running Test 2: Missing Categorical Values Imputation...");
  const trainData2 = [
    { protocol: "TCP", service: "HTTP" },
    { protocol: "UDP", service: "DNS" },
    { protocol: "TCP", service: "HTTP" }
  ];

  const pipeline2 = new MLPreprocessingPipeline({
    categoricalEncoding: "onehot",
    imputationStrategy: { categorical: "missing" }
  });
  pipeline2.fit(trainData2);

  const testWithMissingCat = [
    { protocol: null, service: "DNS" }
  ];
  const transformed2 = pipeline2.transform(testWithMissingCat);

  assert(transformed2.X.length === 1, "Missing Cat: transformed 1 row", `Got ${transformed2.X.length}`);
  // Missing protocol should be safe 0-vector across known categories
  assert(transformed2.X[0].every(v => !isNaN(v)), "Missing Cat: all output features are finite numbers", `Got ${transformed2.X[0]}`);

  // ----------------------------------------------------
  // TEST 3: Unknown Categorical Values During Inference
  // ----------------------------------------------------
  console.log("\n▶ Running Test 3: Unknown Categorical Values during Inference...");
  const trainData3 = [
    { protocol: "TCP", flag: "SYN" },
    { protocol: "UDP", flag: "ACK" }
  ];

  const pipeline3 = new MLPreprocessingPipeline({
    categoricalEncoding: "onehot"
  });
  pipeline3.fit(trainData3);

  // Inference dataset has brand new unseen category 'ICMP' and 'FIN'
  const inferenceUnseen = [
    { protocol: "ICMP", flag: "FIN" }
  ];
  const transformed3 = pipeline3.transform(inferenceUnseen);

  assert(transformed3.X.length === 1, "Unknown Cat: transformed unseen category without error", `Got ${transformed3.X.length}`);
  assert(transformed3.featureCount === pipeline3.outputFeatureSchema.length, "Unknown Cat: feature count strictly matches schema", `Got ${transformed3.featureCount}`);
  // In one-hot, unknown categories safely yield 0.0 for all known flags
  assert(transformed3.X[0].every(v => v === 0.0), "Unknown Cat: unseen category yields 0-vector without shifting alignment", `Got ${transformed3.X[0]}`);

  // ----------------------------------------------------
  // TEST 4: Infinite Values Handling (+/- Infinity)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 4: Infinite Values (+/- Infinity)...");
  const trainData4 = [
    { flow_rate: "10.0" },
    { flow_rate: "50.0" },
    { flow_rate: "100.0" } // finiteMin = 10, finiteMax = 100
  ];

  const pipeline4 = new MLPreprocessingPipeline({
    numericalScaling: "none"
  });
  pipeline4.fit(trainData4);

  const testWithInfinity = [
    { flow_rate: "Infinity" },
    { flow_rate: "-Infinity" }
  ];
  const transformed4 = pipeline4.transform(testWithInfinity);

  assert(transformed4.X[0][0] === 100.0, "Infinity: +Infinity mapped to train finiteMax (100.0)", `Got ${transformed4.X[0][0]}`);
  assert(transformed4.X[1][0] === 10.0, "Infinity: -Infinity mapped to train finiteMin (10.0)", `Got ${transformed4.X[1][0]}`);
  assert(isFinite(transformed4.X[0][0]) && isFinite(transformed4.X[1][0]), "Infinity: all outputs are strictly finite", `Got ${transformed4.X}`);

  // ----------------------------------------------------
  // TEST 5: Schema Mismatch (Missing or Extra Columns in Inference)
  // ----------------------------------------------------
  console.log("\n▶ Running Test 5: Schema Mismatch in Inference Data...");
  const trainData5 = [
    { feature_a: "10", feature_b: "20", feature_c: "30" },
    { feature_a: "15", feature_b: "25", feature_c: "35" }
  ];

  const pipeline5 = new MLPreprocessingPipeline({ numericalScaling: "none" });
  pipeline5.fit(trainData5);

  // Inference row missing feature_b, but with extra unknown column 'random_junk'
  const inferenceMismatch = [
    { feature_a: "12", random_junk: "999", feature_c: "32" }
  ];
  const transformed5 = pipeline5.transform(inferenceMismatch);

  assert(transformed5.X.length === 1, "Schema Mismatch: transformed row", `Got ${transformed5.X.length}`);
  assert(transformed5.featureCount === 3, "Schema Mismatch: exactly 3 features matching training schema", `Got ${transformed5.featureCount}`);
  // Missing feature_b imputed with median (22.5)
  assert(transformed5.X[0][1] === 22.5, "Schema Mismatch: missing feature_b imputed cleanly", `Got ${transformed5.X[0][1]}`);

  // ----------------------------------------------------
  // TEST 6: Feature Ordering Determinism
  // ----------------------------------------------------
  console.log("\n▶ Running Test 6: Feature Ordering & Alignment Determinism...");
  const trainData6 = [
    { alpha: "1", beta: "2", gamma: "3" },
    { alpha: "4", beta: "5", gamma: "6" }
  ];

  const pipeline6 = new MLPreprocessingPipeline({ numericalScaling: "none" });
  pipeline6.fit(trainData6);

  // Row 1 standard order
  const r1 = [{ alpha: "10", beta: "20", gamma: "30" }];
  // Row 2 inverted order
  const r2 = [{ gamma: "30", alpha: "10", beta: "20" }];

  const t1 = pipeline6.transform(r1);
  const t2 = pipeline6.transform(r2);

  assert(JSON.stringify(t1.X[0]) === JSON.stringify(t2.X[0]), "Feature Ordering: inverted input keys produce identical output vector", `t1=${t1.X[0]} t2=${t2.X[0]}`);

  // ----------------------------------------------------
  // TEST 7: Train / Inference Serialization Consistency
  // ----------------------------------------------------
  console.log("\n▶ Running Test 7: Serialization & Inference Consistency...");
  const trainData7 = [
    { bytes: "100", protocol: "TCP", label: "Normal" },
    { bytes: "500", protocol: "UDP", label: "DDoS" },
    { bytes: "1000", protocol: "TCP", label: "Normal" }
  ];

  const pipeline7 = new MLPreprocessingPipeline({
    targetColumn: "label",
    numericalScaling: "standard",
    categoricalEncoding: "onehot"
  });
  pipeline7.fit(trainData7);

  const sampleRecord = [{ bytes: "250", protocol: "TCP" }];
  const originalTransform = pipeline7.transform(sampleRecord);

  // Serialize to JSON and reload in fresh pipeline instance
  const serialized = pipeline7.toJSON();
  const loadedPipeline = MLPreprocessingPipeline.fromJSON(serialized);
  const loadedTransform = loadedPipeline.transform(sampleRecord);

  assert(loadedPipeline.fitted === true, "Serialization: loaded pipeline is marked fitted", `Got ${loadedPipeline.fitted}`);
  assert(JSON.stringify(originalTransform.X) === JSON.stringify(loadedTransform.X), "Serialization: loaded pipeline produces identical vector", `orig=${originalTransform.X} loaded=${loadedTransform.X}`);

  // ----------------------------------------------------
  // TEST 8: Data Leakage Prevention Check
  // ----------------------------------------------------
  console.log("\n▶ Running Test 8: Data Leakage Prevention Guarantee...");
  const fullDataset = [
    { value: "10" },
    { value: "20" },
    { value: "30" },
    { value: "10000" } // Extreme outlier in test split
  ];

  // Split first: train gets [10, 20, 30], test gets [10000]
  const { trainRows: tr, testRows: te } = MLPreprocessingPipeline.trainTestSplit(fullDataset, {
    testSize: 0.25,
    shuffle: false
  });

  const pipeline8 = new MLPreprocessingPipeline({ numericalScaling: "standard" });
  pipeline8.fit(tr); // Fit STRICTLY on trainRows

  // Training mean should be exactly 20.0 (not distorted by 10000)
  assert(pipeline8.numericalParams["value"].mean === 20.0, "Leakage Check: train mean is 20.0 and unaffected by test split", `Got ${pipeline8.numericalParams["value"].mean}`);

  // ----------------------------------------------------
  // TEST 9: Timestamp Feature Derivation
  // ----------------------------------------------------
  console.log("\n▶ Running Test 9: Timestamp Feature Derivation...");
  const timestampData = [
    { event_time: "2026-08-31T14:30:00Z" } // 2026-08-31 is a Monday (weekday=1), hour=14, day=31, month=8
  ];

  const pipeline9 = new MLPreprocessingPipeline({ deriveTimestamps: true });
  pipeline9.fit(timestampData);
  const transformed9 = pipeline9.transform(timestampData);

  assert(pipeline9.outputFeatureSchema.includes("time_event_time_hour"), "Timestamp: hour derived", `Schema: ${pipeline9.outputFeatureSchema}`);
  assert(pipeline9.outputFeatureSchema.includes("time_event_time_weekday"), "Timestamp: weekday derived", `Schema: ${pipeline9.outputFeatureSchema}`);
  assert(transformed9.X[0][0] === 14, "Timestamp: hour value is 14", `Got ${transformed9.X[0][0]}`);
  assert(transformed9.X[0][1] === 1, "Timestamp: weekday value is 1 (Monday)", `Got ${transformed9.X[0][1]}`);

  // ----------------------------------------------------
  // TEST 10: Identifier Exclusion
  // ----------------------------------------------------
  console.log("\n▶ Running Test 10: Identifier Exclusion Audit...");
  const idData = [
    { row_id: "rec_001", session_id: "sess_abc", threat_score: "85.5" },
    { row_id: "rec_002", session_id: "sess_xyz", threat_score: "12.0" }
  ];

  const pipeline10 = new MLPreprocessingPipeline({ handleIdentifiers: "exclude" });
  pipeline10.fit(idData);

  assert(pipeline10.excludedFeatures.includes("row_id"), "Identifier: row_id excluded from feature matrix", `Excluded: ${pipeline10.excludedFeatures}`);
  assert(pipeline10.excludedFeatures.includes("session_id"), "Identifier: session_id excluded from feature matrix", `Excluded: ${pipeline10.excludedFeatures}`);
  assert(pipeline10.outputFeatureSchema.length === 1 && pipeline10.outputFeatureSchema[0] === "num_threat_score", "Identifier: only non-identifier features in output matrix", `Schema: ${pipeline10.outputFeatureSchema}`);

  // Cleanup temp files
  try {
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

runPreprocessingTests();
