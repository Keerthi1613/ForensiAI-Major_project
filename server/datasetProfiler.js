import fs from "fs";
import path from "path";
import readline from "readline";
import { parseCSVLine } from "./datasetValidator.js";

/**
 * Checks if a string value is considered missing / null.
 */
export function isMissingValue(val) {
  if (val === null || val === undefined) return true;
  const str = String(val).trim().toLowerCase();
  return (
    str === "" ||
    str === "null" ||
    str === "nan" ||
    str === "none" ||
    str === "n/a" ||
    str === "na" ||
    str === "undefined" ||
    str === "?"
  );
}

/**
 * Checks if a string represents an infinite value.
 */
export function isInfiniteValue(val) {
  if (val === null || val === undefined) return false;
  const str = String(val).trim().toLowerCase();
  return (
    str === "infinity" ||
    str === "+infinity" ||
    str === "-infinity" ||
    str === "inf" ||
    str === "+inf" ||
    str === "-inf"
  );
}

/**
 * Tests if a sample of values represents timestamp/date strings.
 */
export function isTimestampCandidate(sampleValues) {
  if (!sampleValues || sampleValues.length === 0) return false;
  const dateRegex = /^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  const dateRegexAlt = /^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  const timeRegex = /^\d{1,2}:\d{2}(:\d{2})?$/;

  let validDateCount = 0;
  for (const v of sampleValues) {
    if (isMissingValue(v)) continue;
    const str = String(v).trim();
    if (dateRegex.test(str) || dateRegexAlt.test(str) || isoRegex.test(str) || timeRegex.test(str)) {
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
  if (!sortedArray || sortedArray.length === 0) return 0;
  const index = (percentile / 100) * (sortedArray.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  if (lower === upper) return sortedArray[lower];
  return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}

/**
 * Calculates numerical summary statistics from an array of numbers.
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
      zerosPercentage: 0,
      infiniteCount: 0
    };
  }

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
 * Memory-safe duplicate row tracker.
 * Uses exact Set for <= 25,000 unique rows, and seamlessly transitions
 * to an 8MB Bloom filter bitset for massive datasets (1M+ rows) with O(1) memory.
 */
class MemorySafeDuplicateTracker {
  constructor(maxExact = 25000) {
    this.maxExact = maxExact;
    this.exactSet = new Set();
    this.bloomBuffer = null;
    this.bloomSizeBytes = 8 * 1024 * 1024; // 8MB buffer
    this.bloomSizeBits = this.bloomSizeBytes * 8; // 67,108,864 bits
    this.duplicateCount = 0;
    this.useBloom = false;
  }

  _hash1(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  _hash2(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
      h = ((h << 5) + h) + str.charCodeAt(i);
      h = h & h;
    }
    return h >>> 0;
  }

  _hash3(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = str.charCodeAt(i) + (h << 6) + (h << 16) - h;
      h = h & h;
    }
    return h >>> 0;
  }

  _initBloom() {
    if (!this.bloomBuffer) {
      this.bloomBuffer = Buffer.alloc(this.bloomSizeBytes);
      for (const hash of this.exactSet) {
        this._addBloom(hash);
      }
      this.exactSet.clear();
    }
  }

  _addBloom(str) {
    const h1 = this._hash1(str);
    const h2 = this._hash2(str);
    const h3 = this._hash3(str);
    const h4 = (h1 + h2 * 31) >>> 0;

    const bits = [
      h1 % this.bloomSizeBits,
      h2 % this.bloomSizeBits,
      h3 % this.bloomSizeBits,
      h4 % this.bloomSizeBits
    ];

    let allPresent = true;
    for (const bit of bits) {
      const byteIndex = bit >> 3;
      const bitOffset = bit & 7;
      if ((this.bloomBuffer[byteIndex] & (1 << bitOffset)) === 0) {
        allPresent = false;
        this.bloomBuffer[byteIndex] |= (1 << bitOffset);
      }
    }

    return allPresent;
  }

  checkAndAdd(rowStr) {
    if (!this.useBloom) {
      if (this.exactSet.has(rowStr)) {
        this.duplicateCount++;
        return true;
      }
      this.exactSet.add(rowStr);
      if (this.exactSet.size >= this.maxExact) {
        this.useBloom = true;
        this._initBloom();
      }
      return false;
    } else {
      const isDup = this._addBloom(rowStr);
      if (isDup) {
        this.duplicateCount++;
      }
      return isDup;
    }
  }

  destroy() {
    if (this.exactSet) this.exactSet.clear();
    this.bloomBuffer = null;
  }
}

/**
 * Column statistical state accumulator for single-pass streaming profiling.
 */
class ColumnAccumulator {
  constructor(name, index) {
    this.name = name;
    this.index = index;
    this.totalCells = 0;
    this.missingCount = 0;
    this.infiniteCount = 0;
    this.nonMissingCount = 0;

    // Type tracking counters
    this.numericCount = 0;
    this.integerCount = 0;

    // Welford's algorithm online state for numerical values
    this.mean = 0;
    this.M2 = 0;
    this.min = Infinity;
    this.max = -Infinity;
    this.zerosCount = 0;

    // Reservoir sample for percentiles (capped at 5,000 numbers)
    this.reservoirLimit = 5000;
    this.reservoir = [];
    this.reservoirSeen = 0;

    // Sample string values for type heuristics (first 100 non-missing)
    this.sampleValues = [];
    this.sampleLimit = 100;

    // Capped category frequency map (capped at 1,000 distinct items per column)
    this.maxTrackedCategories = 1000;
    this.valueFrequency = new Map();
    this.isHighCardinality = false;
    this.approxUniqueCount = 0;
  }

  processValue(rawCell) {
    this.totalCells++;

    if (isMissingValue(rawCell)) {
      this.missingCount++;
      return;
    }

    if (isInfiniteValue(rawCell)) {
      this.infiniteCount++;
      return;
    }

    this.nonMissingCount++;
    const strVal = String(rawCell).trim();

    // Collect sample values for type inference
    if (this.sampleValues.length < this.sampleLimit) {
      this.sampleValues.push(strVal);
    }

    // Track category frequencies with high-cardinality protection
    if (!this.isHighCardinality) {
      const current = this.valueFrequency.get(strVal);
      if (current !== undefined) {
        this.valueFrequency.set(strVal, current + 1);
      } else {
        if (this.valueFrequency.size < this.maxTrackedCategories) {
          this.valueFrequency.set(strVal, 1);
          this.approxUniqueCount++;
        } else {
          this.isHighCardinality = true;
          this.approxUniqueCount++;
        }
      }
    } else {
      const current = this.valueFrequency.get(strVal);
      if (current !== undefined) {
        this.valueFrequency.set(strVal, current + 1);
      } else {
        this.approxUniqueCount++;
      }
    }

    // Numerical processing
    const num = Number(strVal);
    if (!isNaN(num) && strVal !== "") {
      this.numericCount++;
      if (Number.isInteger(num)) {
        this.integerCount++;
      }

      if (num === 0) this.zerosCount++;
      if (num < this.min) this.min = num;
      if (num > this.max) this.max = num;

      // Online Welford update
      this.reservoirSeen++;
      const delta = num - this.mean;
      this.mean += delta / this.reservoirSeen;
      const delta2 = num - this.mean;
      this.M2 += delta * delta2;

      // Reservoir sampling for percentiles
      if (this.reservoir.length < this.reservoirLimit) {
        this.reservoir.push(num);
      } else {
        const r = Math.floor(Math.random() * this.reservoirSeen);
        if (r < this.reservoirLimit) {
          this.reservoir[r] = num;
        }
      }
    }
  }

  finalizeStats(totalRows) {
    const missingPercentage = totalRows > 0 ? Number(((this.missingCount / totalRows) * 100).toFixed(2)) : 0;
    const uniqueCount = this.isHighCardinality ? this.approxUniqueCount : this.valueFrequency.size;
    const isConstant = uniqueCount === 1 || (this.nonMissingCount === 0);

    const numericRatio = this.nonMissingCount > 0 ? this.numericCount / this.nonMissingCount : 0;
    const isTimestamp = isTimestampCandidate(this.sampleValues);
    const uniqueRatio = totalRows > 0 ? uniqueCount / totalRows : 0;
    const isIdentifier = (uniqueRatio > 0.9 && totalRows >= 5) ||
      /^(id|uuid|guid|transaction_?id|log_?id|hash|index)$/i.test(this.name);

    let inferredType = "string";
    let numericalStats = null;
    let categoricalStats = null;

    if (numericRatio >= 0.85 && !isTimestamp) {
      inferredType = this.integerCount === this.numericCount ? "integer" : "float";
      
      let mean = 0;
      let stdDev = 0;
      let median = null;
      let q25 = null;
      let q75 = null;
      let min = null;
      let max = null;

      if (this.numericCount > 0) {
        min = Number(this.min.toFixed(4));
        max = Number(this.max.toFixed(4));
        mean = Number(this.mean.toFixed(4));
        const variance = this.numericCount > 0 ? this.M2 / this.numericCount : 0;
        stdDev = Number(Math.sqrt(variance).toFixed(4));

        this.reservoir.sort((a, b) => a - b);
        median = Number(calculatePercentile(this.reservoir, 50).toFixed(4));
        q25 = Number(calculatePercentile(this.reservoir, 25).toFixed(4));
        q75 = Number(calculatePercentile(this.reservoir, 75).toFixed(4));
      }

      numericalStats = {
        min,
        max,
        mean,
        median,
        stdDev,
        q25,
        q75,
        zerosCount: this.zerosCount,
        zerosPercentage: this.numericCount > 0 ? Number(((this.zerosCount / this.numericCount) * 100).toFixed(2)) : 0,
        infiniteCount: this.infiniteCount
      };
    } else {
      if (isTimestamp) {
        inferredType = "timestamp";
      } else if (
        uniqueCount <= 2 &&
        Array.from(this.valueFrequency.keys()).every(k => /^(true|false|0|1|yes|no|t|f)$/i.test(k))
      ) {
        inferredType = "boolean";
      } else if (isIdentifier) {
        inferredType = "identifier";
      } else {
        inferredType = "categorical";
      }

      const sortedFreq = Array.from(this.valueFrequency.entries())
        .sort((a, b) => b[1] - a[1]);

      const topValue = sortedFreq.length > 0 ? sortedFreq[0][0] : null;
      const topFrequency = sortedFreq.length > 0 ? sortedFreq[0][1] : 0;

      const topCategories = sortedFreq.slice(0, 15).map(([category, count]) => ({
        category,
        count,
        percentage: Number(((count / (this.nonMissingCount || 1)) * 100).toFixed(2))
      }));

      categoricalStats = {
        uniqueCount,
        topValue,
        topFrequency,
        topPercentage: Number(((topFrequency / (this.nonMissingCount || 1)) * 100).toFixed(2)),
        valueCounts: topCategories
      };
    }

    return {
      name: this.name,
      inferredType,
      missingCount: this.missingCount,
      missingPercentage,
      uniqueCount,
      isConstant,
      isTimestamp,
      isIdentifier,
      infiniteCount: this.infiniteCount,
      numericalStats,
      categoricalStats,
      // Internal fields needed for target evaluation
      _isNumeric: numericRatio >= 0.85 && !isTimestamp,
      _isTimestamp: isTimestamp,
      _isIdentifier: isIdentifier,
      _isConstant: isConstant
    };
  }
}

/**
 * Profiles a CSV dataset file with complete streaming O(1) memory statistical analysis.
 *
 * @param {string} filePath - Absolute path to dataset CSV.
 * @param {object} [options] - Profiling options.
 * @param {string} [options.targetColumn] - Explicit target column name (optional).
 * @param {Function} [options.onProgress] - Optional progress callback ({ rowsProcessed, estimatedPercent, bytesProcessed }).
 * @returns {Promise<object>} Profiling report.
 */
export async function profileDataset(filePath, options = {}) {
  const { targetColumn: userTargetColumn, onProgress } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error("Dataset file does not exist.");
  }

  const stat = fs.statSync(filePath);
  const totalFileSizeBytes = stat.size;

  if (totalFileSizeBytes === 0) {
    throw new Error("Dataset file is empty (0 bytes).");
  }

  let headers = [];
  let isFirstLine = true;
  let lineIndex = 0;
  let totalRows = 0;

  /** @type {Map<string, ColumnAccumulator>} */
  const columnAccumulators = new Map();
  const dupTracker = new MemorySafeDuplicateTracker();

  let totalMissingValuesAcrossDataset = 0;
  let totalInfiniteValuesAcrossDataset = 0;
  let bytesReadApprox = 0;

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8", highWaterMark: 64 * 1024 });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  try {
    for await (let rawLine of rl) {
      lineIndex++;
      bytesReadApprox += Buffer.byteLength(rawLine, "utf8") + 1;

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
        if (headers.length === 0) {
          throw new Error("CSV contains an empty or unparseable header row.");
        }
        headers.forEach((h, idx) => {
          columnAccumulators.set(h, new ColumnAccumulator(h, idx));
        });
        continue;
      }

      totalRows++;

      // Duplicate row check
      dupTracker.checkAndAdd(trimmed);

      // Process fields
      const fields = parsed.fields;
      for (let i = 0; i < headers.length; i++) {
        const h = headers[i];
        const acc = columnAccumulators.get(h);
        if (!acc) continue;

        const cell = fields[i] ?? "";
        if (isMissingValue(cell)) {
          totalMissingValuesAcrossDataset++;
        } else if (isInfiniteValue(cell)) {
          totalInfiniteValuesAcrossDataset++;
        }
        acc.processValue(cell);
      }

      // Progress reporting
      if (totalRows % 100000 === 0 && onProgress) {
        const estimatedPercent = totalFileSizeBytes > 0 ? Math.min(99, Math.round((bytesReadApprox / totalFileSizeBytes) * 100)) : 0;
        onProgress({
          rowsProcessed: totalRows,
          bytesProcessed: bytesReadApprox,
          progress: estimatedPercent,
          status: "processing"
        });
      }
    }
  } catch (streamErr) {
    dupTracker.destroy();
    throw new Error(`CSV stream processing error: ${streamErr.message}`);
  }

  if (headers.length === 0 || totalRows === 0) {
    dupTracker.destroy();
    throw new Error("Dataset contains no parseable data rows.");
  }

  const totalColumns = headers.length;
  const totalCells = totalRows * totalColumns;
  const overallMissingPercentage = totalCells > 0 ? Number(((totalMissingValuesAcrossDataset / totalCells) * 100).toFixed(2)) : 0;
  const duplicateRowCount = dupTracker.duplicateCount;
  const duplicateRowPercentage = totalRows > 0 ? Number(((duplicateRowCount / totalRows) * 100).toFixed(2)) : 0;
  dupTracker.destroy();

  // Finalize Column Statistics & Classifications
  const columnProfiles = [];
  const numericalColumns = [];
  const categoricalColumns = [];
  const timestampCandidates = [];
  const identifierCandidates = [];
  const constantColumns = [];

  headers.forEach(colName => {
    const acc = columnAccumulators.get(colName);
    if (!acc) return;

    const profile = acc.finalizeStats(totalRows);

    if (profile._isNumeric) {
      numericalColumns.push(colName);
    } else {
      categoricalColumns.push(colName);
    }

    if (profile._isTimestamp) timestampCandidates.push(colName);
    if (profile._isIdentifier && !profile._isTimestamp && !profile._isNumeric) identifierCandidates.push(colName);
    if (profile._isConstant) constantColumns.push(colName);

    // Remove internal flags before exporting
    const { _isNumeric, _isTimestamp, _isIdentifier, _isConstant, ...cleanProfile } = profile;
    columnProfiles.push(cleanProfile);
  });

  // Target / Label Detection & Imbalance Analysis
  let selectedTarget = null;
  let targetProfile = null;

  if (userTargetColumn && headers.includes(userTargetColumn)) {
    selectedTarget = userTargetColumn;
  } else if (!userTargetColumn) {
    const targetKeywords = [/target/i, /attack/i, /label/i, /class/i, /threat/i, /status/i, /verdict/i, /outcome/i, /malicious/i];
    for (const pattern of targetKeywords) {
      const match = headers.find(h => pattern.test(h));
      if (match) {
        const acc = columnAccumulators.get(match);
        const uniqueCount = acc.valueFrequency.size;
        if (uniqueCount >= 2 && uniqueCount <= 50) {
          selectedTarget = match;
          break;
        }
      }
    }
  }

  if (selectedTarget && columnAccumulators.has(selectedTarget)) {
    const acc = columnAccumulators.get(selectedTarget);
    const freqEntries = Array.from(acc.valueFrequency.entries())
      .sort((a, b) => b[1] - a[1]);

    const totalTargetNonMissing = acc.nonMissingCount;
    const classes = freqEntries.map(([cls]) => cls);
    const classCounts = {};
    const classPercentages = {};

    freqEntries.forEach(([cls, count]) => {
      classCounts[cls] = count;
      classPercentages[cls] = Number(((count / (totalTargetNonMissing || 1)) * 100).toFixed(2));
    });

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

  // Target candidates list for dropdown selector
  const targetCandidates = headers.filter(h => {
    const acc = columnAccumulators.get(h);
    const uCount = acc ? acc.valueFrequency.size : 0;
    return uCount >= 2 && uCount <= 50;
  });

  if (onProgress) {
    onProgress({
      rowsProcessed: totalRows,
      bytesProcessed: totalFileSizeBytes,
      progress: 100,
      status: "completed"
    });
  }

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
      infiniteValuesCount: totalInfiniteValuesAcrossDataset
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
