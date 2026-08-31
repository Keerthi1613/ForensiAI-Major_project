import fs from "fs";
import path from "path";
import readline from "readline";
import crypto from "crypto";
import { parseCSVLine, sanitizeFilename } from "./datasetValidator.js";

/**
 * Checks if a string value is considered missing / null.
 */
export function isMissingValue(val) {
  if (val === null || val === undefined) return true;
  const str = String(val).trim().toLowerCase();
  return str === "" || str === "null" || str === "nan" || str === "none" || str === "n/a" || str === "na" || str === "undefined" || str === "?";
}

/**
 * Checks if a string represents an infinite value.
 */
export function isInfiniteValue(val) {
  if (val === null || val === undefined) return false;
  const str = String(val).trim().toLowerCase();
  return str === "infinity" || str === "+infinity" || str === "-infinity" || str === "inf" || str === "+inf" || str === "-inf";
}

/**
 * Tests if a string value is a valid timestamp/date.
 */
export function isTimestampCandidate(sampleValues) {
  if (!sampleValues || sampleValues.length === 0) return false;
  const dateRegex = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const timeRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;

  let validDateCount = 0;
  for (const v of sampleValues) {
    if (isMissingValue(v)) continue;
    const str = String(v).trim();
    if (dateRegex.test(str) || isoRegex.test(str) || timeRegex.test(str)) {
      validDateCount++;
    } else {
      const parsed = Date.parse(str);
      if (!isNaN(parsed) && str.length > 5 && isNaN(Number(str))) {
        validDateCount++;
      }
    }
  }

  return validDateCount >= Math.max(1, sampleValues.length * 0.7);
}

/**
 * Computes statistical percentiles on a sorted numerical array.
 */
export function calculatePercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) return 0;
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sortedArray[lower];
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Calculates numerical summary statistics: min, max, mean, median, stdDev, q25, q75.
 */
export function calculateNumericalStats(numbers) {
  if (!numbers || numbers.length === 0) {
    return {
      min: null,
      max: null,
      mean: null,
      median: null,
      stdDev: null,
      q25: null,
      q75: null,
      zerosCount: 0,
      infiniteCount: 0
    };
  }

  // Sort for percentiles and median
  const sorted = [...numbers].sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0];
  const max = sorted[count - 1];

  let sum = 0;
  let zerosCount = 0;
  for (let i = 0; i < count; i++) {
    const val = sorted[i];
    sum += val;
    if (val === 0) zerosCount++;
  }

  const mean = sum / count;

  let varianceSum = 0;
  for (let i = 0; i < count; i++) {
    varianceSum += Math.pow(sorted[i] - mean, 2);
  }
  const stdDev = Math.sqrt(varianceSum / count);

  const median = calculatePercentile(sorted, 50);
  const q25 = calculatePercentile(sorted, 25);
  const q75 = calculatePercentile(sorted, 75);

  return {
    min: Number(min.toFixed(4)),
    max: Number(max.toFixed(4)),
    mean: Number(mean.toFixed(4)),
    median: Number(median.toFixed(4)),
    stdDev: Number(stdDev.toFixed(4)),
    q25: Number(q25.toFixed(4)),
    q75: Number(q75.toFixed(4)),
    zerosCount,
    zerosPercentage: Number(((zerosCount / count) * 100).toFixed(2))
  };
}

/**
 * Profiles a CSV dataset file with complete statistical analysis.
 *
 * @param {string} filePath - Absolute path to dataset CSV.
 * @param {object} options - Profiling options.
 * @param {string} [options.targetColumn] - Explicit target column name (optional).
 * @returns {Promise<object>} Profiling report.
 */
