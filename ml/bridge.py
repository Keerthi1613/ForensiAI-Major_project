import sys
import os
import json
import warnings
import numpy as np
import pandas as pd
import joblib

# Suppress non-critical warnings from pickle/xgboost/sklearn serialization
warnings.filterwarnings("ignore")

def get_model_paths():
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    models_dir = os.path.join(project_root, "ml", "models")

    # 1. Combined XGBoost paths (Primary supervised classifier)
    combined_dir = os.path.join(models_dir, "combined_cic_cse")
    combined_binary_path = os.path.join(combined_dir, "combined_xgboost_binary.joblib")
    combined_cols_path = os.path.join(combined_dir, "feature_columns.joblib")
    combined_medians_path = os.path.join(combined_dir, "training_medians.joblib")

    # 2. Isolation Forest paths (Secondary anomaly detector)
    iso_dir = os.path.join(models_dir, "isolation_forest")
    iso_model_path = os.path.join(iso_dir, "isolation_forest_combined.joblib")
    iso_cols_path = os.path.join(iso_dir, "feature_columns.joblib")
    iso_medians_path = os.path.join(iso_dir, "training_medians.joblib")

    # 3. Legacy XGBoost paths (78-feature fallback classifier)
    legacy_binary_path = os.path.join(models_dir, "xgboost_forensiai_binary.joblib")
    # 3. Legacy XGBoost paths (78-feature fallback classifier)
    legacy_binary_path = os.path.join(models_dir, "xgboost_forensiai_binary.joblib")
    legacy_prep_path = os.path.join(models_dir, "xgboost_forensiai_multiday_preprocessing.joblib")

    # 4. Multiclass CSE-CIC-IDS2018 Attack Classifier paths
    cse_mc_dir = os.path.join(models_dir, "cse_ids2018_multiclass")
    cse_model_path = os.path.join(cse_mc_dir, "xgboost_attack_classifier.joblib")
    if not os.path.exists(cse_model_path):
        cse_model_path = os.path.join(models_dir, "xgboost_attack_classifier.joblib")

    cse_encoder_path = os.path.join(cse_mc_dir, "attack_label_encoder.joblib")
    if not os.path.exists(cse_encoder_path):
        cse_encoder_path = os.path.join(models_dir, "attack_label_encoder.joblib")

    cse_cols_path = os.path.join(cse_mc_dir, "multiclass_feature_columns.joblib")
    if not os.path.exists(cse_cols_path):
        cse_cols_path = os.path.join(models_dir, "multiclass_feature_columns.joblib")

    cse_imputer_path = os.path.join(cse_mc_dir, "multiclass_imputer.joblib")
    if not os.path.exists(cse_imputer_path):
        cse_imputer_path = os.path.join(models_dir, "multiclass_imputer.joblib")

    # 5. Multiclass CIC-IDS2017 Attack Classifier paths
    cic_mc_dir = os.path.join(models_dir, "cic_ids2017_multiclass")
    cic_model_path = os.path.join(cic_mc_dir, "xgboost_attack_classifier.joblib")
    cic_encoder_path = os.path.join(cic_mc_dir, "attack_label_encoder.joblib")
    cic_cols_path = os.path.join(cic_mc_dir, "multiclass_feature_columns.joblib")
    cic_imputer_path = os.path.join(cic_mc_dir, "multiclass_imputer.joblib")

    return {
        "combined_binary": combined_binary_path,
        "combined_cols": combined_cols_path,
        "combined_medians": combined_medians_path,
        "iso_model": iso_model_path,
        "iso_cols": iso_cols_path,
        "iso_medians": iso_medians_path,
        "legacy_binary": legacy_binary_path,
        "legacy_prep": legacy_prep_path,
        "cse_multiclass_model": cse_model_path,
        "cse_multiclass_encoder": cse_encoder_path,
        "cse_multiclass_cols": cse_cols_path,
        "cse_multiclass_imputer": cse_imputer_path,
        "cic_multiclass_model": cic_model_path,
        "cic_multiclass_encoder": cic_encoder_path,
        "cic_multiclass_cols": cic_cols_path,
        "cic_multiclass_imputer": cic_imputer_path,
        "multiclass_model": cse_model_path,
        "multiclass_encoder": cse_encoder_path,
        "multiclass_cols": cse_cols_path,
        "multiclass_imputer": cse_imputer_path
    }

