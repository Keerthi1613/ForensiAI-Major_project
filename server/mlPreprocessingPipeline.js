import fs from "fs";
import path from "path";
import { isMissingValue, isInfiniteValue, isTimestampCandidate } from "./datasetProfiler.js";

/**
 * Robust, leakage-proof, and serializable ML Preprocessing Pipeline for ForensiAI.
 */
export class MLPreprocessingPipeline {
  constructor(options = {}) {
    this.options = {
      targetColumn: options.targetColumn || null,
      numericalScaling: options.numericalScaling || "standard", // 'standard' | 'minmax' | 'robust' | 'none'
      imputationStrategy: {
        numerical: options.imputationStrategy?.numerical || "median", // 'median' | 'mean' | 'zero'
        categorical: options.imputationStrategy?.categorical || "missing" // 'missing' | 'mode'
      },
      deriveTimestamps: options.deriveTimestamps !== false, // true by default
      handleIdentifiers: options.handleIdentifiers || "exclude", // 'exclude' | 'retain'
      categoricalEncoding: options.categoricalEncoding || "onehot", // 'onehot' | 'ordinal' | 'frequency'
      oneHotDropFirst: options.oneHotDropFirst === true,
      randomSeed: options.randomSeed || 42,
      ...options
    };

    this.fitted = false;
    this.inputColumns = [];
    this.targetColumn = this.options.targetColumn;
    
    // Feature classification maps (determined during fit)
    this.numericalFeatures = [];
    this.categoricalFeatures = [];
    this.timestampFeatures = [];
    this.identifierFeatures = [];
    this.excludedFeatures = [];

    // Transformation state / learned parameters strictly from training partition
    this.numericalParams = {}; // { col: { median, mean, std, min, max, iqr, finiteMax, finiteMin } }
    this.categoricalParams = {}; // { col: { categories, categoryToIndex, mode, categoryFrequencies } }
    this.targetParams = {}; // { isClassification, classes, classToIndex, indexToClass }

    // Final output feature schema (deterministic ordered feature names)
    this.outputFeatureSchema = [];
    this.featureMetadata = [];
  }

  /**
   * Deterministically splits dataset rows into Train and Test partitions.
   * Prevents data leakage by ensuring no test samples leak into the training split.
   */
  static trainTestSplit(rows, options = {}) {
    const { testSize = 0.2, shuffle = true, randomSeed = 42, targetColumn = null } = options;
    if (!rows || rows.length === 0) return { trainRows: [], testRows: [] };

    const total = rows.length;
    const testCount = Math.max(1, Math.floor(total * testSize));
    const trainCount = total - testCount;

    // Pseudo-random deterministic shuffle with seed
    let indices = rows.map((_, idx) => idx);

    if (shuffle) {
      // Linear congruential generator for reproducible pseudo-randomness
      let seed = randomSeed;
      const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
      };

      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(pseudoRandom() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
    }

    const trainIndices = indices.slice(0, trainCount);
    const testIndices = indices.slice(trainCount);

    const trainRows = trainIndices.map(i => rows[i]);
    const testRows = testIndices.map(i => rows[i]);

    return { trainRows, testRows };
  }

