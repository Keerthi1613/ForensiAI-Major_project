import fs from "fs";
import path from "path";
import readline from "readline";

/**
 * Sanitizes a filename to prevent path traversal and shell injection.
 * Retains safe alphanumeric characters, dashes, underscores, and dots.
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== "string") {
    return `dataset_${Date.now()}.csv`;
  }
  // Strip path traversal sequences
  const basename = path.basename(filename).replace(/[\/\\]/g, "");
  // Replace illegal / unsafe characters with underscores
  const cleaned = basename.replace(/[^a-zA-Z0-9._-]/g, "_").trim();
  return cleaned.length > 0 ? cleaned : `dataset_${Date.now()}.csv`;
}

/**
 * Formats byte size into human readable string.
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Checks whether a buffer contains binary/non-text data.
 * Checks for null bytes and excessive non-printable control characters.
 */
export function isBinaryBuffer(buffer) {
  const checkLength = Math.min(buffer.length, 8192);
  let nonPrintableCount = 0;

  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i];
    // Check for null byte (common in binaries)
    if (byte === 0) {
      return true;
    }
    // Check for non-printable control characters excluding tab(9), LF(10), CR(13)
    if ((byte < 32 || byte === 127) && byte !== 9 && byte !== 10 && byte !== 13) {
      nonPrintableCount++;
    }
  }

  // If more than 5% non-printable characters, consider it binary
  return checkLength > 0 && (nonPrintableCount / checkLength) > 0.05;
}

/**
 * Parses a single CSV line adhering to RFC 4180 rules (handling quoted fields and commas).
 */
export function parseCSVLine(line) {
  const fields = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote: "" -> "
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === ',') {
        fields.push(currentField.trim());
        currentField = "";
        i++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  fields.push(currentField.trim());

  return {
    fields,
    unclosedQuote: inQuotes
  };
}

/**
 * Validates a CSV dataset file with comprehensive checks.
 *
 * @param {string} filePath - Absolute path to the file on disk.
 * @param {object} options - Validation options.
 * @param {string} options.originalFilename - Original filename before upload.
 * @param {number} options.maxFileSize - Max allowed file size in bytes (default: 500MB).
 * @param {number} options.minRows - Minimum data rows required (default: 1).
 * @param {number} options.minColumns - Minimum columns required (default: 2).
 * @returns {Promise<object>} Validation report.
 */