def inspect_models():
    paths = get_model_paths()

    res = {
        "status": "success",
        "paths": paths,
        "models_available": {}
    }

    # Inspect Combined XGBoost
    if os.path.exists(paths["combined_binary"]) and os.path.exists(paths["combined_cols"]):
        try:
            c_cols = joblib.load(paths["combined_cols"])
            res["models_available"]["combined_xgboost"] = {
                "loaded": True,
                "n_features": len(c_cols),
                "feature_names": list(c_cols)
            }
        except Exception as e:
            res["models_available"]["combined_xgboost"] = {"loaded": False, "error": str(e)}

    # Inspect Isolation Forest
    if os.path.exists(paths["iso_model"]) and os.path.exists(paths["iso_cols"]):
        try:
            i_cols = joblib.load(paths["iso_cols"])
            res["models_available"]["isolation_forest"] = {
                "loaded": True,
                "n_features": len(i_cols),
                "feature_names": list(i_cols)
            }
        except Exception as e:
            res["models_available"]["isolation_forest"] = {"loaded": False, "error": str(e)}

    # Inspect Multiclass Attack Classifier
    if (paths.get("multiclass_model") and os.path.exists(paths["multiclass_model"]) and
        paths.get("multiclass_encoder") and os.path.exists(paths["multiclass_encoder"]) and
        paths.get("multiclass_cols") and os.path.exists(paths["multiclass_cols"])):
        try:
            m_cols = joblib.load(paths["multiclass_cols"])
            m_encoder = joblib.load(paths["multiclass_encoder"])
            res["models_available"]["multiclass_attack_classifier"] = {
                "loaded": True,
                "n_features": len(m_cols),
                "classes": [str(c) for c in getattr(m_encoder, "classes_", [])]
            }
        except Exception as e:
            res["models_available"]["multiclass_attack_classifier"] = {"loaded": False, "error": str(e)}

    # Legacy model inspection for backward compatibility with existing tests
    binary_path = paths["legacy_binary"]
    preprocessing_path = paths["legacy_prep"]

    if os.path.exists(binary_path) and os.path.exists(preprocessing_path):
        try:
            binary_obj = joblib.load(binary_path)
            model_type = type(binary_obj).__name__
            feature_names = []
            if hasattr(binary_obj, "feature_names_in_"):
                feature_names = [str(f) for f in binary_obj.feature_names_in_]
            elif hasattr(binary_obj, "get_booster"):
                booster = binary_obj.get_booster()
                if booster.feature_names:
                    feature_names = [str(f) for f in booster.feature_names]
            n_features = getattr(binary_obj, "n_features_in_", len(feature_names))
            classes = [int(c) if isinstance(c, (int, float)) else str(c) for c in getattr(binary_obj, "classes_", [0, 1])]

            res["binary_model"] = {
                "model_type": model_type,
                "n_features": n_features,
                "feature_names": feature_names,
                "classes": classes,
                "n_classes": len(classes)
            }

            prep_obj = joblib.load(preprocessing_path)
            features = prep_obj.get("features", []) if isinstance(prep_obj, dict) else []
            medians = prep_obj.get("medians", {}) if isinstance(prep_obj, dict) else {}

            res["preprocessing"] = {
                "object_type": type(prep_obj).__name__,
                "n_features": len(features),
                "feature_names": features,
                "medians_count": len(medians)
            }
        except Exception as e:
            res["legacy_error"] = str(e)

    return res

def compute_risk_level(attack_prob, xgb_pred_label, iso_anomaly):
    """
    Transparent rule-based Risk Engine:
    HIGH:
      - XGBoost attack probability >= 0.80
      - OR (XGBoost predicts ATTACK and Isolation Forest flags anomaly)
    MEDIUM:
      - XGBoost attack probability >= 0.50
      - OR Isolation Forest flags anomaly
    LOW:
      - otherwise
    """
    prob = float(attack_prob)
    is_attack_pred = (xgb_pred_label == "ATTACK")
    is_anomalous = bool(iso_anomaly)

    if prob >= 0.80 or (is_attack_pred and is_anomalous):
        return "HIGH"
    elif prob >= 0.50 or is_anomalous:
        return "MEDIUM"
    else:
        return "LOW"