  /**
   * Fits the preprocessing transformations STRICTLY on training data.
   * Learns all medians, scaling parameters, category vocabularies, and schema mappings.
   *
   * @param {Array<object>} trainRows - Training data partition only.
   * @returns {MLPreprocessingPipeline} this instance.
   */
  fit(trainRows) {
    if (!trainRows || trainRows.length === 0) {
      throw new Error("Cannot fit pipeline on empty training data.");
    }

    const sampleRow = trainRows[0];
    this.inputColumns = Object.keys(sampleRow);
    const targetCol = this.targetColumn;

    // Reset feature groups
    this.numericalFeatures = [];
    this.categoricalFeatures = [];
    this.timestampFeatures = [];
    this.identifierFeatures = [];
    this.excludedFeatures = [];
    this.numericalParams = {};
    this.categoricalParams = {};
    this.outputFeatureSchema = [];
    this.featureMetadata = [];

    // 1. Inspect Feature Roles & Types from training data
    const columnValuesMap = new Map();
    this.inputColumns.forEach(col => {
      columnValuesMap.set(col, []);
    });

    trainRows.forEach(row => {
      this.inputColumns.forEach(col => {
        columnValuesMap.get(col).push(row[col]);
      });
    });

    const totalTrainRows = trainRows.length;

    this.inputColumns.forEach(col => {
      // Skip target column from feature transformations
      if (col === targetCol) return;

      const rawValues = columnValuesMap.get(col);
      const nonMissing = rawValues.filter(v => !isMissingValue(v) && !isInfiniteValue(v));
      const numericValues = nonMissing.map(v => Number(v)).filter(v => !isNaN(v));
      const isNumeric = nonMissing.length > 0 && numericValues.length / nonMissing.length >= 0.85;

      const sampleSlice = nonMissing.slice(0, 50);
      const isTimestamp = isTimestampCandidate(sampleSlice);

      // Check if identifier candidate
      const uniqueCount = new Set(nonMissing).size;
      const isIdentifier = (uniqueCount / (totalTrainRows || 1) > 0.9 && totalTrainRows >= 10) ||
        /^(id|uuid|guid|session_?id|row_?id|record_?id|hash|ip_?address|username)$/i.test(col);

      if (isIdentifier && this.options.handleIdentifiers === "exclude" && !isTimestamp) {
        this.identifierFeatures.push(col);
        this.excludedFeatures.push(col);
      } else if (isTimestamp && this.options.deriveTimestamps) {
        this.timestampFeatures.push(col);
      } else if (isNumeric && !isTimestamp) {
        this.numericalFeatures.push(col);
      } else {
        this.categoricalFeatures.push(col);
      }
    });

    // 2. Fit Numerical Features (Learn Imputation & Scaling parameters)
    this.numericalFeatures.forEach(col => {
      const rawValues = columnValuesMap.get(col);
      const finiteNumbers = rawValues
        .map(v => Number(v))
        .filter(n => !isNaN(n) && isFinite(n));

      let median = 0;
      let mean = 0;
      let std = 1;
      let min = 0;
      let max = 1;
      let iqr = 1;
      let finiteMin = 0;
      let finiteMax = 1;

      if (finiteNumbers.length > 0) {
        const sorted = [...finiteNumbers].sort((a, b) => a - b);
        min = sorted[0];
        max = sorted[sorted.length - 1];
        finiteMin = min;
        finiteMax = max;

        const sum = sorted.reduce((acc, v) => acc + v, 0);
        mean = sum / sorted.length;

        const mid = Math.floor(sorted.length / 2);
        median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

        const q25 = sorted[Math.floor(sorted.length * 0.25)];
        const q75 = sorted[Math.floor(sorted.length * 0.75)];
        iqr = q75 - q25 || 1;

        const variance = sorted.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / sorted.length;
        std = Math.sqrt(variance) || 1;
      }

      this.numericalParams[col] = {
        imputeValue: this.options.imputationStrategy.numerical === "mean" ? mean : this.options.imputationStrategy.numerical === "zero" ? 0 : median,
        mean,
        std,
        min,
        max,
        median,
        iqr,
        finiteMin,
        finiteMax
      };

      // Add to output schema
      this.outputFeatureSchema.push(`num_${col}`);
      this.featureMetadata.push({
        name: `num_${col}`,
        originalColumn: col,
        type: "numerical",
        scaling: this.options.numericalScaling,
        imputedWith: this.numericalParams[col].imputeValue
      });
    });

    // 3. Fit Categorical Features (Learn Vocabularies & Encoding Mappings)
    this.categoricalFeatures.forEach(col => {
      const rawValues = columnValuesMap.get(col);
      const counts = new Map();
      let nonMissingTotal = 0;

      rawValues.forEach(v => {
        if (!isMissingValue(v)) {
          const str = String(v).trim();
          counts.set(str, (counts.get(str) || 0) + 1);
          nonMissingTotal++;
        }
      });

      // Find mode for categorical imputation
      let mode = "__missing__";
      let maxCount = -1;
      counts.forEach((cnt, val) => {
        if (cnt > maxCount) {
          maxCount = cnt;
          mode = val;
        }
      });

      // Distinct categories sorted by frequency
      const categories = Array.from(counts.keys()).sort((a, b) => counts.get(b) - counts.get(a));
      const categoryToIndex = {};
      const categoryFrequencies = {};

      categories.forEach((cat, idx) => {
        categoryToIndex[cat] = idx;
        categoryFrequencies[cat] = nonMissingTotal > 0 ? counts.get(cat) / nonMissingTotal : 0;
      });

      this.categoricalParams[col] = {
        categories,
        categoryToIndex,
        categoryFrequencies,
        mode: this.options.imputationStrategy.categorical === "mode" ? mode : "__missing__"
      };

      if (this.options.categoricalEncoding === "onehot") {
        categories.forEach(cat => {
          const sanitizedCat = cat.replace(/[^a-zA-Z0-9_]/g, "_");
          const outName = `cat_${col}_${sanitizedCat}`;
          this.outputFeatureSchema.push(outName);
          this.featureMetadata.push({
            name: outName,
            originalColumn: col,
            type: "categorical_onehot",
            category: cat
          });
        });
      } else if (this.options.categoricalEncoding === "ordinal") {
        const outName = `cat_${col}_ordinal`;
        this.outputFeatureSchema.push(outName);
        this.featureMetadata.push({
          name: outName,
          originalColumn: col,
          type: "categorical_ordinal",
          vocabularySize: categories.length
        });
      } else if (this.options.categoricalEncoding === "frequency") {
        const outName = `cat_${col}_freq`;
        this.outputFeatureSchema.push(outName);
        this.featureMetadata.push({
          name: outName,
          originalColumn: col,
          type: "categorical_frequency"
        });
      }
    });

    // 4. Fit Timestamp Features (Define derived sub-features)
    if (this.options.deriveTimestamps) {
      this.timestampFeatures.forEach(col => {
        const subFeatures = [
          { name: `time_${col}_hour`, metric: "hour" },
          { name: `time_${col}_weekday`, metric: "weekday" },
          { name: `time_${col}_day`, metric: "day" },
          { name: `time_${col}_month`, metric: "month" },
          { name: `time_${col}_is_weekend`, metric: "is_weekend" }
        ];

        subFeatures.forEach(sf => {
          this.outputFeatureSchema.push(sf.name);
          this.featureMetadata.push({
            name: sf.name,
            originalColumn: col,
            type: "derived_timestamp",
            metric: sf.metric
          });
        });
      });
    }

    // 5. Fit Target Variable if Present
    if (targetCol && this.inputColumns.includes(targetCol)) {
      const rawTargetValues = columnValuesMap.get(targetCol);
      const uniqueClasses = Array.from(new Set(rawTargetValues.filter(v => !isMissingValue(v)))).sort();

      const classToIndex = {};
      const indexToClass = {};
      uniqueClasses.forEach((cls, idx) => {
        classToIndex[cls] = idx;
        indexToClass[idx] = cls;
      });

      this.targetParams = {
        targetColumn: targetCol,
        classes: uniqueClasses,
        classToIndex,
        indexToClass,
        isClassification: uniqueClasses.length <= 50
      };
    }

    this.fitted = true;
    return this;
  }

