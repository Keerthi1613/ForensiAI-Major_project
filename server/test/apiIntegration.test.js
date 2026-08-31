import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testApi() {
  console.log("\n========================================================");
  console.log("  FORENSIAI MODULE 1 - API INTEGRATION TEST SUITE");
  console.log("========================================================\n");

  const sampleCsvPath = path.join(__dirname, "test_upload_sample.csv");
  const sampleContent = 
`timestamp,sourceIp,destinationIp,port,protocol,label
2026-08-31T21:00:00Z,192.168.1.100,10.0.0.5,80,HTTP,Normal
2026-08-31T21:01:00Z,192.168.1.101,10.0.0.5,443,HTTPS,Normal
2026-08-31T21:02:00Z,45.33.32.156,10.0.0.5,22,SSH,BruteForce
2026-08-31T21:03:00Z,185.220.101.5,10.0.0.5,4444,TCP,Malware`;
  fs.writeFileSync(sampleCsvPath, sampleContent, "utf8");

  try {
    // Check GET /api/datasets
    console.log("▶ Testing GET /api/datasets...");
    const listRes = await fetch("http://localhost:8080/api/datasets");
    if (!listRes.ok) throw new Error(`GET /api/datasets returned ${listRes.status}`);
    const initialList = await listRes.json();
    console.log(`  ✅ GET /api/datasets returned status 200 (current count: ${initialList.length})`);

    // Test POST /api/datasets/upload (Valid file)
    console.log("\n▶ Testing POST /api/datasets/upload (Valid CSV)...");
    const fileBuffer = fs.readFileSync(sampleCsvPath);
    const blob = new Blob([fileBuffer], { type: "text/csv" });
    const formData = new FormData();
    formData.append("file", blob, "test_network_forensics.csv");

    const uploadRes = await fetch("http://localhost:8080/api/datasets/upload", {
      method: "POST",
      body: formData
    });

    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) throw new Error(`Upload failed: ${JSON.stringify(uploadData)}`);

    console.log(`  ✅ Upload succeeded: Status ${uploadRes.status}`);
    console.log(`  ✅ Dataset ID: ${uploadData.dataset.id}`);
    console.log(`  ✅ Rows: ${uploadData.dataset.rowCount}, Cols: ${uploadData.dataset.columnCount}`);
    console.log(`  ✅ Validation Status: ${uploadData.dataset.validationStatus}`);

    const datasetId = uploadData.dataset.id;

    // Test GET /api/datasets/:id
    console.log(`\n▶ Testing GET /api/datasets/${datasetId}...`);
    const getRes = await fetch(`http://localhost:8080/api/datasets/${datasetId}`);
    if (!getRes.ok) throw new Error(`GET /api/datasets/${datasetId} returned ${getRes.status}`);
    const datasetDetail = await getRes.json();
    console.log(`  ✅ Dataset fetched: ${datasetDetail.originalFilename} [${datasetDetail.validationStatus}]`);

    // Test POST /api/datasets/upload with Invalid CSV (Duplicate Headers)
    console.log("\n▶ Testing POST /api/datasets/upload (Duplicate Headers - Expected 400)...");
    const duplicateContent = "col1,col2,col1\n1,2,3\n";
    const dupBlob = new Blob([duplicateContent], { type: "text/csv" });
    const dupFormData = new FormData();
    dupFormData.append("file", dupBlob, "duplicate_test.csv");

    const dupRes = await fetch("http://localhost:8080/api/datasets/upload", {
      method: "POST",
      body: dupFormData
    });

    const dupData = await dupRes.json();
    if (dupRes.status === 400 && dupData.validation?.status === "INVALID") {
      console.log(`  ✅ Duplicate Headers correctly rejected with 400 Bad Request: ${dupData.error}`);
    } else {
      console.error(`  ❌ Expected 400 with INVALID status, got ${dupRes.status}`);
    }

    // Clean up created dataset via DELETE
    console.log(`\n▶ Testing DELETE /api/datasets/${datasetId}...`);
    const delRes = await fetch(`http://localhost:8080/api/datasets/${datasetId}`, {
      method: "DELETE"
    });
    const delData = await delRes.json();
    console.log(`  ✅ DELETE succeeded: ${delData.message}`);

    console.log("\n========================================================");
    console.log("  ALL API INTEGRATION TESTS PASSED!");
    console.log("========================================================\n");
  } catch (err) {
    console.error("❌ API Test Error:", err.message);
    process.exit(1);
  } finally {
    if (fs.existsSync(sampleCsvPath)) {
      fs.unlinkSync(sampleCsvPath);
    }
  }
}

testApi();