FEATURE_ALIASES = {
    'destination port': ['dst port', 'destination port', 'dst_port', 'destinationport', 'port'],
    'total fwd packets': ['tot fwd pkts', 'total fwd packets'],
    'total backward packets': ['tot bwd pkts', 'total backward packets'],
    'total length of fwd packets': ['totlen fwd pkts', 'total length of fwd packets'],
    'total length of bwd packets': ['totlen bwd pkts', 'total length of bwd packets'],
    'fwd packet length max': ['fwd pkt len max', 'fwd packet length max'],
    'fwd packet length min': ['fwd pkt len min', 'fwd packet length min'],
    'fwd packet length mean': ['fwd pkt len mean', 'fwd packet length mean'],
    'fwd packet length std': ['fwd pkt len std', 'fwd packet length std'],
    'bwd packet length max': ['bwd pkt len max', 'bwd packet length max'],
    'bwd packet length min': ['bwd pkt len min', 'bwd packet length min'],
    'bwd packet length mean': ['bwd pkt len mean', 'bwd packet length mean'],
    'bwd packet length std': ['bwd pkt len std', 'bwd packet length std'],
    'flow bytes/s': ['flow byts/s', 'flow bytes/s'],
    'flow packets/s': ['flow pkts/s', 'flow packets/s'],
    'fwd iat total': ['fwd iat tot', 'fwd iat total'],
    'bwd iat total': ['bwd iat tot', 'bwd iat total'],
    'fwd header length': ['fwd header len', 'fwd header length', 'fwd header length.1'],
    'bwd header length': ['bwd header len', 'bwd header length'],
    'fwd packets/s': ['fwd pkts/s', 'fwd packets/s'],
    'bwd packets/s': ['bwd pkts/s', 'bwd packets/s'],
    'min packet length': ['pkt len min', 'min packet length'],
    'max packet length': ['pkt len max', 'max packet length'],
    'packet length mean': ['pkt len mean', 'packet length mean'],
    'packet length std': ['pkt len std', 'packet length std'],
    'packet length variance': ['pkt len var', 'packet length variance'],
    'fin flag count': ['fin flag cnt', 'fin flag count'],
    'syn flag count': ['syn flag cnt', 'syn flag count'],
    'rst flag count': ['rst flag cnt', 'rst flag count'],
    'psh flag count': ['psh flag cnt', 'psh flag count'],
    'ack flag count': ['ack flag cnt', 'ack flag count'],
    'urg flag count': ['urg flag cnt', 'urg flag count'],
    'ece flag count': ['ece flag cnt', 'ece flag count'],
    'average packet size': ['pkt size avg', 'average packet size'],
    'avg fwd segment size': ['fwd seg size avg', 'avg fwd segment size'],
    'avg bwd segment size': ['bwd seg size avg', 'avg bwd segment size'],
    'fwd header length.1': ['fwd header len', 'fwd header length'],
    'fwd avg bytes/bulk': ['fwd byts/b avg', 'fwd avg bytes/bulk'],
    'fwd avg packets/bulk': ['fwd pkts/b avg', 'fwd avg packets/bulk'],
    'fwd avg bulk rate': ['fwd blk rate avg', 'fwd avg bulk rate'],
    'bwd avg bytes/bulk': ['bwd byts/b avg', 'bwd avg bytes/bulk'],
    'bwd avg packets/bulk': ['bwd pkts/b avg', 'bwd avg packets/bulk'],
    'bwd avg bulk rate': ['bwd blk rate avg', 'bwd avg bulk rate'],
    'subflow fwd packets': ['subflow fwd pkts', 'subflow fwd packets'],
    'subflow fwd bytes': ['subflow fwd byts', 'subflow fwd bytes'],
    'subflow bwd packets': ['subflow bwd pkts', 'subflow bwd packets'],
    'subflow bwd bytes': ['subflow bwd byts', 'subflow bwd bytes'],
    'init_win_bytes_forward': ['init fwd win byts', 'init_win_bytes_forward'],
    'init_win_bytes_backward': ['init bwd win byts', 'init_win_bytes_backward'],
    'act_data_pkt_fwd': ['fwd act data pkts', 'act_data_pkt_fwd'],
    'min_seg_size_forward': ['fwd seg size min', 'min_seg_size_forward'],
}