  /**
   * Transforms a set of data rows into a numeric feature matrix X and target array y.
   * Handles missing values, infinite values, unseen categories, and schema mismatch.
   *
   * @param {Array<object>} rows - Input rows (train, test, or inference).
   * @returns {object} { X: number[][], y: (number|string)[], featureNames: string[] }
   */
  transform(rows) {
    if (!this.fitted) {
      throw new Error("Pipeline must be fitted before calling transform.");
    }
    if (!rows || rows.length === 0) {
      return {
        X: [],
        y: [],
        featureNames: this.outputFeatureSchema,
        featureCount: this.outputFeatureSchema.length,
        rowCount: 0
      };
    }

    const X = [];
    const y = [];
    const targetCol = this.targetColumn;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const featureVector = [];

      // A. Transform Numerical Features
      for (const col of this.numericalFeatures) {
        const rawVal = row[col];
        const params = this.numericalParams[col];

        let numVal;
        if (isMissingValue(rawVal)) {
          numVal = params.imputeValue;
        } else if (isInfiniteValue(rawVal)) {
          const str = String(rawVal).toLowerCase();
          numVal = str.startsWith("-") ? params.finiteMin : params.finiteMax;
        } else {
          numVal = Number(rawVal);
          if (isNaN(numVal)) numVal = params.imputeValue;
        }

        // Apply Scaling
        let scaledVal = numVal;
        if (this.options.numericalScaling === "standard") {
          scaledVal = (numVal - params.mean) / params.std;
        } else if (this.options.numericalScaling === "minmax") {
          scaledVal = (params.max - params.min) !== 0 ? (numVal - params.min) / (params.max - params.min) : 0;
        } else if (this.options.numericalScaling === "robust") {
          scaledVal = (numVal - params.median) / params.iqr;
        }

        featureVector.push(Number(scaledVal.toFixed(6)));
      }

      // B. Transform Categorical Features (With Unknown Category Protection)
      for (const col of this.categoricalFeatures) {
        const rawVal = row[col];
        const params = this.categoricalParams[col];

        let catVal = isMissingValue(rawVal) ? params.mode : String(rawVal).trim();

        if (this.options.categoricalEncoding === "onehot") {
          for (const knownCat of params.categories) {
            // 1 if match, 0 if not (unseen categories result safely in 0 vector)
            featureVector.push(catVal === knownCat ? 1.0 : 0.0);
          }
        } else if (this.options.categoricalEncoding === "ordinal") {
          const index = params.categoryToIndex[catVal];
          // Unseen category maps to -1
          featureVector.push(index !== undefined ? index : -1);
        } else if (this.options.categoricalEncoding === "frequency") {
          const freq = params.categoryFrequencies[catVal];
          // Unseen category maps to 0.0 frequency
          featureVector.push(freq !== undefined ? Number(freq.toFixed(6)) : 0.0);
        }
      }

      // C. Transform Timestamp Features (Derive temporal metrics)
      if (this.options.deriveTimestamps) {
        for (const col of this.timestampFeatures) {
          const rawVal = row[col];
          let dateObj = null;

          if (!isMissingValue(rawVal)) {
            const parsedMs = Date.parse(String(rawVal));
            if (!isNaN(parsedMs)) {
              dateObj = new Date(parsedMs);
            }
          }

          if (dateObj) {
            const hour = dateObj.getUTCHours();
            const weekday = dateObj.getUTCDay(); // 0 = Sun, 6 = Sat
            const day = dateObj.getUTCDate();
            const month = dateObj.getUTCMonth() + 1;
            const isWeekend = weekday === 0 || weekday === 6 ? 1.0 : 0.0;

            featureVector.push(hour);
            featureVector.push(weekday);
            featureVector.push(day);
            featureVector.push(month);
            featureVector.push(isWeekend);
          } else {
            // Impute missing timestamp with neutral median defaults
            featureVector.push(12.0); // median hour
            featureVector.push(3.0);  // Wednesday
            featureVector.push(15.0); // mid-month
            featureVector.push(6.0);  // mid-year
            featureVector.push(0.0);  // weekday
          }
        }
      }

      X.push(featureVector);

      // D. Extract Target Value if Present
      if (targetCol && row[targetCol] !== undefined) {
        const rawTarget = row[targetCol];
        if (this.targetParams.isClassification && this.targetParams.classToIndex[rawTarget] !== undefined) {
          y.push(this.targetParams.classToIndex[rawTarget]);
        } else {
          y.push(rawTarget);
        }
      }
    }

