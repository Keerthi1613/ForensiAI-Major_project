# ForensiAI ML Model Integration & Architecture

This document describes the multi-model architecture, feature preprocessing pipeline, isolation forest anomaly scoring, rule-based Risk Engine, and fallback mechanisms integrated into ForensiAI.

---

## 1. Multi-Model Architecture & Roles

ForensiAI uses a multi-layered hybrid machine learning architecture for network telemetry analysis:

### A. Combined XGBoost (`ml/models/combined_cic_cse/`)
- **Primary Supervised Classifier**: Classifies network flow telemetry into `BENIGN` (0) or `ATTACK` (1).
- **Training Data**: Compatible combined features from **CIC-IDS2017** + **CSE-CIC-IDS2018**.
- **Held-out Test Performance**:
  - **Accuracy**: 99.19%
  - **Precision**: 99.59%
  - **Recall**: 98.79%
  - **F1 Score**: 99.19%
  - **ROC-AUC**: 99.92%
- *Note: These metrics reflect held-out benchmark evaluation and serve as baseline verification.*

### B. Isolation Forest (`ml/models/isolation_forest/`)
- **Secondary Unsupervised Anomaly Detector**: Evaluates whether network flow behavior deviates from normal benign traffic baselines.
- **Training Data**: Trained on benign network traffic only.
- **Evaluation Characteristics**:
  - High attack precision (95.85%) with low false-positive rate (0.94%).
  - Serves as an independent complementary signal (not a primary attack classifier).

---

## 2. Feature Schema & Preprocessing Pipeline

1. **43-Feature Schema Order**:
   The Combined XGBoost and Isolation Forest models require the saved 43-feature schema order specified in `feature_columns.joblib`:
   - `Dst Port`, `Flow Duration`, `Tot Fwd Pkts`, `Tot Bwd Pkts`, `TotLen Fwd Pkts`, `TotLen Bwd Pkts`, `Fwd Pkt Len Max`, `Fwd Pkt Len Min`, `Fwd Pkt Len Mean`, `Fwd Pkt Len Std`, `Bwd Pkt Len Max`, `Bwd Pkt Len Min`, `Bwd Pkt Len Mean`, `Bwd Pkt Len Std`, `Flow Byts/s`, `Flow Pkts/s`, `Fwd IAT Tot`, `Bwd IAT Tot`, `Fwd Header Len`, `Bwd Header Len`, `Fwd Pkts/s`, `Bwd Pkts/s`, `Pkt Len Mean`, `Pkt Len Std`, `Pkt Len Var`, `FIN Flag Cnt`, `SYN Flag Cnt`, `RST Flag Cnt`, `PSH Flag Cnt`, `ACK Flag Cnt`, `URG Flag Cnt`, `ECE Flag Cnt`, `Pkt Size Avg`, `Fwd Seg Size Avg`, `Bwd Seg Size Avg`, `Subflow Fwd Pkts`, `Subflow Fwd Byts`, `Subflow Bwd Pkts`, `Subflow Bwd Byts`, `Init Fwd Win Byts`, `Init Bwd Win Byts`, `Fwd Act Data Pkts`, `Fwd Seg Size Min`.

2. **Missing & Extreme Value Handling**:
   - `training_medians.joblib` is loaded to impute missing (`null`, `undefined`, `NaN`) or invalid/infinite (`+Inf`, `-Inf`) values.
   - Case-insensitive key matching ensures compatibility across diverse CSV header formats.

---

## 3. Risk Engine Rules

The system maps XGBoost probability predictions and Isolation Forest anomaly signals into operational risk levels using transparent, rule-based scoring:

- **HIGH**:
  - Combined XGBoost attack probability $\ge 0.80$
  - **OR** (Combined XGBoost predicts `ATTACK` **and** Isolation Forest flags anomaly `true`)
- **MEDIUM**:
  - Combined XGBoost attack probability $\ge 0.50$
  - **OR** Isolation Forest flags anomaly `true`
- **LOW**:
  - Otherwise

---

## 4. Operational Fallback & Fail-Safe Mechanisms

- **Legacy 78-Feature Fallback**:
  - If incoming telemetry conforms to the legacy 78-feature schema (`xgboost_forensiai_binary.joblib`), the system seamlessly routes prediction through the legacy preprocessor.
- **Heuristic Threat Engine Fallback**:
  - If Python ML inference fails or model files are unavailable, `enrichPacketsWithML()` logs a server-side warning and gracefully falls back to pattern-based threat signature analysis in `analyzePacket()` (`server/ml.js`).
  - Ingestion processes (`/api/upload`, `/api/ingest`) never crash due to ML failure.

---

## 5. Output Prediction Schema

Every sample enriched by `ml/bridge.py` contains the following metadata:

```json
{
  "predicted_class": 1,
  "prediction_label": "ATTACK",
  "attack_probability": 0.989,
  "benign_probability": 0.011,
  "anomaly": true,
  "anomaly_label": "YES",
  "anomaly_score": -0.1542,
  "model": "Combined XGBoost + Isolation Forest",
  "risk_level": "HIGH"
}
```