def preprocess_and_format_batch(raw_rows, feature_names, medians):
    """
    Applies numerical conversion, inf/-inf handling, median imputation, feature alias resolution,
    and feature ordering for a list of raw sample dictionaries/lists according to target feature schema.
    """
    processed_rows = []

    medians_dict = {}
    if hasattr(medians, "to_dict"):
        medians_dict = medians.to_dict()
    elif isinstance(medians, dict):
        medians_dict = medians

    for raw_input in raw_rows:
        processed_row = {}
        if isinstance(raw_input, dict):
            lower_map = {str(k).strip().lower(): v for k, v in raw_input.items()}
            for feat in feature_names:
                feat_str = str(feat)
                feat_lower = feat_str.strip().lower()
                val = raw_input.get(feat, lower_map.get(feat_lower, None))

                if val is None and feat_lower in FEATURE_ALIASES:
                    for alias in FEATURE_ALIASES[feat_lower]:
                        val = raw_input.get(alias, lower_map.get(alias, None))
                        if val is not None:
                            break

                try:
                    median_val = float(medians_dict.get(feat, 0.0))
                    if np.isnan(median_val) or np.isinf(median_val):
                        median_val = 0.0
                except Exception:
                    median_val = 0.0

                try:
                    if val is None or val == "" or pd.isna(val):
                        num_val = median_val
                    else:
                        num_val = float(val)
                        if np.isinf(num_val) or np.isnan(num_val):
                            num_val = median_val
                except (ValueError, TypeError):
                    num_val = median_val

                processed_row[feat_str] = num_val

        elif isinstance(raw_input, (list, tuple)):
            for i, feat in enumerate(feature_names):
                feat_str = str(feat)
                val = raw_input[i] if i < len(raw_input) else None
                try:
                    median_val = float(medians_dict.get(feat, 0.0))
                    if np.isnan(median_val) or np.isinf(median_val):
                        median_val = 0.0
                except Exception:
                    median_val = 0.0

                try:
                    if val is None or val == "" or pd.isna(val):
                        num_val = median_val
                    else:
                        num_val = float(val)
                        if np.isinf(num_val) or np.isnan(num_val):
                            num_val = median_val
                except (ValueError, TypeError):
                    num_val = median_val

                processed_row[feat_str] = num_val
        else:
            for feat in feature_names:
                feat_str = str(feat)
                processed_row[feat_str] = float(medians_dict.get(feat, 0.0))

        processed_rows.append(processed_row)

    return pd.DataFrame(processed_rows, columns=[str(f) for f in feature_names])

def detect_dataset_type(row):
    """
    Determines whether a sample row originates from CSE-CIC-IDS2018 or CIC-IDS2017 dataset.
    Returns 'cse_2018' or 'cic_2017'.
    """
    if not isinstance(row, dict):
        return 'cse_2018'
    
    ds_marker = str(row.get('dataset') or row.get('source') or row.get('dataset_type') or '').lower()
    if '2017' in ds_marker:
        return 'cic_2017'
    if '2018' in ds_marker or 'cse' in ds_marker:
        return 'cse_2018'
        
    row_keys = set(row.keys())
    cic_2017_keys = {'Destination Port', 'Total Fwd Packets', 'Total Length of Fwd Packets', 'Init_Win_bytes_forward'}
    cse_2018_keys = {'Dst Port', 'Tot Fwd Pkts', 'TotLen Fwd Pkts', 'Init Fwd Win Byts'}
    
    cic_matches = len(row_keys.intersection(cic_2017_keys))
    cse_matches = len(row_keys.intersection(cse_2018_keys))
    
    if cic_matches > cse_matches:
        return 'cic_2017'
    
    return 'cse_2018'