    return {
      X,
      y,
      featureNames: this.outputFeatureSchema,
      featureCount: this.outputFeatureSchema.length,
      rowCount: X.length
    };
  }

  /**
   * Fits on training data and transforms in one unified step.
   */
  fitTransform(trainRows) {
    this.fit(trainRows);
    return this.transform(trainRows);
  }

  /**
   * Serializes the pipeline state to a clean JSON object for saving and inference loading.
   */
  toJSON() {
    if (!this.fitted) {
      throw new Error("Cannot serialize an unfitted ML preprocessing pipeline.");
    }

    return {
      version: "1.0.0",
      fittedAt: new Date().toISOString(),
      options: this.options,
      targetColumn: this.targetColumn,
      inputColumns: this.inputColumns,
      numericalFeatures: this.numericalFeatures,
      categoricalFeatures: this.categoricalFeatures,
      timestampFeatures: this.timestampFeatures,
      identifierFeatures: this.identifierFeatures,
      excludedFeatures: this.excludedFeatures,
      numericalParams: this.numericalParams,
      categoricalParams: this.categoricalParams,
      targetParams: this.targetParams,
      outputFeatureSchema: this.outputFeatureSchema,
      featureMetadata: this.featureMetadata
    };
  }

  /**
   * Reconstitutes an MLPreprocessingPipeline instance from a serialized JSON state.
   */
  static fromJSON(jsonState) {
    if (!jsonState || !jsonState.outputFeatureSchema) {
      throw new Error("Invalid pipeline serialized state.");
    }

    const pipeline = new MLPreprocessingPipeline(jsonState.options || {});
    pipeline.fitted = true;
    pipeline.targetColumn = jsonState.targetColumn;
    pipeline.inputColumns = jsonState.inputColumns || [];
    pipeline.numericalFeatures = jsonState.numericalFeatures || [];
    pipeline.categoricalFeatures = jsonState.categoricalFeatures || [];
    pipeline.timestampFeatures = jsonState.timestampFeatures || [];
    pipeline.identifierFeatures = jsonState.identifierFeatures || [];
    pipeline.excludedFeatures = jsonState.excludedFeatures || [];
    pipeline.numericalParams = jsonState.numericalParams || {};
    pipeline.categoricalParams = jsonState.categoricalParams || {};
    pipeline.targetParams = jsonState.targetParams || {};
    pipeline.outputFeatureSchema = jsonState.outputFeatureSchema || [];
    pipeline.featureMetadata = jsonState.featureMetadata || [];

    return pipeline;
  }

  /**
   * Saves pipeline configuration and fitted parameters to disk.
   */
  save(filePath) {
    const json = JSON.stringify(this.toJSON(), null, 2);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, json, "utf8");
  }

  /**
   * Loads a serialized pipeline from disk.
   */
  static load(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Pipeline file not found at: ${filePath}`);
    }
    const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return MLPreprocessingPipeline.fromJSON(json);
  }
}
