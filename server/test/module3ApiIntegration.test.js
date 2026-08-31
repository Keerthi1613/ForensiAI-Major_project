import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testModule3Api() {
  console.log("\n========================================================");
  console.log("  FORENSIAI MODULE 3 - API INTEGRATION TEST");
  console.log("========================================================\n");

  const sampleCsvPath = path.join(__dirname, "test_prep_sample.csv");
  const sampleContent = 
`id,timestamp,source_ip,packet_bytes,duration,protocol,label
rec_1,2026-08-31T20:00:00Z,192.168.1.1,100,1.5,TCP,Normal
rec_2,2026-08-31T20:01:00Z,192.168.1.2,500,2.0,UDP,DDoS
rec_3,2026-08-31T20:02:00Z,192.168.1.3,1200,3.5,TCP,Normal
rec_4,2026-08-31T20:03:00Z,192.168.1.4,250,0.5,HTTP,PortScan
rec_5,2026-08-31T20:04:00Z,192.168.1.5,800,2.2,TCP,Normal`;
  fs.writeFileSync(sampleCsvPath, sampleContent, "utf8");

  try {
    // 1. Upload sample dataset
    console.log("▶ Uploading dataset for preprocessing test...");
    const fileBuffer = fs.readFileSync(sampleCsvPath);
    const blob = new Blob([fileBuffer], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", blob, "prep_test_dataset.csv");

    const uploadRes = await fetch("http://localhost:8080/api/datasets/upload", {
      method: "POST",
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);
    const datasetId = uploadData.dataset.id;
    console.log(`  ✅ Dataset uploaded: ${datasetId}`);

    // 2. Call POST /api/datasets/:id/preprocess
    console.log(`\n▶ Calling POST /api/datasets/${datasetId}/preprocess...`);
    const prepRes = await fetch(`http://localhost:8080/api/datasets/${datasetId}/preprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetColumn: "label",
        testSize: 0.2,
        numericalScaling: "standard",
        categoricalEncoding: "onehot",
        deriveTimestamps: true,
        handleIdentifiers: "exclude"
      })
    });
    const prepData = await prepRes.json();
    if (!prepRes.ok) throw new Error(`Preprocess failed: ${JSON.stringify(prepData)}`);

    console.log(`  ✅ Preprocessing succeeded:`);
    console.log(`     - Leakage-Proof Status: ${prepData.leakagePreventionAudit.status}`);
    console.log(`     - Train Split Shape: [${prepData.matrices.trainShape.join(", ")}]`);
    console.log(`     - Test Split Shape:  [${prepData.matrices.testShape.join(", ")}]`);
    console.log(`     - Excluded Identifiers: ${prepData.schema.excludedFeatures.join(", ")}`);
    console.log(`     - Output Dimensions: ${prepData.schema.featureCount}`);

    // 3. Clean up dataset
    await fetch(`http://localhost:8080/api/datasets/${datasetId}`, { method: "DELETE" });
    console.log(`  ✅ Cleanup completed for ${datasetId}`);

    console.log("\n========================================================");
    console.log("  MODULE 3 API INTEGRATION TEST PASSED!");
    console.log("========================================================\n");
  } catch (err) {
    console.error("❌ Module 3 API Test Error:", err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(sampleCsvPath)) {
      fs.unlinkSync(sampleCsvPath);
    }
  }
}

testModule3Api();
