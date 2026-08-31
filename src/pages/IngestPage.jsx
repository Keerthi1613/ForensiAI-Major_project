import React, { useState, useEffect } from "react";
import { 
  FiUploadCloud, FiDatabase, FiFileText, FiCheckCircle, FiZap, FiPlusCircle, 
  FiHardDrive, FiAlertTriangle, FiAlertCircle, FiXCircle, FiTrash2, 
  FiLayers, FiTable, FiRefreshCw, FiCheck, FiX, FiInfo, FiClock, FiUser,
  FiBarChart2, FiPieChart, FiActivity, FiTarget, FiSliders, FiSearch, 
  FiCpu, FiShield, FiCode, FiGitBranch, FiPlay, FiLock, FiSliders as FiSlidersIcon
} from "react-icons/fi";
import { 
  uploadDataset, getDatasets, deleteDataset, 
  getDatasetProfile, updateDatasetTarget,
  preprocessDataset, getPreprocessingSchema,
  getLocalArchive, ingestFromArchive 
} from "../services/api.js";

export default function IngestPage() {
  // Datasets State
  const [datasets, setDatasets] = useState([]);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [loadingDatasets, setLoadingDatasets] = useState(false);

  // Upload & Validation States
  // 'idle' | 'uploading' | 'processing' | 'valid' | 'warning' | 'invalid' | 'error'
  const [uploadState, setUploadState] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [validationReport, setValidationReport] = useState(null);
  const [currentDataset, setCurrentDataset] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  // Module 2: Profiling State
  const [profileData, setProfileData] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [selectedTargetColumn, setSelectedTargetColumn] = useState("");
  const [activeTab, setActiveTab] = useState("profile"); // 'profile' | 'preprocessing' | 'preview' | 'diagnostics'
  const [featureSearch, setFeatureSearch] = useState("");

  // Module 3: ML Preprocessing Pipeline State
  const [testSize, setTestSize] = useState(0.2);
  const [numericalScaling, setNumericalScaling] = useState("standard");
  const [categoricalEncoding, setCategoricalEncoding] = useState("onehot");
  const [deriveTimestamps, setDeriveTimestamps] = useState(true);
  const [handleIdentifiers, setHandleIdentifiers] = useState("exclude");
  const [preprocessingResult, setPreprocessingResult] = useState(null);
  const [loadingPreprocessing, setLoadingPreprocessing] = useState(false);
  const [preprocessingError, setPreprocessingError] = useState("");
  const [schemaSearch, setSchemaSearch] = useState("");

  // Archive State (Legacy preservation)
  const [archive, setArchive] = useState([]);
  const [activeArchiveFile, setActiveArchiveFile] = useState(null);
  const [archiveLoading, setArchiveLoading] = useState(false);

  useEffect(() => {
    fetchDatasets();
    fetchArchive();
  }, []);

  // When selectedDataset or currentDataset changes, fetch its profile & reset preprocessing
  useEffect(() => {
    const targetId = selectedDataset?.id || currentDataset?.id;
    if (targetId) {
      fetchDatasetProfile(targetId);
      setPreprocessingResult(null);
      setPreprocessingError("");
    } else {
      setProfileData(null);
      setPreprocessingResult(null);
    }
  }, [selectedDataset?.id, currentDataset?.id]);

  const fetchDatasets = async () => {
    setLoadingDatasets(true);
    try {
      const data = await getDatasets();
      setDatasets(data || []);
    } catch (err) {
      console.error("Failed to fetch datasets:", err);
    } finally {
      setLoadingDatasets(false);
    }
  };

  const fetchDatasetProfile = async (id, targetCol = null) => {
    setLoadingProfile(true);
    try {
      const data = await getDatasetProfile(id, targetCol);
      setProfileData(data.profile);
      if (data.profile?.target?.targetColumn) {
        setSelectedTargetColumn(data.profile.target.targetColumn);
      } else {
        setSelectedTargetColumn("");
      }
    } catch (err) {
      console.error("Failed to fetch dataset profile:", err);
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleTargetChange = async (newTarget) => {
    const targetId = selectedDataset?.id || currentDataset?.id;
    if (!targetId) return;

    setSelectedTargetColumn(newTarget);
    fetchDatasetProfile(targetId, newTarget === "NONE" ? "" : newTarget);
  };

  const handleRunPreprocessing = async () => {
    const targetId = selectedDataset?.id || currentDataset?.id;
    if (!targetId) return;

    setLoadingPreprocessing(true);
    setPreprocessingError("");
    try {
      const result = await preprocessDataset(targetId, {
        targetColumn: selectedTargetColumn && selectedTargetColumn !== "NONE" ? selectedTargetColumn : null,
        testSize: Number(testSize),
        numericalScaling,
        categoricalEncoding,
        deriveTimestamps,
        handleIdentifiers
      });
      setPreprocessingResult(result);
    } catch (err) {
      console.error("Preprocessing pipeline failure:", err);
      setPreprocessingError(err.response?.data?.error || err.message || "Pipeline execution failed");
    } finally {
      setLoadingPreprocessing(false);
    }
  };

  const fetchArchive = async () => {
    try {
      const files = await getLocalArchive();
      setArchive(files || []);
    } catch (err) {
      console.error("Failed to fetch archive:", err);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset state for new upload
    setProgress(0);
    setErrorMessage("");
    setValidationReport(null);
    setCurrentDataset(null);
    setSelectedDataset(null);
    setProfileData(null);
    setPreprocessingResult(null);
    setUploadState("uploading");
    setStatusMessage(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // 1. Uploading phase
      const uploadPromise = uploadDataset(formData, (percent) => {
        setProgress(percent);
        if (percent >= 100) {
          setUploadState("processing");
          setStatusMessage(`Processing & validating ${file.name}...`);
        } else {
          setStatusMessage(`Uploading ${file.name}: ${percent}%`);
        }
      });

      const res = await uploadPromise;

      // 2. Processing & Validation success phase
      const status = res.validation?.status?.toLowerCase() || "valid";
      setUploadState(status === "warning" ? "warning" : "valid");
      setCurrentDataset(res.dataset);
      setValidationReport(res.validation);
      setStatusMessage(res.message || "Dataset validated and stored successfully.");
      setActiveTab("profile");
      fetchDatasets();
    } catch (err) {
      console.error("Upload/Validation error:", err);
      if (err.response?.data?.validation) {
        setUploadState("invalid");
        setValidationReport(err.response.data.validation);
        setCurrentDataset(err.response.data.dataset);
        setErrorMessage(err.response.data.error || "Dataset validation failed.");
        setStatusMessage("Validation failed. Dataset structure invalid.");
        setActiveTab("diagnostics");
      } else {
        setUploadState("error");
        const msg = err.response?.data?.error || err.message || "Failed to upload file.";
        setErrorMessage(msg);
        setStatusMessage(`Error: ${msg}`);
      }
    } finally {
      e.target.value = null; // Clear file input
    }
  };

  const handleDeleteDataset = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this dataset?")) return;

    try {
      await deleteDataset(id);
      if (selectedDataset?.id === id) {
        setSelectedDataset(null);
      }
      if (currentDataset?.id === id) {
        setCurrentDataset(null);
        setValidationReport(null);
        setProfileData(null);
        setPreprocessingResult(null);
        setUploadState("idle");
      }
      fetchDatasets();
    } catch (err) {
      console.error("Failed to delete dataset:", err);
      alert("Failed to delete dataset: " + (err.response?.data?.error || err.message));
    }
  };

  const handleArchiveIngest = async (filename) => {
    setArchiveLoading(true);
    setActiveArchiveFile(filename);
    setStatusMessage(`Streaming ${filename} into SOC buffer...`);
    try {
      const res = await ingestFromArchive(filename);
      setStatusMessage(`Indexed ${res.count} signals into SOC buffer.`);
      setTimeout(() => setStatusMessage(""), 5000);
    } catch (err) {
      setStatusMessage("Archive stream sync failed.");
    } finally {
      setArchiveLoading(false);
      setActiveArchiveFile(null);
    }
  };

  const displayedDataset = selectedDataset || currentDataset;
  const displayedReport = selectedDataset?.validationDetails || validationReport;

  // Filter features for matrix
  const filteredFeatures = (profileData?.features?.profiles || []).filter(f => 
    f.name.toLowerCase().includes(featureSearch.toLowerCase()) ||
    f.inferredType.toLowerCase().includes(featureSearch.toLowerCase())
  );

  // Filter output schema for preprocessing
  const filteredSchema = (preprocessingResult?.schema?.featureMetadata || []).filter(f =>
    f.name.toLowerCase().includes(schemaSearch.toLowerCase()) ||
    f.originalColumn.toLowerCase().includes(schemaSearch.toLowerCase()) ||
    f.type.toLowerCase().includes(schemaSearch.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-fade-in pb-20">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-divider pb-4 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-[0.65rem] font-mono uppercase bg-primary/10 text-primary border border-primary/30 rounded">
              Modules 1-3
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-text-primary">Dataset Pipeline & Preprocessing</h1>
          </div>
          <p className="text-[0.7rem] text-text-secondary mt-1 font-mono uppercase tracking-widest">
            Ingestion, Validation, Statistical Profiling & Leakage-Proof ML Preprocessing
          </p>
        </div>

        {/* STATUS PILL */}
        <div className="flex items-center gap-3">
          {uploadState !== "idle" && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-surface/80 text-xs font-mono">
              {uploadState === "uploading" && (
                <>
                  <div className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  <span className="text-primary font-bold uppercase tracking-wider">Uploading ({progress}%)</span>
                </>
              )}
              {uploadState === "processing" && (
                <>
                  <FiRefreshCw className="text-primary animate-spin" size={14} />
                  <span className="text-primary font-bold uppercase tracking-wider">Processing</span>
                </>
              )}
              {uploadState === "valid" && (
                <>
                  <FiCheckCircle className="text-success" size={14} />
                  <span className="text-success font-bold uppercase tracking-wider">Valid</span>
                </>
              )}
              {uploadState === "warning" && (
                <>
                  <FiAlertTriangle className="text-amber-400" size={14} />
                  <span className="text-amber-400 font-bold uppercase tracking-wider">Warning</span>
                </>
              )}
              {uploadState === "invalid" && (
                <>
                  <FiXCircle className="text-red-400" size={14} />
                  <span className="text-red-400 font-bold uppercase tracking-wider">Invalid</span>
                </>
              )}
              {uploadState === "error" && (
                <>
                  <FiAlertCircle className="text-red-500" size={14} />
                  <span className="text-red-500 font-bold uppercase tracking-wider">Error</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* TOP GRID: UPLOADER & QUICK DIAGNOSTIC MONITOR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CSV UPLOAD DROPZONE */}
        <div className="lg:col-span-6 space-y-4">
          <div className="label-mono flex items-center gap-2">
            <FiUploadCloud className="text-primary" /> Dataset Intake Pipeline
          </div>
          
          <div className="soc-card p-8 border-dashed border-divider bg-surface/40 hover:bg-elevated/80 transition-all group relative cursor-pointer overflow-hidden text-center flex flex-col items-center justify-center min-h-[220px]">
            <input 
              type="file" 
              accept=".csv"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              disabled={uploadState === "uploading" || uploadState === "processing"}
            />
            <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary group-hover:scale-110 group-hover:bg-primary/20 transition-all mb-3">
              <FiUploadCloud size={28} />
            </div>
            <h3 className="text-sm font-bold text-text-primary uppercase tracking-wider">
              Drop Forensic CSV Dataset Here
            </h3>
            <p className="text-[0.65rem] text-text-muted mt-1 font-mono uppercase tracking-widest">
              Accepts .csv format // Up to 500MB // Ingest, Profile & Preprocess
            </p>
            <div className="mt-4 font-mono text-[0.65rem] text-primary uppercase tracking-widest px-3 py-1.5 border border-primary/40 rounded bg-primary/5 group-hover:bg-primary group-hover:text-background transition-all">
              Browse Local Files
            </div>

            {uploadState === "uploading" && (
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-divider overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* QUICK DIAGNOSTIC MONITOR */}
        <div className="lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="label-mono flex items-center gap-2">
              <FiCheckCircle className="text-primary" /> Pipeline Diagnostics
            </div>
            {displayedDataset && (
              <span className="text-[0.65rem] font-mono text-text-muted">
                {displayedDataset.id ? `ID: ${displayedDataset.id}` : "Pending Registration"}
              </span>
            )}
          </div>

          <div className="soc-card p-5 space-y-4 bg-surface/60 min-h-[220px]">
            {uploadState === "idle" && !displayedDataset && (
              <div className="flex flex-col items-center justify-center py-10 text-center opacity-40 space-y-2">
                <FiFileText size={32} />
                <p className="font-mono text-xs uppercase tracking-widest">Awaiting file upload for ingestion & profiling scan</p>
              </div>
            )}

            {(uploadState === "uploading" || uploadState === "processing") && (
              <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                <FiRefreshCw className="text-primary animate-spin" size={32} />
                <div>
                  <div className="font-mono text-xs font-bold text-text-primary uppercase tracking-wider">
                    {uploadState === "uploading" ? "Receiving Data Stream..." : "Executing Validation & Profiler Pipeline..."}
                  </div>
                  <div className="font-mono text-[0.65rem] text-text-muted mt-1">{statusMessage}</div>
                </div>
              </div>
            )}

            {displayedReport && (
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-divider">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-primary">Validation Integrity</span>
                  </div>
                  <span className={`px-2 py-0.5 text-[0.65rem] font-mono uppercase font-bold rounded ${
                    displayedReport.status === "VALID" 
                      ? "bg-success/10 text-success border border-success/30" 
                      : displayedReport.status === "WARNING"
                      ? "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                      : "bg-red-500/10 text-red-400 border border-red-500/30"
                  }`}>
                    STATUS: {displayedReport.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  {displayedReport.checks && Object.entries(displayedReport.checks).map(([key, passed]) => {
                    const labels = {
                      fileExtension: "File Extension (.csv)",
                      fileSize: "File Size Bounds",
                      encoding: "UTF-8/ASCII Encoding",
                      csvStructure: "RFC 4180 CSV Syntax",
                      columnCount: "Min Columns (>=2)",
                      duplicateColumns: "Header Uniqueness",
                      rowCount: "Min Rows (>=1)"
                    };
                    return (
                      <div key={key} className="flex items-center justify-between p-2 rounded bg-background/50 border border-divider/40">
                        <span className="text-[0.65rem] text-text-secondary uppercase">{labels[key] || key}</span>
                        {passed ? (
                          <FiCheck className="text-success" size={14} />
                        ) : (
                          <FiX className="text-red-400" size={14} />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {uploadState === "error" && errorMessage && !displayedReport && (
              <div className="p-4 rounded bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs space-y-1">
                <div className="font-bold uppercase flex items-center gap-1.5">
                  <FiAlertCircle /> Pipeline Failure
                </div>
                <div>{errorMessage}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CORE WORKSPACE PANEL: PROFILE, ML PREPROCESSING, DATA PREVIEW & DIAGNOSTICS */}
      {displayedDataset && (
        <div className="soc-card p-6 space-y-6 bg-surface/80 border border-divider animate-fade-in">
          {/* TOP BAR: DATASET IDENTITY & VIEW TABS */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-divider pb-4 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <FiDatabase className="text-primary" size={20} />
                <h2 className="text-lg font-bold text-text-primary">
                  {displayedDataset.originalFilename || displayedDataset.filename}
                </h2>
                <span className={`px-2 py-0.5 text-[0.65rem] font-mono uppercase font-bold rounded ${
                  displayedDataset.validationStatus === "VALID"
                    ? "bg-success/10 text-success border border-success/30"
                    : displayedDataset.validationStatus === "WARNING"
                    ? "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                    : "bg-red-500/10 text-red-400 border border-red-500/30"
                }`}>
                  {displayedDataset.validationStatus}
                </span>
              </div>
              <p className="text-[0.65rem] font-mono text-text-muted mt-1">
                DATASET ID: {displayedDataset.id || "N/A"} // UPLOADED BY: {displayedDataset.uploadedBy || "Analyst"}
              </p>
            </div>

            {/* TAB SELECTORS */}
            <div className="flex items-center gap-1.5 bg-background p-1 rounded border border-divider">
              <button
                onClick={() => setActiveTab("profile")}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider rounded transition-all flex items-center gap-1.5 ${
                  activeTab === "profile" 
                    ? "bg-primary text-background font-bold shadow-sm" 
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <FiBarChart2 size={13} /> Profile (M2)
              </button>
              <button
                onClick={() => setActiveTab("preprocessing")}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider rounded transition-all flex items-center gap-1.5 ${
                  activeTab === "preprocessing" 
                    ? "bg-primary text-background font-bold shadow-sm" 
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <FiCpu size={13} /> ML Preprocessing (M3)
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider rounded transition-all flex items-center gap-1.5 ${
                  activeTab === "preview" 
                    ? "bg-primary text-background font-bold shadow-sm" 
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <FiTable size={13} /> Data Sample
              </button>
              <button
                onClick={() => setActiveTab("diagnostics")}
                className={`px-3 py-1 text-xs font-mono uppercase tracking-wider rounded transition-all flex items-center gap-1.5 ${
                  activeTab === "diagnostics" 
                    ? "bg-primary text-background font-bold shadow-sm" 
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <FiCheckCircle size={13} /> Diagnostics
              </button>
              {selectedDataset && (
                <button 
                  onClick={() => setSelectedDataset(null)}
                  className="px-2 py-1 text-xs font-mono text-text-muted hover:text-red-400 border-l border-divider ml-1"
                  title="Close Active Dataset"
                >
                  <FiX size={14} />
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: DATASET PROFILE (Module 2) */}
          {activeTab === "profile" && (
            <div className="space-y-6 animate-fade-in">
              {loadingProfile ? (
                <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
                  <FiRefreshCw className="text-primary animate-spin" size={32} />
                  <div className="font-mono text-xs uppercase tracking-widest text-text-secondary">
                    Computing statistical distributions & feature profiles...
                  </div>
                </div>
              ) : profileData ? (
                <>
                  {/* OVERVIEW METRICS */}
                  <div>
                    <div className="label-mono flex items-center gap-2 mb-3">
                      <FiActivity size={12} className="text-primary" /> Dataset Profiling Overview
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                      <div className="p-3 rounded bg-background border border-divider/60 space-y-1">
                        <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Total Rows</div>
                        <div className="text-lg font-bold font-mono text-primary">
                          {profileData.summary.totalRows.toLocaleString()}
                        </div>
                      </div>

                      <div className="p-3 rounded bg-background border border-divider/60 space-y-1">
                        <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Total Columns</div>
                        <div className="text-lg font-bold font-mono text-text-primary">
                          {profileData.summary.totalColumns}
                        </div>
                      </div>

                      <div className="p-3 rounded bg-background border border-divider/60 space-y-1">
                        <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Numerical Features</div>
                        <div className="text-lg font-bold font-mono text-cyan-400">
                          {profileData.summary.numericalFeatureCount}
                        </div>
                      </div>

                      <div className="p-3 rounded bg-background border border-divider/60 space-y-1">
                        <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Categorical Features</div>
                        <div className="text-lg font-bold font-mono text-purple-400">
                          {profileData.summary.categoricalFeatureCount}
                        </div>
                      </div>

                      <div className="p-3 rounded bg-background border border-divider/60 space-y-1">
                        <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Missing Values</div>
                        <div className={`text-lg font-bold font-mono ${
                          profileData.summary.totalMissingValues > 0 ? "text-amber-400" : "text-success"
                        }`}>
                          {profileData.summary.totalMissingValues}
                          <span className="text-[0.65rem] font-normal text-text-muted ml-1">
                            ({profileData.summary.overallMissingPercentage}%)
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded bg-background border border-divider/60 space-y-1">
                        <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Duplicate Rows</div>
                        <div className={`text-lg font-bold font-mono ${
                          profileData.summary.duplicateRowCount > 0 ? "text-amber-400" : "text-success"
                        }`}>
                          {profileData.summary.duplicateRowCount}
                          <span className="text-[0.65rem] font-normal text-text-muted ml-1">
                            ({profileData.summary.duplicateRowPercentage}%)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* TARGET & CLASS DISTRIBUTION */}
                  <div className="p-5 rounded-lg bg-background border border-divider/80 space-y-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-divider/60 pb-3">
                      <div className="flex items-center gap-2">
                        <FiTarget className="text-primary" size={16} />
                        <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
                          Supervised Target & Class Imbalance Analysis
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        <label className="text-[0.65rem] font-mono text-text-muted uppercase">Target Column:</label>
                        <select
                          value={selectedTargetColumn || (profileData.target.hasTarget ? profileData.target.targetColumn : "NONE")}
                          onChange={(e) => handleTargetChange(e.target.value)}
                          className="bg-surface border border-divider text-text-primary text-xs font-mono px-3 py-1.5 rounded focus:outline-none focus:border-primary"
                        >
                          <option value="NONE">(None - Unsupervised)</option>
                          {displayedDataset.columnNames?.map((col) => (
                            <option key={col} value={col}>
                              {col} {profileData.features.targetCandidates.includes(col) ? "★" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {profileData.target.hasTarget ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div className="p-3 rounded bg-surface border border-divider/50">
                            <div className="text-[0.6rem] font-mono text-text-muted uppercase">Target Column</div>
                            <div className="text-sm font-bold font-mono text-primary truncate mt-0.5">
                              {profileData.target.targetColumn}
                            </div>
                          </div>

                          <div className="p-3 rounded bg-surface border border-divider/50">
                            <div className="text-[0.6rem] font-mono text-text-muted uppercase">Distinct Classes</div>
                            <div className="text-sm font-bold font-mono text-text-primary mt-0.5">
                              {profileData.target.classCount} classes
                            </div>
                          </div>

                          <div className="p-3 rounded bg-surface border border-divider/50">
                            <div className="text-[0.6rem] font-mono text-text-muted uppercase">Imbalance Ratio</div>
                            <div className={`text-sm font-bold font-mono mt-0.5 ${
                              profileData.target.imbalanceSeverity === "Severe" 
                                ? "text-red-400" 
                                : profileData.target.imbalanceSeverity === "Moderate" 
                                ? "text-amber-400" 
                                : "text-success"
                            }`}>
                              {profileData.target.imbalanceRatioFormatted}
                            </div>
                          </div>

                          <div className="p-3 rounded bg-surface border border-divider/50">
                            <div className="text-[0.6rem] font-mono text-text-muted uppercase">Imbalance Severity</div>
                            <div className="mt-0.5">
                              <span className={`px-2 py-0.5 text-[0.6rem] font-mono font-bold rounded uppercase ${
                                profileData.target.imbalanceSeverity === "Severe"
                                  ? "bg-red-500/10 text-red-400 border border-red-500/30"
                                  : profileData.target.imbalanceSeverity === "Moderate"
                                  ? "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                                  : "bg-success/10 text-success border border-success/30"
                              }`}>
                                {profileData.target.imbalanceSeverity}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Distribution Bar */}
                        <div className="space-y-1.5">
                          <div className="flex justify-between text-[0.65rem] font-mono text-text-muted uppercase">
                            <span>Class Distribution Ratio</span>
                            <span>{profileData.target.majorityClass} vs {profileData.target.minorityClass}</span>
                          </div>
                          <div className="h-4 rounded overflow-hidden flex bg-surface border border-divider">
                            {Object.entries(profileData.target.classPercentages).map(([cls, pct], idx) => {
                              const colors = ["bg-primary", "bg-cyan-500", "bg-purple-500", "bg-amber-500", "bg-red-500", "bg-emerald-500"];
                              const colorClass = colors[idx % colors.length];
                              return (
                                <div 
                                  key={cls}
                                  className={`${colorClass} h-full transition-all`}
                                  style={{ width: `${Math.max(pct, 1)}%` }}
                                  title={`${cls}: ${pct}% (${profileData.target.classCounts[cls]} rows)`}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 pt-2">
                          {Object.entries(profileData.target.classCounts).map(([cls, count]) => {
                            const pct = profileData.target.classPercentages[cls];
                            return (
                              <div key={cls} className="p-2.5 rounded bg-surface border border-divider/50 flex items-center justify-between">
                                <div className="overflow-hidden pr-2">
                                  <div className="text-xs font-bold font-mono text-text-primary truncate">{cls}</div>
                                  <div className="text-[0.6rem] font-mono text-text-muted">{count.toLocaleString()} samples</div>
                                </div>
                                <span className="text-xs font-mono font-bold text-primary">{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="p-6 rounded bg-surface/50 border border-divider text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-amber-400/10 border border-amber-400/30 flex items-center justify-center text-amber-400 mx-auto">
                          <FiInfo size={20} />
                        </div>
                        <h4 className="text-sm font-bold font-mono text-amber-400 uppercase tracking-wide">
                          No Supervised Target Detected
                        </h4>
                        <p className="text-xs text-text-muted font-mono max-w-xl mx-auto leading-relaxed">
                          This dataset does not contain an automatically identifiable target label column. 
                          You can select a target column from the dropdown above to profile classification distribution, 
                          or proceed with unsupervised anomaly detection. Supervised ML will not be trained without an explicitly configured target.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* FEATURE PROFILES MATRIX */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="label-mono flex items-center gap-2">
                        <FiSliders size={12} className="text-primary" /> Feature Profiling Matrix ({profileData.features.profiles.length} attributes)
                      </div>
                      
                      <div className="relative w-full sm:w-64">
                        <FiSearch className="absolute left-2.5 top-2.5 text-text-muted" size={13} />
                        <input
                          type="text"
                          placeholder="Filter feature names..."
                          value={featureSearch}
                          onChange={(e) => setFeatureSearch(e.target.value)}
                          className="w-full bg-background border border-divider text-text-primary text-xs font-mono pl-8 pr-3 py-1.5 rounded focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded border border-divider bg-background max-h-[400px]">
                      <table className="w-full text-left font-mono text-[0.7rem] border-collapse">
                        <thead className="sticky top-0 bg-surface border-b border-divider z-10">
                          <tr className="text-text-muted uppercase tracking-wider">
                            <th className="p-2.5 border-r border-divider">Feature Name</th>
                            <th className="p-2.5 border-r border-divider">Inferred Type</th>
                            <th className="p-2.5 border-r border-divider text-right">Missing</th>
                            <th className="p-2.5 border-r border-divider text-right">Unique</th>
                            <th className="p-2.5 border-r border-divider">Statistical Summary / Distribution</th>
                            <th className="p-2.5 text-center">Tags</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/60">
                          {filteredFeatures.map((feat) => (
                            <tr key={feat.name} className="hover:bg-elevated/40 transition-colors">
                              <td className="p-2.5 border-r border-divider font-bold text-text-primary whitespace-nowrap">
                                {feat.name}
                                {feat.name === selectedTargetColumn && (
                                  <span className="ml-1.5 px-1.5 py-0.2 text-[0.55rem] bg-primary/20 text-primary border border-primary/40 rounded">
                                    TARGET
                                  </span>
                                )}
                              </td>

                              <td className="p-2.5 border-r border-divider whitespace-nowrap">
                                <span className={`px-2 py-0.5 text-[0.6rem] font-bold rounded uppercase ${
                                  feat.inferredType === "integer" || feat.inferredType === "float"
                                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                                    : feat.inferredType === "categorical"
                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                                    : feat.inferredType === "timestamp"
                                    ? "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                                    : feat.inferredType === "identifier"
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                                    : "bg-surface text-text-secondary border border-divider"
                                }`}>
                                  {feat.inferredType}
                                </span>
                              </td>

                              <td className="p-2.5 border-r border-divider text-right whitespace-nowrap">
                                <span className={feat.missingCount > 0 ? "text-amber-400 font-bold" : "text-text-muted"}>
                                  {feat.missingCount} ({feat.missingPercentage}%)
                                </span>
                              </td>

                              <td className="p-2.5 border-r border-divider text-right text-text-secondary whitespace-nowrap">
                                {feat.uniqueCount.toLocaleString()}
                              </td>

                              <td className="p-2.5 border-r border-divider">
                                {feat.numericalStats ? (
                                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-2 gap-y-0.5 text-[0.65rem] text-text-muted">
                                    <div><span className="text-text-secondary">min:</span> {feat.numericalStats.min}</div>
                                    <div><span className="text-text-secondary">max:</span> {feat.numericalStats.max}</div>
                                    <div><span className="text-text-secondary">mean:</span> {feat.numericalStats.mean}</div>
                                    <div><span className="text-text-secondary">med:</span> {feat.numericalStats.median}</div>
                                    <div><span className="text-text-secondary">std:</span> {feat.numericalStats.stdDev}</div>
                                    <div><span className="text-text-secondary">zeros:</span> {feat.numericalStats.zerosPercentage}%</div>
                                  </div>
                                ) : feat.categoricalStats ? (
                                  <div className="text-[0.65rem] text-text-muted truncate max-w-[320px]">
                                    <span className="text-text-secondary">Top:</span>{" "}
                                    <span className="text-text-primary font-bold">{feat.categoricalStats.topValue || "N/A"}</span>{" "}
                                    ({feat.categoricalStats.topFrequency} samples, {feat.categoricalStats.topPercentage}%)
                                  </div>
                                ) : (
                                  <span className="text-text-muted">N/A</span>
                                )}
                              </td>

                              <td className="p-2.5 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                  {feat.isConstant && (
                                    <span className="px-1.5 py-0.5 text-[0.55rem] bg-red-500/10 text-red-400 border border-red-500/30 rounded uppercase font-bold" title="Zero variance column">
                                      CONSTANT
                                    </span>
                                  )}
                                  {feat.isTimestamp && (
                                    <span className="px-1.5 py-0.5 text-[0.55rem] bg-amber-400/10 text-amber-400 border border-amber-400/30 rounded uppercase font-bold">
                                      TIME
                                    </span>
                                  )}
                                  {feat.isIdentifier && (
                                    <span className="px-1.5 py-0.5 text-[0.55rem] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded uppercase font-bold">
                                      ID
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              ) : (
                <div className="p-12 text-center opacity-40 font-mono text-xs uppercase tracking-widest">
                  No statistical profile data available
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ML PREPROCESSING PIPELINE (Module 3) */}
          {activeTab === "preprocessing" && (
            <div className="space-y-6 animate-fade-in">
              {/* PIPELINE CONFIGURATION FORM */}
              <div className="p-5 rounded-lg bg-background border border-divider space-y-5">
                <div className="flex items-center justify-between border-b border-divider/60 pb-3">
                  <div className="flex items-center gap-2">
                    <FiSliders className="text-primary" size={16} />
                    <h3 className="text-sm font-bold text-text-primary uppercase tracking-wide">
                      Pipeline Architecture & Leakage-Proof Hyperparameters
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-success/10 text-success border border-success/30 font-mono text-[0.65rem] uppercase font-bold">
                    <FiShield size={12} /> Leakage-Proof Mode Active
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Train/Test Split */}
                  <div className="p-3 rounded bg-surface border border-divider/50 space-y-2">
                    <label className="text-[0.65rem] font-mono text-text-muted uppercase block">
                      Train / Test Split Ratio
                    </label>
                    <select
                      value={testSize}
                      onChange={(e) => setTestSize(Number(e.target.value))}
                      className="w-full bg-background border border-divider text-text-primary text-xs font-mono p-2 rounded focus:outline-none focus:border-primary"
                    >
                      <option value={0.2}>80% Train / 20% Test (Recommended)</option>
                      <option value={0.3}>70% Train / 30% Test</option>
                      <option value={0.25}>75% Train / 25% Test</option>
                      <option value={0.1}>90% Train / 10% Test</option>
                    </select>
                    <p className="text-[0.6rem] font-mono text-text-muted">
                      Splits dataset prior to transformer fitting to guarantee zero leakage.
                    </p>
                  </div>

                  {/* Numerical Scaling */}
                  <div className="p-3 rounded bg-surface border border-divider/50 space-y-2">
                    <label className="text-[0.65rem] font-mono text-text-muted uppercase block">
                      Numerical Scaler
                    </label>
                    <select
                      value={numericalScaling}
                      onChange={(e) => setNumericalScaling(e.target.value)}
                      className="w-full bg-background border border-divider text-text-primary text-xs font-mono p-2 rounded focus:outline-none focus:border-primary"
                    >
                      <option value="standard">StandardScaler (Z-score: mean=0, std=1)</option>
                      <option value="minmax">MinMaxScaler (Normalized: 0 to 1)</option>
                      <option value="robust">RobustScaler (Median / IQR outlier-proof)</option>
                      <option value="none">None (Raw numericals with imputation)</option>
                    </select>
                    <p className="text-[0.6rem] font-mono text-text-muted">
                      Parameters computed strictly from training split and applied to test.
                    </p>
                  </div>

                  {/* Categorical Encoding */}
                  <div className="p-3 rounded bg-surface border border-divider/50 space-y-2">
                    <label className="text-[0.65rem] font-mono text-text-muted uppercase block">
                      Categorical Encoding
                    </label>
                    <select
                      value={categoricalEncoding}
                      onChange={(e) => setCategoricalEncoding(e.target.value)}
                      className="w-full bg-background border border-divider text-text-primary text-xs font-mono p-2 rounded focus:outline-none focus:border-primary"
                    >
                      <option value="onehot">One-Hot Encoding (Unknown-Protected)</option>
                      <option value="ordinal">Ordinal Encoding (Integer mapped)</option>
                      <option value="frequency">Frequency Encoding (Target rate)</option>
                    </select>
                    <p className="text-[0.6rem] font-mono text-text-muted">
                      Unseen categories during inference safely resolve to 0-vectors without errors.
                    </p>
                  </div>

                  {/* Identifiers & Temporal */}
                  <div className="p-3 rounded bg-surface border border-divider/50 space-y-2">
                    <label className="text-[0.65rem] font-mono text-text-muted uppercase block">
                      Feature Role Policies
                    </label>
                    <div className="space-y-2 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-text-primary">
                        <input
                          type="checkbox"
                          checked={deriveTimestamps}
                          onChange={(e) => setDeriveTimestamps(e.target.checked)}
                          className="rounded border-divider text-primary focus:ring-0"
                        />
                        <span>Derive Temporal Sub-features</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-mono text-text-primary">
                        <input
                          type="checkbox"
                          checked={handleIdentifiers === "exclude"}
                          onChange={(e) => setHandleIdentifiers(e.target.checked ? "exclude" : "retain")}
                          className="rounded border-divider text-primary focus:ring-0"
                        />
                        <span>Exclude High-Leakage IDs</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* RUN BUTTON */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                  <div className="text-[0.65rem] font-mono text-text-muted">
                    Target: <span className="text-primary font-bold">{selectedTargetColumn || "(None - Unsupervised Transformation)"}</span>
                  </div>

                  <button
                    onClick={handleRunPreprocessing}
                    disabled={loadingPreprocessing}
                    className="btn-primary py-2.5 px-6 flex items-center gap-2 text-xs w-full sm:w-auto justify-center"
                  >
                    {loadingPreprocessing ? (
                      <>
                        <FiRefreshCw className="animate-spin" size={14} /> Fitting & Transforming...
                      </>
                    ) : (
                      <>
                        <FiPlay size={14} /> Fit & Transform Pipeline
                      </>
                    )}
                  </button>
                </div>

                {preprocessingError && (
                  <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-400 font-mono text-xs flex items-center gap-2">
                    <FiAlertCircle /> {preprocessingError}
                  </div>
                )}
              </div>

              {/* PREPROCESSING RESULTS & FEATURE MATRIX */}
              {preprocessingResult && (
                <div className="space-y-5 animate-fade-in">
                  {/* ZERO LEAKAGE & MATRIX DIMENSIONS */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded bg-background border border-success/40 space-y-1">
                      <div className="text-[0.6rem] font-mono text-success uppercase tracking-wider flex items-center gap-1">
                        <FiShield size={12} /> Leakage Guarantee
                      </div>
                      <div className="text-xs font-bold font-mono text-text-primary">
                        {preprocessingResult.leakagePreventionAudit.status}
                      </div>
                      <div className="text-[0.6rem] font-mono text-text-muted">
                        {preprocessingResult.leakagePreventionAudit.splitRatio} split
                      </div>
                    </div>

                    <div className="p-3.5 rounded bg-background border border-divider/60 space-y-1">
                      <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Training Matrix (X_train)</div>
                      <div className="text-lg font-bold font-mono text-primary">
                        {preprocessingResult.matrices.trainShape[0]} × {preprocessingResult.matrices.trainShape[1]}
                      </div>
                      <div className="text-[0.6rem] font-mono text-text-muted">
                        Rows × Output Features
                      </div>
                    </div>

                    <div className="p-3.5 rounded bg-background border border-divider/60 space-y-1">
                      <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Testing Matrix (X_test)</div>
                      <div className="text-lg font-bold font-mono text-cyan-400">
                        {preprocessingResult.matrices.testShape[0]} × {preprocessingResult.matrices.testShape[1]}
                      </div>
                      <div className="text-[0.6rem] font-mono text-text-muted">
                        Rows × Output Features
                      </div>
                    </div>

                    <div className="p-3.5 rounded bg-background border border-divider/60 space-y-1">
                      <div className="text-[0.6rem] font-mono text-text-muted uppercase tracking-wider">Excluded Identifiers</div>
                      <div className="text-lg font-bold font-mono text-amber-400">
                        {preprocessingResult.schema.excludedFeatures.length} fields
                      </div>
                      <div className="text-[0.6rem] font-mono text-text-muted truncate">
                        {preprocessingResult.schema.excludedFeatures.join(", ") || "None"}
                      </div>
                    </div>
                  </div>

                  {/* OUTPUT FEATURE SCHEMA TABLE */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="label-mono flex items-center gap-2">
                        <FiCode size={12} className="text-primary" /> Processed Feature Schema ({preprocessingResult.schema.featureCount} output dimensions)
                      </div>

                      <div className="relative w-full sm:w-64">
                        <FiSearch className="absolute left-2.5 top-2.5 text-text-muted" size={13} />
                        <input
                          type="text"
                          placeholder="Filter transformed schema..."
                          value={schemaSearch}
                          onChange={(e) => setSchemaSearch(e.target.value)}
                          className="w-full bg-background border border-divider text-text-primary text-xs font-mono pl-8 pr-3 py-1.5 rounded focus:outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded border border-divider bg-background max-h-[350px]">
                      <table className="w-full text-left font-mono text-[0.7rem] border-collapse">
                        <thead className="sticky top-0 bg-surface border-b border-divider z-10">
                          <tr className="text-text-muted uppercase tracking-wider">
                            <th className="p-2.5 border-r border-divider w-12 text-center">Index</th>
                            <th className="p-2.5 border-r border-divider">Transformed Feature Name</th>
                            <th className="p-2.5 border-r border-divider">Origin Column</th>
                            <th className="p-2.5 border-r border-divider">Transformation Method</th>
                            <th className="p-2.5">Metadata & Parameters</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-divider/60">
                          {filteredSchema.map((meta, idx) => (
                            <tr key={meta.name} className="hover:bg-elevated/40 transition-colors">
                              <td className="p-2.5 border-r border-divider text-center text-text-muted">{idx}</td>
                              <td className="p-2.5 border-r border-divider font-bold text-text-primary whitespace-nowrap">
                                {meta.name}
                              </td>
                              <td className="p-2.5 border-r border-divider text-text-secondary whitespace-nowrap">
                                {meta.originalColumn}
                              </td>
                              <td className="p-2.5 border-r border-divider whitespace-nowrap">
                                <span className={`px-2 py-0.5 text-[0.6rem] font-bold rounded uppercase ${
                                  meta.type === "numerical"
                                    ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                                    : meta.type.startsWith("categorical")
                                    ? "bg-purple-500/10 text-purple-400 border border-purple-500/30"
                                    : "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                                }`}>
                                  {meta.type}
                                </span>
                              </td>
                              <td className="p-2.5 text-text-muted text-[0.65rem]">
                                {meta.scaling ? `Scaler: ${meta.scaling} // Imputed: ${meta.imputedWith}` : ""}
                                {meta.category ? `Category Match: '${meta.category}'` : ""}
                                {meta.metric ? `Derived Metric: ${meta.metric}` : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* SAMPLE TRANSFORMED FEATURE VECTORS */}
                  {preprocessingResult.matrices.sampleTransformedTrain && preprocessingResult.matrices.sampleTransformedTrain.length > 0 && (
                    <div className="p-4 rounded bg-background border border-divider space-y-2">
                      <div className="label-mono flex items-center gap-2">
                        <FiLayers size={12} className="text-primary" /> Processed Numerical Vectors Sample (First 3 Train Rows)
                      </div>
                      <div className="space-y-1.5 font-mono text-[0.65rem] max-h-36 overflow-y-auto p-2 bg-surface rounded border border-divider/40">
                        {preprocessingResult.matrices.sampleTransformedTrain.slice(0, 3).map((vec, vIdx) => (
                          <div key={vIdx} className="text-text-secondary truncate">
                            <span className="text-primary font-bold">Row {vIdx + 1}: </span>
                            [{vec.map(v => typeof v === 'number' ? v.toFixed(3) : v).join(", ")}]
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DATA SAMPLE PREVIEW */}
          {activeTab === "preview" && (
            <div className="space-y-4 animate-fade-in">
              <div className="label-mono flex items-center gap-2">
                <FiTable size={12} className="text-primary" /> Forensic Sample Preview
              </div>
              {displayedReport?.sampleRows && displayedReport.sampleRows.length > 0 ? (
                <div className="overflow-x-auto rounded border border-divider bg-background max-h-[500px]">
                  <table className="w-full text-left font-mono text-[0.7rem] border-collapse">
                    <thead className="sticky top-0 bg-surface border-b border-divider z-10">
                      <tr className="text-text-muted uppercase tracking-wider">
                        <th className="p-2.5 border-r border-divider w-12 text-center">#</th>
                        {displayedDataset.columnNames?.map((col, idx) => (
                          <th key={idx} className="p-2.5 border-r border-divider whitespace-nowrap">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-divider/60">
                      {displayedReport.sampleRows.map((row, rowIdx) => (
                        <tr key={rowIdx} className="hover:bg-elevated/40 transition-colors">
                          <td className="p-2 border-r border-divider text-center text-text-muted">{rowIdx + 1}</td>
                          {displayedDataset.columnNames?.map((col, colIdx) => (
                            <td key={colIdx} className="p-2 border-r border-divider text-text-primary whitespace-nowrap max-w-[200px] truncate">
                              {String(row[col] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-12 text-center opacity-40 font-mono text-xs uppercase tracking-widest">
                  No sample records available for preview
                </div>
              )}
            </div>
          )}

          {/* TAB 4: DIAGNOSTICS & CHECKS */}
          {activeTab === "diagnostics" && (
            <div className="space-y-4 animate-fade-in">
              <div className="label-mono flex items-center gap-2">
                <FiCheckCircle size={12} className="text-primary" /> Comprehensive Diagnostic Report
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded bg-background border border-divider space-y-2">
                  <h4 className="text-xs font-bold font-mono text-text-primary uppercase tracking-wider">Validation Integrity</h4>
                  <div className="space-y-1.5">
                    {displayedReport?.checks && Object.entries(displayedReport.checks).map(([key, passed]) => (
                      <div key={key} className="flex items-center justify-between text-xs font-mono p-2 rounded bg-surface border border-divider/40">
                        <span className="text-text-secondary uppercase">{key}</span>
                        {passed ? <FiCheck className="text-success" /> : <FiX className="text-red-400" />}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-4 rounded bg-background border border-divider space-y-3">
                  <h4 className="text-xs font-bold font-mono text-text-primary uppercase tracking-wider">Diagnostic Log</h4>
                  {displayedReport?.errors && displayedReport.errors.length > 0 ? (
                    <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-300 font-mono text-xs space-y-1">
                      <div className="font-bold text-red-400 uppercase">Errors:</div>
                      <ul className="list-disc list-inside">
                        {displayedReport.errors.map((e, idx) => <li key={idx}>{e}</li>)}
                      </ul>
                    </div>
                  ) : (
                    <div className="p-3 rounded bg-success/10 border border-success/30 text-success font-mono text-xs flex items-center gap-2">
                      <FiCheckCircle /> Zero structural or encoding errors detected.
                    </div>
                  )}

                  {displayedReport?.warnings && displayedReport.warnings.length > 0 && (
                    <div className="p-3 rounded bg-amber-400/10 border border-amber-400/30 text-amber-300 font-mono text-xs space-y-1">
                      <div className="font-bold text-amber-400 uppercase">Warnings:</div>
                      <ul className="list-disc list-inside">
                        {displayedReport.warnings.map((w, idx) => <li key={idx}>{w}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOTTOM SECTION: INGESTED DATASETS REPOSITORY & SYSTEM ARCHIVE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* INGESTED DATASETS TABLE */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="label-mono flex items-center gap-2">
              <FiDatabase className="text-primary" /> Ingested Datasets Repository ({datasets.length})
            </div>
            <button 
              onClick={fetchDatasets} 
              className="font-mono text-[0.65rem] text-primary hover:underline uppercase tracking-widest flex items-center gap-1"
            >
              <FiRefreshCw size={10} /> Refresh
            </button>
          </div>

          <div className="soc-card overflow-hidden bg-surface/50">
            {datasets.length > 0 ? (
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full text-left font-mono text-[0.7rem]">
                  <thead>
                    <tr className="bg-background/80 border-b border-divider text-text-muted uppercase tracking-wider">
                      <th className="p-3">Dataset Name</th>
                      <th className="p-3">Rows</th>
                      <th className="p-3">Cols</th>
                      <th className="p-3">Size</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {datasets.map((ds) => (
                      <tr 
                        key={ds.id} 
                        onClick={() => {
                          setSelectedDataset(ds);
                          setActiveTab("profile");
                        }}
                        className={`hover:bg-elevated cursor-pointer transition-colors ${
                          (selectedDataset?.id === ds.id || currentDataset?.id === ds.id) 
                            ? "bg-elevated/80 border-l-2 border-primary" 
                            : ""
                        }`}
                      >
                        <td className="p-3">
                          <div className="font-bold text-text-primary truncate max-w-[220px]">
                            {ds.originalFilename || ds.filename}
                          </div>
                          <div className="text-[0.6rem] text-text-muted font-mono">{ds.id}</div>
                        </td>
                        <td className="p-3 text-text-secondary">{ds.rowCount?.toLocaleString()}</td>
                        <td className="p-3 text-text-secondary">{ds.columnCount}</td>
                        <td className="p-3 text-text-muted">
                          {(ds.fileSize / 1024).toFixed(1)} KB
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 text-[0.6rem] font-bold rounded ${
                            ds.validationStatus === "VALID"
                              ? "bg-success/10 text-success border border-success/30"
                              : ds.validationStatus === "WARNING"
                              ? "bg-amber-400/10 text-amber-400 border border-amber-400/30"
                              : "bg-red-500/10 text-red-400 border border-red-500/30"
                          }`}>
                            {ds.validationStatus}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={(e) => handleDeleteDataset(ds.id, e)}
                            title="Delete dataset"
                            className="p-1.5 hover:bg-red-500/20 hover:text-red-400 text-text-muted rounded transition-colors"
                          >
                            <FiTrash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-12 text-center opacity-40 space-y-2">
                <FiDatabase size={28} className="mx-auto text-text-muted" />
                <div className="font-mono text-xs uppercase tracking-widest">No ingested datasets stored</div>
                <div className="text-[0.65rem] text-text-muted font-mono">Upload a CSV file to validate and persist metadata</div>
              </div>
            )}
          </div>
        </div>

        {/* SYSTEM ARCHIVE (Preserved) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="label-mono flex items-center gap-2">
              <FiHardDrive className="text-primary" /> System Archive
            </div>
            <button 
              onClick={fetchArchive} 
              className="font-mono text-[0.65rem] text-primary hover:underline uppercase tracking-widest flex items-center gap-1"
            >
              <FiRefreshCw size={10} /> Refresh
            </button>
          </div>

          <div className="soc-card overflow-hidden bg-surface/50">
            <div className="divide-y divide-divider max-h-[400px] overflow-y-auto">
              {archive.length > 0 ? (
                archive.map((file) => (
                  <div key={file.name} className="p-3 flex items-center justify-between hover:bg-elevated transition-colors">
                    <div className="flex items-center gap-2.5 overflow-hidden">
                      <FiFileText className="text-text-muted shrink-0" size={16} />
                      <div className="overflow-hidden">
                        <div className="text-xs font-bold text-text-primary truncate max-w-[150px]">{file.name}</div>
                        <div className="font-mono text-[0.6rem] text-text-muted mt-0.5 uppercase">
                          {file.size}
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleArchiveIngest(file.name)}
                      disabled={archiveLoading}
                      className="btn-primary py-1 px-2.5 text-[0.65rem]"
                    >
                      {activeArchiveFile === file.name ? "Syncing..." : "Ingest"}
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center opacity-30">
                  <div className="font-mono text-[0.65rem] uppercase tracking-widest">Archive library empty</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