export async function profileDataset(filePath, options = {}) {
  const { targetColumn: userTargetColumn } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error("Dataset file does not exist.");
  }

  let headers = [];
  let isFirstLine = true;
  let lineIndex = 0;
  let totalRows = 0;

  // Track raw values and frequencies per column
  const columnData = new Map();
  // Hash set for exact duplicate row detection
  const rowHashes = new Set();
  let duplicateRowCount = 0;
  let totalMissingValuesAcrossDataset = 0;

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (let rawLine of rl) {
    lineIndex++;

    // Strip BOM on first line
    if (lineIndex === 1 && rawLine.charCodeAt(0) === 0xfeff) {
      rawLine = rawLine.slice(1);
    }

    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    const parsed = parseCSVLine(rawLine);
    if (parsed.unclosedQuote) continue;

    if (isFirstLine) {
      isFirstLine = false;
      headers = parsed.fields.map(h => h.trim());
      headers.forEach(h => {
        columnData.set(h, {
          values: [],
          numbers: [],
          missingCount: 0,
          infiniteCount: 0,
          valueFrequency: new Map()
        });
      });
      continue;
    }

    totalRows++;

    // Hash row for duplicate detection
    const rowHash = crypto.createHash("md5").update(trimmed).digest("hex");
    if (rowHashes.has(rowHash)) {
      duplicateRowCount++;
    } else {
      rowHashes.add(rowHash);
    }

    // Process fields
    const fields = parsed.fields;
    headers.forEach((colName, colIdx) => {
      const cell = fields[colIdx] ?? "";
      const colTracker = columnData.get(colName);
      if (!colTracker) return;

      if (isMissingValue(cell)) {
        colTracker.missingCount++;
        totalMissingValuesAcrossDataset++;
      } else if (isInfiniteValue(cell)) {
        colTracker.infiniteCount++;
        colTracker.values.push(cell);
      } else {
        const strVal = String(cell).trim();
        colTracker.values.push(strVal);

        // Track frequency
        colTracker.valueFrequency.set(
          strVal,
          (colTracker.valueFrequency.get(strVal) || 0) + 1
        );

        // Check if numerical
        const num = Number(strVal);
        if (!isNaN(num) && strVal !== "") {
          colTracker.numbers.push(num);
        }
      }
    });
  }

  const totalColumns = headers.length;
  const totalCells = totalRows * totalColumns;
  const overallMissingPercentage = totalCells > 0 ? Number(((totalMissingValuesAcrossDataset / totalCells) * 100).toFixed(2)) : 0;
  const duplicateRowPercentage = totalRows > 0 ? Number(((duplicateRowCount / totalRows) * 100).toFixed(2)) : 0;

  // Infer Data Types & Calculate Column Statistics
  const columnProfiles = [];
  const numericalColumns = [];
  const categoricalColumns = [];
  const timestampCandidates = [];
  const identifierCandidates = [];
  const constantColumns = [];

  let totalInfiniteValues = 0;

  headers.forEach(colName => {
    const colTracker = columnData.get(colName);
    const nonMissingCount = colTracker.values.length;
    const missingCount = colTracker.missingCount;
    const missingPercentage = totalRows > 0 ? Number(((missingCount / totalRows) * 100).toFixed(2)) : 0;
    const uniqueValuesCount = colTracker.valueFrequency.size;
    const infiniteCount = colTracker.infiniteCount;
    totalInfiniteValues += infiniteCount;

    // Check if Constant Column
    const isConstant = uniqueValuesCount === 1 || (nonMissingCount === 0);
    if (isConstant) {
      constantColumns.push(colName);
    }

    // Type Inference Logic
    let inferredType = "string";
    const numericCount = colTracker.numbers.length;
    const numericRatio = nonMissingCount > 0 ? numericCount / nonMissingCount : 0;
    const sampleValues = colTracker.values.slice(0, 50);

    const isTimestamp = isTimestampCandidate(sampleValues);
    if (isTimestamp) {
      timestampCandidates.push(colName);
    }

    // High uniqueness identifier check
    const uniqueRatio = totalRows > 0 ? uniqueValuesCount / totalRows : 0;
    const isIdentifier = (uniqueRatio > 0.9 && totalRows >= 5) || 
      /^(id|uuid|guid|transaction_?id|log_?id|hash|index)$/i.test(colName);
    if (isIdentifier && !isTimestamp && numericRatio < 0.95) {
      identifierCandidates.push(colName);
    }

    let numericalStats = null;
    let categoricalStats = null;

    if (numericRatio >= 0.85 && !isTimestamp) {
      // Numerical feature
      inferredType = colTracker.numbers.every(n => Number.isInteger(n)) ? "integer" : "float";
      numericalColumns.push(colName);
      numericalStats = calculateNumericalStats(colTracker.numbers);
      numericalStats.infiniteCount = infiniteCount;
    } else {
      // Categorical / String / Boolean / Timestamp
      if (isTimestamp) {
        inferredType = "timestamp";
      } else if (
        uniqueValuesCount <= 2 &&
        Array.from(colTracker.valueFrequency.keys()).every(k => /^(true|false|0|1|yes|no|t|f)$/i.test(k))
      ) {
        inferredType = "boolean";
      } else if (isIdentifier) {
        inferredType = "identifier";
      } else {
        inferredType = "categorical";
      }
      categoricalColumns.push(colName);

      // Compute Top Categories Frequency Distribution
      const sortedFreq = Array.from(colTracker.valueFrequency.entries())
        .sort((a, b) => b[1] - a[1]);

      const topValue = sortedFreq.length > 0 ? sortedFreq[0][0] : null;
      const topFrequency = sortedFreq.length > 0 ? sortedFreq[0][1] : 0;

      const topCategories = sortedFreq.slice(0, 15).map(([category, count]) => ({
        category,
        count,
        percentage: Number(((count / (nonMissingCount || 1)) * 100).toFixed(2))
      }));

      categoricalStats = {
        uniqueCount: uniqueValuesCount,
        topValue,
        topFrequency,
        topPercentage: Number(((topFrequency / (nonMissingCount || 1)) * 100).toFixed(2)),
        valueCounts: topCategories
      };
    }

    columnProfiles.push({
      name: colName,
      inferredType,
      missingCount,
      missingPercentage,
      uniqueCount: uniqueValuesCount,
      isConstant,
      isTimestamp,
      isIdentifier,
      infiniteCount,
      numericalStats,
      categoricalStats
    });
  });

  // Target / Label Detection & Imbalance Analysis
  // Rules: Do NOT automatically assume column is "Label". Evaluate candidates or use user selected.
  let selectedTarget = null;
  let targetProfile = null;

  if (userTargetColumn && headers.includes(userTargetColumn)) {
    selectedTarget = userTargetColumn;
  } else if (!userTargetColumn) {
    // Intelligent heuristic: search candidate target columns
    // Priority: target, attack, label, class, threat, category, status, outcome
    const targetKeywords = [/target/i, /attack/i, /label/i, /class/i, /threat/i, /status/i, /verdict/i, /outcome/i, /malicious/i];
    for (const pattern of targetKeywords) {
      const match = headers.find(h => pattern.test(h));
      if (match) {
        const colTracker = columnData.get(match);
        const uniqueCount = colTracker.valueFrequency.size;
        // Supervised classification target should typically have between 2 and 50 unique classes
        if (uniqueCount >= 2 && uniqueCount <= 50) {
          selectedTarget = match;
          break;
        }
      }
    }
  }

  if (selectedTarget && columnData.has(selectedTarget)) {
    const colTracker = columnData.get(selectedTarget);
    const freqEntries = Array.from(colTracker.valueFrequency.entries())
      .sort((a, b) => b[1] - a[1]);

    const totalTargetNonMissing = colTracker.values.length;
    const classes = freqEntries.map(([cls]) => cls);
    const classCounts = {};
    const classPercentages = {};

    freqEntries.forEach(([cls, count]) => {
      classCounts[cls] = count;
      classPercentages[cls] = Number(((count / (totalTargetNonMissing || 1)) * 100).toFixed(2));
    });

    // Compute Class Imbalance Ratio (Majority Class Count / Minority Class Count)
    const majorityCount = freqEntries[0]?.[1] || 1;
    const minorityCount = freqEntries[freqEntries.length - 1]?.[1] || 1;
    const imbalanceRatioNum = minorityCount > 0 ? majorityCount / minorityCount : majorityCount;
    const imbalanceRatio = Number(imbalanceRatioNum.toFixed(2));

    let imbalanceSeverity = "None";
    let isImbalanced = false;

    if (imbalanceRatio > 10.0) {
      imbalanceSeverity = "Severe";
      isImbalanced = true;
    } else if (imbalanceRatio > 3.0) {
      imbalanceSeverity = "Moderate";
      isImbalanced = true;
    } else if (imbalanceRatio > 1.5) {
      imbalanceSeverity = "Low";
      isImbalanced = false;
    }

    targetProfile = {
      hasTarget: true,
      targetColumn: selectedTarget,
      classes,
      classCount: classes.length,
      classCounts,
      classPercentages,
      majorityClass: freqEntries[0]?.[0] || null,
      minorityClass: freqEntries[freqEntries.length - 1]?.[0] || null,
      imbalanceRatio,
      imbalanceRatioFormatted: `${imbalanceRatio}:1`,
      isImbalanced,
      imbalanceSeverity,
      message: `Supervised target '${selectedTarget}' detected with ${classes.length} distinct classes.`
    };
  } else {
    targetProfile = {
      hasTarget: false,
      targetColumn: null,
      classes: [],
      classCount: 0,
      classCounts: {},
      classPercentages: {},
      imbalanceRatio: null,
      imbalanceRatioFormatted: "N/A",
      isImbalanced: false,
      imbalanceSeverity: "None",
      message: "No supervised target detected."
    };
  }

  // Potential target candidates list for user selector dropdown
  const targetCandidates = headers.filter(h => {
    const colTracker = columnData.get(h);
    const uCount = colTracker.valueFrequency.size;
    return uCount >= 2 && uCount <= 50;
  });

  return {
    summary: {
      totalRows,
      totalColumns,
      numericalFeatureCount: numericalColumns.length,
      categoricalFeatureCount: categoricalColumns.length,
      timestampCandidateCount: timestampCandidates.length,
      identifierCandidateCount: identifierCandidates.length,
      totalMissingValues: totalMissingValuesAcrossDataset,
      overallMissingPercentage,
      duplicateRowCount,
      duplicateRowPercentage,
      constantColumnCount: constantColumns.length,
      infiniteValuesCount: totalInfiniteValues
    },
    features: {
      numericalColumns,
      categoricalColumns,
      timestampCandidates,
      identifierCandidates,
      constantColumns,
      targetCandidates,
      profiles: columnProfiles
    },
    target: targetProfile
  };
}