def predict_multiclass_attack(raw_rows):
    """
    Runs dataset-specific multiclass XGBoost classifier (CSE-CIC-IDS2018 or CIC-IDS2017)
    to predict specific attack type for samples already flagged as ATTACK by the primary binary classifier.
    """
    if not raw_rows:
        return []

    paths = get_model_paths()

    cse_paths = {
        "model": paths.get("cse_multiclass_model") or paths.get("multiclass_model"),
        "encoder": paths.get("cse_multiclass_encoder") or paths.get("multiclass_encoder"),
        "cols": paths.get("cse_multiclass_cols") or paths.get("multiclass_cols"),
        "imputer": paths.get("cse_multiclass_imputer") or paths.get("multiclass_imputer")
    }

    cic_paths = {
        "model": paths.get("cic_multiclass_model"),
        "encoder": paths.get("cic_multiclass_encoder"),
        "cols": paths.get("cic_multiclass_cols"),
        "imputer": paths.get("cic_multiclass_imputer")
    }

    results = ["Unknown Attack"] * len(raw_rows)

    cse_indices = []
    cic_indices = []

    for idx, row in enumerate(raw_rows):
        ds_type = detect_dataset_type(row)
        if ds_type == 'cic_2017' and all(v and os.path.exists(v) for v in cic_paths.values()):
            cic_indices.append(idx)
        else:
            cse_indices.append(idx)

    def run_inference_for_group(indices, p_dict):
        if not indices:
            return
        if not all(v and os.path.exists(v) for v in p_dict.values()):
            return

        try:
            model = joblib.load(p_dict["model"])
            encoder = joblib.load(p_dict["encoder"])
            cols = joblib.load(p_dict["cols"])
            imputer = joblib.load(p_dict["imputer"])

            feature_names = [str(f) for f in cols]
            sub_rows = [raw_rows[i] for i in indices]

            df_input = preprocess_and_format_batch(sub_rows, feature_names, {})

            if hasattr(imputer, "transform"):
                arr_imputed = imputer.transform(df_input)
            else:
                arr_imputed = df_input.values

            preds = model.predict(arr_imputed)

            if hasattr(encoder, "inverse_transform"):
                decoded = encoder.inverse_transform(preds)
                for k, d in enumerate(decoded):
                    orig_idx = indices[k]
                    raw_str = str(d).strip()
                    clean_str = "".join([c if ord(c) < 128 else "-" for c in raw_str]).strip()
                    clean_str = clean_str.replace("--", "-").strip("-").strip()
                    if clean_str.upper() == "BENIGN":
                        clean_str = "Unknown Attack"
                    results[orig_idx] = clean_str
            else:
                for k, p in enumerate(preds):
                    orig_idx = indices[k]
                    results[orig_idx] = f"Attack-Type-{p}"
        except Exception as e:
            sys.stderr.write(f"Warning: Multiclass inference failed for group: {str(e)}\n")

    run_inference_for_group(cse_indices, cse_paths)
    run_inference_for_group(cic_indices, cic_paths)

    return results