export async function validateDataset(filePath, options = {}) {
  const {
    originalFilename = path.basename(filePath),
    maxFileSize = 500 * 1024 * 1024, // 500MB
    minRows = 1,
    minColumns = 2
  } = options;

  const errors = [];
  const warnings = [];
  const checks = {
    fileExtension: false,
    fileSize: false,
    encoding: false,
    csvStructure: false,
    columnCount: false,
    duplicateColumns: false,
    rowCount: false
  };

  // 1. Validate File Extension
  const ext = path.extname(originalFilename).toLowerCase();
  if (ext !== ".csv") {
    errors.push(`Invalid file extension '${ext}'. Only .csv files are supported.`);
  } else {
    checks.fileExtension = true;
  }

  // 2. Validate File Exists and File Size
  if (!fs.existsSync(filePath)) {
    errors.push("Dataset file does not exist on server storage.");
    return buildReport(false, "INVALID", errors, warnings, checks, {
      originalFilename,
      fileSize: 0,
      fileSizeFormatted: "0 Bytes",
      rowCount: 0,
      columnCount: 0,
      columnNames: [],
      encoding: "unknown",
      sampleRows: []
    });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const fileSizeFormatted = formatBytes(fileSize);

  if (fileSize === 0) {
    errors.push("Dataset file is empty (0 bytes).");
  } else if (fileSize > maxFileSize) {
    errors.push(`Dataset file size (${fileSizeFormatted}) exceeds maximum limit (${formatBytes(maxFileSize)}).`);
  } else {
    checks.fileSize = true;
  }

  // If fatal file extension or size errors, return immediately
  if (errors.length > 0) {
    return buildReport(false, "INVALID", errors, warnings, checks, {
      originalFilename,
      fileSize,
      fileSizeFormatted,
      rowCount: 0,
      columnCount: 0,
      columnNames: [],
      encoding: "unknown",
      sampleRows: []
    });
  }

  // 3. Validate Encoding & Binary Content
  let detectedEncoding = "UTF-8";
  const bufferHeader = Buffer.alloc(Math.min(fileSize, 16384));
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, bufferHeader, 0, bufferHeader.length, 0);
  fs.closeSync(fd);

  if (isBinaryBuffer(bufferHeader)) {
    errors.push("Invalid encoding or binary content detected. File appears to be binary, not valid CSV text.");
  } else {
    // Check for UTF-8 BOM
    if (bufferHeader.length >= 3 && bufferHeader[0] === 0xef && bufferHeader[1] === 0xbb && bufferHeader[2] === 0xbf) {
      detectedEncoding = "UTF-8 (with BOM)";
    }
    checks.encoding = true;
  }

  if (errors.length > 0) {
    return buildReport(false, "INVALID", errors, warnings, checks, {
      originalFilename,
      fileSize,
      fileSizeFormatted,
      rowCount: 0,
      columnCount: 0,
      columnNames: [],
      encoding: detectedEncoding,
      sampleRows: []
    });
  }

  // 4. Stream and Parse CSV Structure
  let headers = [];
  let headerColCount = 0;
  let totalDataRows = 0;
  let malformedRows = 0;
  let emptyRowsSkipped = 0;
  let nullCellCount = 0;
  const sampleRows = [];
  const MAX_SAMPLE_ROWS = 10;
  let isFirstLine = true;
  let lineIndex = 0;

  const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  try {
    for await (let rawLine of rl) {
      lineIndex++;

      // Handle BOM on the first line if present
      if (lineIndex === 1 && rawLine.charCodeAt(0) === 0xfeff) {
        rawLine = rawLine.slice(1);
      }

      const trimmed = rawLine.trim();
      if (!trimmed) {
        emptyRowsSkipped++;
        continue;
      }

      const parsed = parseCSVLine(rawLine);

      if (parsed.unclosedQuote) {
        malformedRows++;
        if (malformedRows <= 5) {
          errors.push(`Malformed CSV at line ${lineIndex}: Unclosed quote detected.`);
        }
        continue;
      }

      if (isFirstLine) {
        isFirstLine = false;
        headers = parsed.fields.map(h => h.trim());
        headerColCount = headers.length;

        // Check Minimum Columns
        if (headerColCount < minColumns) {
          errors.push(`Dataset must contain at least ${minColumns} columns. Found: ${headerColCount}.`);
        } else {
          checks.columnCount = true;
        }

        // Check Empty Header Names
        const emptyHeaderIndices = headers
          .map((h, idx) => (h === "" ? idx + 1 : null))
          .filter(Boolean);
        if (emptyHeaderIndices.length > 0) {
          errors.push(`Header row contains empty column name(s) at position(s): ${emptyHeaderIndices.join(", ")}.`);
        }

        // Check Duplicate Columns (case-insensitive)
        const seenHeaders = new Map();
        const duplicates = [];
        headers.forEach((h, idx) => {
          const lower = h.toLowerCase();
          if (seenHeaders.has(lower)) {
            duplicates.push(`'${h}' (col ${seenHeaders.get(lower) + 1} and ${idx + 1})`);
          } else {
            seenHeaders.set(lower, idx);
          }
        });

        if (duplicates.length > 0) {
          errors.push(`Duplicate column name(s) detected in header: ${duplicates.join(", ")}.`);
        } else {
          checks.duplicateColumns = true;
        }

        continue;
      }

      // Process Data Rows
      totalDataRows++;
      const rowFields = parsed.fields;

      // Validate Column Count Consistency
      if (rowFields.length !== headerColCount) {
        malformedRows++;
        if (malformedRows <= 5) {
          errors.push(`Line ${lineIndex} has ${rowFields.length} columns, expected ${headerColCount}.`);
        }
      }

      // Count empty/null cells
      for (const field of rowFields) {
        if (field === "" || field.toLowerCase() === "null" || field.toLowerCase() === "nan") {
          nullCellCount++;
        }
      }

      // Collect Preview Sample Rows
      if (sampleRows.length < MAX_SAMPLE_ROWS) {
        const rowObj = {};
        headers.forEach((headerName, idx) => {
          rowObj[headerName || `col_${idx + 1}`] = rowFields[idx] ?? "";
        });
        sampleRows.push(rowObj);
      }
    }
  } catch (streamErr) {
    errors.push(`Error reading CSV stream: ${streamErr.message}`);
  }

  // 5. Final Row and Structure Checks
  if (headers.length === 0) {
    errors.push("CSV header row could not be parsed or is missing.");
  }

  if (totalDataRows < minRows) {
    errors.push(`Dataset must contain at least ${minRows} data row(s). Found: ${totalDataRows}.`);
  } else {
    checks.rowCount = true;
  }

  if (malformedRows > 0 && !errors.some(e => e.includes("Malformed CSV") || e.includes("expected"))) {
    errors.push(`Encountered ${malformedRows} malformed row(s) with column count mismatches.`);
  }

  if (errors.length === 0) {
    checks.csvStructure = true;
  }

  // 6. Warnings Assessment
  if (emptyRowsSkipped > 0) {
    warnings.push(`Skipped ${emptyRowsSkipped} empty line(s) in CSV.`);
  }
  if (nullCellCount > 0) {
    warnings.push(`Found ${nullCellCount} null or empty cell(s) across data rows.`);
  }

  // Determine overall status
  let status = "VALID";
  let isValid = true;

  if (errors.length > 0) {
    status = "INVALID";
    isValid = false;
  } else if (warnings.length > 0) {
    status = "WARNING";
    isValid = true;
  }

  return buildReport(isValid, status, errors, warnings, checks, {
    originalFilename,
    fileSize,
    fileSizeFormatted,
    rowCount: totalDataRows,
    columnCount: headerColCount,
    columnNames: headers,
    encoding: detectedEncoding,
    sampleRows
  });
}

function buildReport(isValid, status, errors, warnings, checks, metadata) {
  return {
    isValid,
    status,
    errors,
    warnings,
    checks,
    metadata
  };
}
