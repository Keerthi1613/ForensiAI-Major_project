import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { profileDataset } from "../datasetProfiler.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempDir = path.join(__dirname, "temp_memory_test");

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

async function runMemoryBenchmark() {
  console.log("\n========================================================");
  console.log("  FORENSIAI STREAMING PROFILER MEMORY BENCHMARK TEST");
  console.log("========================================================\n");

  // ---------------------------------------------------------------------
  // TEST 1: Synthetic 100,000 Rows CSV Stream Profiling & Heap Invariance
  // ---------------------------------------------------------------------
  console.log("▶ Test 1: Generating 100,000-row synthetic forensic CSV (15 columns)...");
  const syntheticPath = path.join(tempDir, "synthetic_100k.csv");
  const writeStream = fs.createWriteStream(syntheticPath, { encoding: "utf8" });

  const headers = [
    "timestamp", "src_ip", "dst_ip", "src_port", "dst_port", "protocol",
    "flow_duration", "tot_fwd_pkts", "tot_bwd_pkts", "fwd_pkt_len_max",
    "flow_bytes_per_s", "flow_pkts_per_s", "fwd_iat_mean", "bwd_iat_mean", "Label"
  ];
  writeStream.write(headers.join(",") + "\n");

  const NUM_ROWS = 100000;
  for (let i = 0; i < NUM_ROWS; i++) {
    const isAttack = i % 20 === 0;
    const label = isAttack ? "DDoS_Attack" : "Benign";
    const srcIp = `192.168.1.${(i % 254) + 1}`;
    const dstIp = `10.0.0.${(i % 50) + 1}`;
    const srcPort = 1024 + (i % 60000);
    const dstPort = isAttack ? 80 : (i % 2 === 0 ? 443 : 8080);
    const proto = (i % 3 === 0) ? "TCP" : (i % 3 === 1 ? "UDP" : "ICMP");
    const duration = (i * 1.5).toFixed(2);
    const fwdPkts = (i % 100) + 1;
    const bwdPkts = (i % 50);
    const maxLen = 1460;
    const bytesPerSec = (fwdPkts * 1460 / (parseFloat(duration) + 0.1)).toFixed(2);
    const pktsPerSec = ((fwdPkts + bwdPkts) / (parseFloat(duration) + 0.1)).toFixed(2);
    const fwdIat = (duration / 5).toFixed(2);
    const bwdIat = (duration / 10).toFixed(2);
    const timestamp = "2026-09-01T12:00:00Z";

    const row = `${timestamp},${srcIp},${dstIp},${srcPort},${dstPort},${proto},${duration},${fwdPkts},${bwdPkts},${maxLen},${bytesPerSec},${pktsPerSec},${fwdIat},${bwdIat},${label}\n`;
    writeStream.write(row);
  }

  await new Promise(resolve => writeStream.end(resolve));
  const fileSizeMb = (fs.statSync(syntheticPath).size / (1024 * 1024)).toFixed(2);
  console.log(`  📁 Synthetic file created: ${fileSizeMb} MB (${NUM_ROWS.toLocaleString()} rows)`);

  if (global.gc) global.gc();
  const initialHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
  console.log(`  Initial Heap Usage: ${initialHeapMb.toFixed(2)} MB`);

  let progressEvents = 0;
  const startTime = Date.now();
  const profile = await profileDataset(syntheticPath, {
    onProgress: (p) => {
      progressEvents++;
      if (p.rowsProcessed % 50000 === 0) {
        const currentHeap = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
        console.log(`    📊 Progress: ${p.rowsProcessed.toLocaleString()} rows (${p.progress}%) | Heap: ${currentHeap} MB`);
      }
    }
  });

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  const finalHeapMb = process.memoryUsage().heapUsed / (1024 * 1024);
  const heapDeltaMb = Math.abs(finalHeapMb - initialHeapMb);

  console.log(`  Completed in ${durationSec}s. Final Heap: ${finalHeapMb.toFixed(2)} MB (Delta: ${heapDeltaMb.toFixed(2)} MB)`);

  assert(profile.summary.totalRows === NUM_ROWS, "Synthetic: accurately counted 100,000 rows", `Got ${profile.summary.totalRows}`);
  assert(profile.summary.totalColumns === 15, "Synthetic: accurately counted 15 columns", `Got ${profile.summary.totalColumns}`);
  assert(heapDeltaMb < 35, `Synthetic: memory heap remained flat (Delta: ${heapDeltaMb.toFixed(2)} MB < 35 MB limit)`, `Heap delta too high: ${heapDeltaMb.toFixed(2)} MB`);
  assert(profile.target.hasTarget === true, "Synthetic: target column detected", `Target: ${profile.target.targetColumn}`);
  assert(profile.target.targetColumn === "Label", "Synthetic: target is 'Label'", `Got ${profile.target.targetColumn}`);
  assert(profile.target.classCounts["Benign"] === 95000, "Synthetic: Benign count is 95,000", `Got ${profile.target.classCounts["Benign"]}`);
  assert(profile.target.classCounts["DDoS_Attack"] === 5000, "Synthetic: DDoS_Attack count is 5,000", `Got ${profile.target.classCounts["DDoS_Attack"]}`);

  // ---------------------------------------------------------------------
  // TEST 2: Profiling 02-14-2018.csv CSE-CIC-IDS2018 file if available
  // ---------------------------------------------------------------------
  const cicPath = path.join(__dirname, "..", "uploads", "datasets", "dataset_1788272979179_416e6088d6fb_02-14-2018.csv");
  if (fs.existsSync(cicPath)) {
    console.log(`\n▶ Test 2: Profiling CSE-CIC-IDS2018 actual file: 02-14-2018.csv (~358MB, 1,048,576 rows)...`);
    const cicSizeMb = (fs.statSync(cicPath).size / (1024 * 1024)).toFixed(2);
    console.log(`  📁 File found: ${cicSizeMb} MB`);

    const cicStartHeap = process.memoryUsage().heapUsed / (1024 * 1024);
    const cicStartTime = Date.now();

    const cicProfile = await profileDataset(cicPath, {
      onProgress: (p) => {
        if (p.rowsProcessed % 250000 === 0) {
          const currentHeap = (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2);
          console.log(`    ⚡ 02-14-2018.csv Stream: ${p.rowsProcessed.toLocaleString()} rows (${p.progress}%) | Heap: ${currentHeap} MB`);
        }
      }
    });

    const cicDuration = ((Date.now() - cicStartTime) / 1000).toFixed(2);
    const cicEndHeap = process.memoryUsage().heapUsed / (1024 * 1024);
    const cicHeapDelta = Math.abs(cicEndHeap - cicStartHeap);

    console.log(`  ✅ 02-14-2018.csv profiled in ${cicDuration}s. Heap: ${cicEndHeap.toFixed(2)} MB (Delta: ${cicHeapDelta.toFixed(2)} MB)`);

    assert(cicProfile.summary.totalRows === 1048575, "02-14-2018.csv: accurately processed 1,048,575 rows", `Got ${cicProfile.summary.totalRows}`);
    assert(cicProfile.summary.totalColumns === 80, "02-14-2018.csv: accurately detected 80 columns", `Got ${cicProfile.summary.totalColumns}`);
    assert(cicHeapDelta < 45, `02-14-2018.csv: heap usage stayed flat with 0 heap crash (Delta: ${cicHeapDelta.toFixed(2)} MB < 45 MB limit)`, `Heap delta: ${cicHeapDelta.toFixed(2)} MB`);
    assert(cicProfile.target.hasTarget === true, "02-14-2018.csv: target detected", `Target: ${cicProfile.target.targetColumn}`);
  }

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

runMemoryBenchmark().catch(err => {
  console.error("Benchmark failed with error:", err);
  process.exit(1);
});