def predict_batch(raw_rows):
    if not isinstance(raw_rows, list):
        raw_rows = [raw_rows] if raw_rows else []

    if len(raw_rows) == 0:
        return {"status": "success", "count": 0, "predictions": []}

    paths = get_model_paths()

    # Try Primary Pipeline: Combined XGBoost (43 features) + Isolation Forest (43 features)
    has_combined = (os.path.exists(paths["combined_binary"]) and 
                    os.path.exists(paths["combined_cols"]) and 
                    os.path.exists(paths["combined_medians"]) and
                    os.path.exists(paths["iso_model"]))

    if has_combined:
        try:
            combined_xgb = joblib.load(paths["combined_binary"])
            combined_cols = joblib.load(paths["combined_cols"])
            combined_medians = joblib.load(paths["combined_medians"])
            iso_model = joblib.load(paths["iso_model"])

            feature_names_43 = list(combined_cols)

            df_input = preprocess_and_format_batch(raw_rows, feature_names_43, combined_medians)

            # Predict via Combined XGBoost
            xgb_classes = combined_xgb.predict(df_input)
            xgb_probas = combined_xgb.predict_proba(df_input)

            # Predict via Isolation Forest (-1 = anomaly, 1 = normal)
            iso_preds = iso_model.predict(df_input)
            iso_scores = iso_model.decision_function(df_input)

            # Run Multiclass Classifier CASCADE for ATTACK samples ONLY
            attack_indices = [i for i in range(len(raw_rows)) if int(xgb_classes[i]) == 1]
            attack_raw_rows = [raw_rows[i] for i in attack_indices]

            multiclass_predictions = predict_multiclass_attack(attack_raw_rows) if attack_raw_rows else []
            mc_map = {attack_indices[k]: multiclass_predictions[k] for k in range(len(attack_indices))}

            results = []
            for i in range(len(raw_rows)):
                cls = int(xgb_classes[i])
                pred_label = "ATTACK" if cls == 1 else "BENIGN"
                probas = xgb_probas[i].tolist()
                prob_0 = float(probas[0])
                prob_1 = float(probas[1]) if len(probas) > 1 else float(1.0 - prob_0)

                iso_pred_val = int(iso_preds[i])
                is_anomaly = bool(iso_pred_val == -1)
                anomaly_score_val = float(iso_scores[i])

                risk = compute_risk_level(prob_1, pred_label, is_anomaly)

                if pred_label == "BENIGN":
                    attack_type = "BENIGN"
                else:
                    attack_type = mc_map.get(i, "Unknown Attack")

                results.append({
                    "predicted_class": cls,
                    "prediction_label": pred_label,
                    "attack_probability": prob_1,
                    "benign_probability": prob_0,
                    "anomaly": is_anomaly,
                    "anomaly_label": "YES" if is_anomaly else "NO",
                    "anomaly_score": anomaly_score_val,
                    "model": "Combined XGBoost + Isolation Forest",
                    "risk_level": risk,
                    "attack_type": attack_type
                })

            return {
                "status": "success",
                "count": len(results),
                "predictions": results
            }
        except Exception as e:
            sys.stderr.write(f"Warning: Combined XGBoost + Isolation Forest pipeline failed: {str(e)}\n")
            # Fall through to legacy XGBoost pipeline

    # Fallback Pipeline: Legacy 78-feature XGBoost
    has_legacy = os.path.exists(paths["legacy_binary"]) and os.path.exists(paths["legacy_prep"])
    if has_legacy:
        try:
            legacy_model = joblib.load(paths["legacy_binary"])
            legacy_prep = joblib.load(paths["legacy_prep"])

            feature_names_78 = legacy_prep.get("features", [])
            medians_78 = legacy_prep.get("medians", {})

            df_input = preprocess_and_format_batch(raw_rows, feature_names_78, medians_78)

            pred_classes = legacy_model.predict(df_input)
            pred_probas = legacy_model.predict_proba(df_input)

            attack_indices = [i for i in range(len(raw_rows)) if int(pred_classes[i]) == 1]
            attack_raw_rows = [raw_rows[i] for i in attack_indices]

            multiclass_predictions = predict_multiclass_attack(attack_raw_rows) if attack_raw_rows else []
            mc_map = {attack_indices[k]: multiclass_predictions[k] for k in range(len(attack_indices))}

            results = []
            for i in range(len(raw_rows)):
                cls = int(pred_classes[i])
                pred_label = "ATTACK" if cls == 1 else "BENIGN"
                probas = pred_probas[i].tolist()
                prob_0 = float(probas[0])
                prob_1 = float(probas[1]) if len(probas) > 1 else float(1.0 - prob_0)

                risk = compute_risk_level(prob_1, pred_label, False)

                if pred_label == "BENIGN":
                    attack_type = "BENIGN"
                else:
                    attack_type = mc_map.get(i, "Unknown Attack")

                results.append({
                    "predicted_class": cls,
                    "prediction_label": pred_label,
                    "attack_probability": prob_1,
                    "benign_probability": prob_0,
                    "anomaly": False,
                    "anomaly_label": "NO",
                    "anomaly_score": 0.0,
                    "model": "XGBoost Legacy",
                    "risk_level": risk,
                    "attack_type": attack_type
                })

            return {
                "status": "success",
                "count": len(results),
                "predictions": results
            }
        except Exception as e:
            return {"status": "error", "error": f"Legacy XGBoost inference failure: {str(e)}"}

    return {"status": "error", "error": "No loadable ML model artifacts found"}

def predict_sample(raw_input):
    res = predict_batch([raw_input])
    if res.get("status") == "success" and res.get("predictions"):
        p = res["predictions"][0]
        return {
            "status": "success",
            "predicted_class": p["predicted_class"],
            "prediction_label": p["prediction_label"],
            "attack_probability": p["attack_probability"],
            "benign_probability": p["benign_probability"],
            "anomaly": p["anomaly"],
            "anomaly_label": p["anomaly_label"],
            "anomaly_score": p["anomaly_score"],
            "risk_level": p["risk_level"],
            "attack_type": p.get("attack_type", "BENIGN" if p["prediction_label"] == "BENIGN" else "Unknown Attack"),
            "model": p["model"],
            "probabilities": {
                "class_0": p["benign_probability"],
                "class_1": p["attack_probability"]
            },
            "model_info": {
                "model_type": p["model"],
                "n_features": 43 if "Combined" in p["model"] else 78,
                "feature_count": 43 if "Combined" in p["model"] else 78
            }
        }
    return res

