import { execFile } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const bridgeScript = path.join(projectRoot, "ml", "bridge.py");

/**
 * Executes the Python model bridge script to inspect loaded XGBoost model artifacts.
 * @returns {Promise<Object>} Model inspection metadata JSON
 */
export const inspectModels = () => {
  return new Promise((resolve, reject) => {
    execFile("python", [bridgeScript, "--inspect"], { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Failed to execute Python ML bridge: ${error.message}\nStderr: ${stderr}`));
      }

      try {
        const jsonStart = stdout.indexOf("{");
        const jsonText = jsonStart !== -1 ? stdout.slice(jsonStart) : stdout;
        const data = JSON.parse(jsonText);
        if (data.status === "error") {
          return reject(new Error(data.error));
        }
        resolve(data);
      } catch (parseErr) {
        reject(new Error(`Failed to parse ML bridge response: ${parseErr.message}\nOutput: ${stdout}`));
      }
    });
  });
};

/**
 * Sends a single 78-feature sample to the Python XGBoost engine for inference.
 * @param {Object|Array} inputData - Map of feature names/values or array of 78 feature values
 * @returns {Promise<Object>} Prediction result JSON
 */
export const predictSample = (inputData) => {
  return new Promise((resolve, reject) => {
    const child = execFile("python", [bridgeScript, "--predict"], { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Failed to execute Python inference: ${error.message}\nStderr: ${stderr}`));
      }

      try {
        const jsonStart = stdout.indexOf("{");
        const jsonText = jsonStart !== -1 ? stdout.slice(jsonStart) : stdout;
        const data = JSON.parse(jsonText);
        if (data.status === "error") {
          return reject(new Error(data.error));
        }
        resolve(data);
      } catch (parseErr) {
        reject(new Error(`Failed to parse prediction response: ${parseErr.message}\nOutput: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(inputData || {}));
    child.stdin.end();
  });
};

/**
 * Sends a batch of feature samples to the Python XGBoost engine for inference.
 * @param {Array<Object>} inputRows - List of feature objects
 * @returns {Promise<Object>} Batch prediction result JSON
 */
export const predictBatch = (inputRows) => {
  return new Promise((resolve, reject) => {
    const child = execFile("python", [bridgeScript, "--predict-batch"], { cwd: projectRoot, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Failed to execute Python batch inference: ${error.message}\nStderr: ${stderr}`));
      }

      try {
        const jsonStart = stdout.indexOf("{");
        const jsonText = jsonStart !== -1 ? stdout.slice(jsonStart) : stdout;
        const data = JSON.parse(jsonText);
        if (data.status === "error") {
          return reject(new Error(data.error));
        }
        resolve(data);
      } catch (parseErr) {
        reject(new Error(`Failed to parse batch prediction response: ${parseErr.message}\nOutput: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(inputRows || []));
    child.stdin.end();
  });
};

/**
 * Enriches a batch of raw CSV packet objects with XGBoost ML predictions.
 * Preserves existing packet data and falls back gracefully if ML bridge fails.
 * @param {Array<Object>} packets - Array of CSV row packet objects
 * @returns {Promise<Array<Object>>} Enriched packet objects
 */
export const enrichPacketsWithML = async (packets) => {
  if (!Array.isArray(packets) || packets.length === 0) return packets;

  try {
    const result = await predictBatch(packets);
    if (result && result.status === "success" && Array.isArray(result.predictions)) {
      result.predictions.forEach((pred, idx) => {
        if (packets[idx]) {
          packets[idx].mlPrediction = pred.prediction_label;
          packets[idx].mlAttackProbability = pred.attack_probability;
          packets[idx].mlModel = pred.model || "Combined XGBoost + Isolation Forest";
          packets[idx].mlPredictedClass = pred.predicted_class;
          packets[idx].mlAnomaly = pred.anomaly;
          packets[idx].mlAnomalyLabel = pred.anomaly_label || (pred.anomaly ? "YES" : "NO");
          packets[idx].mlAnomalyScore = pred.anomaly_score;
          packets[idx].mlRiskLevel = pred.risk_level;
          packets[idx].mlAttackType = pred.attack_type || (pred.prediction_label === "ATTACK" ? "Unknown Attack" : "BENIGN");
        }
      });
    }
  } catch (err) {
    console.warn("⚠️ ML Bridge enrichment fallback to heuristic:", err.message);
  }

  return packets;
};

/**
 * Sends a single sample to Python XGBoost engine to calculate SHAP feature contributions.
 * @param {Object|Array} inputData - Map of feature names/values
 * @returns {Promise<Object>} SHAP explanation result JSON with top 5 features
 */
export const explainSample = (inputData) => {
  return new Promise((resolve, reject) => {
    const child = execFile("python", [bridgeScript, "--explain"], { cwd: projectRoot }, (error, stdout, stderr) => {
      if (error) {
        return reject(new Error(`Failed to execute Python SHAP explanation: ${error.message}\nStderr: ${stderr}`));
      }

      try {
        const jsonStart = stdout.indexOf("{");
        const jsonText = jsonStart !== -1 ? stdout.slice(jsonStart) : stdout;
        const data = JSON.parse(jsonText);
        if (data.status === "error") {
          return reject(new Error(data.error));
        }
        resolve(data);
      } catch (parseErr) {
        reject(new Error(`Failed to parse explanation response: ${parseErr.message}\nOutput: ${stdout}`));
      }
    });

    child.stdin.write(JSON.stringify(inputData || {}));
    child.stdin.end();
  });
};

export default { inspectModels, predictSample, predictBatch, enrichPacketsWithML, explainSample };