def explain_sample(raw_input):
    """
    Computes SHAP feature contribution explanation for a single network flow sample
    using the primary Combined XGBoost model (43 features).
    Safe runtime patch applied for base_score bracket formatting issue.
    """
    paths = get_model_paths()

    if not (os.path.exists(paths["combined_binary"]) and 
            os.path.exists(paths["combined_cols"]) and 
            os.path.exists(paths["combined_medians"])):
        return {"status": "error", "error": "Combined XGBoost model artifacts not found", "top_features": []}

    try:
        combined_xgb = joblib.load(paths["combined_binary"])
        combined_cols = joblib.load(paths["combined_cols"])
        combined_medians = joblib.load(paths["combined_medians"])

        feature_names_43 = list(combined_cols)
        raw_rows = [raw_input] if isinstance(raw_input, dict) else (raw_input if isinstance(raw_input, list) else [])
        df_input = preprocess_and_format_batch(raw_rows, feature_names_43, combined_medians)

        # Predict via Combined XGBoost & Isolation Forest for full metadata
        pred_res = predict_batch(raw_rows)
        pred_meta = {}
        if pred_res.get("status") == "success" and pred_res.get("predictions"):
            pred_meta = pred_res["predictions"][0]

        # Apply verified runtime monkey patch for SHAP TreeExplainer on XGBoost base_score string issue
        import builtins
        import shap
        import shap.explainers._tree as shap_tree

        orig_float = builtins.float
        def safe_float(v):
            if isinstance(v, str):
                v = v.strip('[]')
            return orig_float(v)

        orig_loader_init = shap_tree.XGBTreeModelLoader.__init__
        def patched_loader_init(self, xgb_model):
            builtins.float = safe_float
            try:
                orig_loader_init(self, xgb_model)
            finally:
                builtins.float = orig_float

        shap_tree.XGBTreeModelLoader.__init__ = patched_loader_init

        explainer = shap.TreeExplainer(combined_xgb)
        shap_values = explainer(df_input)

        raw_vals = shap_values.values[0]
        if len(raw_vals.shape) > 1:
            raw_vals = raw_vals[:, 1]

        top_indices = np.argsort(np.abs(raw_vals))[::-1][:5]
        top_features = []
        for idx in top_indices:
            feat_name = str(feature_names_43[idx])
            val_num = float(df_input.iloc[0][feat_name])
            shap_num = float(raw_vals[idx])
            abs_shap = float(abs(shap_num))
            direction = "toward ATTACK" if shap_num > 0 else "away from ATTACK"
            top_features.append({
                "feature": feat_name,
                "value": val_num,
                "shap_value": shap_num,
                "abs_shap_value": abs_shap,
                "direction": direction
            })

        return {
            "status": "success",
            "model": pred_meta.get("model", "Combined XGBoost + Isolation Forest"),
            "predicted_class": pred_meta.get("predicted_class", 1 if top_features and top_features[0]["shap_value"] > 0 else 0),
            "prediction_label": pred_meta.get("prediction_label", "ATTACK" if top_features and top_features[0]["shap_value"] > 0 else "BENIGN"),
            "attack_probability": pred_meta.get("attack_probability", 0.0),
            "benign_probability": pred_meta.get("benign_probability", 1.0),
            "anomaly": pred_meta.get("anomaly", False),
            "anomaly_label": pred_meta.get("anomaly_label", "NO"),
            "anomaly_score": pred_meta.get("anomaly_score", 0.0),
            "risk_level": pred_meta.get("risk_level", "LOW"),
            "top_features": top_features
        }
    except Exception as e:
        return {
            "status": "error",
            "error": f"SHAP explanation failure: {str(e)}",
            "top_features": []
        }

if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "--inspect"

    if mode == "--inspect":
        info = inspect_models()
        print(json.dumps(info, indent=2))
    elif mode in ("--predict", "--predict-batch", "--explain"):
        try:
            raw_data_str = ""
            if not sys.stdin.isatty():
                raw_data_str = sys.stdin.read().strip()
            if not raw_data_str and len(sys.argv) > 2:
                raw_data_str = sys.argv[2]

            raw_input = json.loads(raw_data_str) if raw_data_str else []

            if mode == "--predict":
                res = predict_sample(raw_input)
            elif mode == "--explain":
                res = explain_sample(raw_input)
            else:
                if isinstance(raw_input, dict):
                    raw_input = [raw_input]
                res = predict_batch(raw_input)

            print(json.dumps(res, indent=2))
        except Exception as e:
            print(json.dumps({"status": "error", "error": f"Invalid input payload: {str(e)}"}))
    else:
        print(json.dumps({"status": "error", "error": f"Unknown mode: {mode}"}))


