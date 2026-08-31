import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080/api";

const api = axios.create({
  baseURL: API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("forensiai_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const login = (credentials) => api.post("/login", credentials).then(r => r.data);
export const register = (data) => api.post("/register", data).then(r => r.data);

export const getDashboard = () => api.get("/dashboard").then(r => r.data);
export const getIncidents = () => api.get("/incidents").then(r => r.data);
export const getNotifications = () => api.get("/notifications").then(r => r.data);
export const getTimeline = () => api.get("/timeline").then(r => r.data);
export const getReport = () => api.get("/report", { timeout: 0 }).then(r => r.data);
export const chatWithAI = (message) => api.post("/chat", { message }).then(r => r.data);

// Ingestion Services
export const ingestData = (data) => api.post("/ingest", { data }).then(r => r.data);
export const uploadFile = (formData, onProgress) => api.post("/upload", formData, {
  timeout: 0, // Disable timeout for large forensic uplinks
  onUploadProgress: (progressEvent) => {
    if (onProgress) {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      onProgress(percentCompleted);
    }
  }
}).then(r => r.data);
export const getLocalArchive = () => api.get("/archive").then(r => r.data);
export const ingestFromArchive = (filename) => api.post("/archive/ingest", { filename }).then(r => r.data);

// Module 1: Dataset Ingestion & Validation Services
export const uploadDataset = (formData, onProgress) => api.post("/datasets/upload", formData, {
  timeout: 0,
  onUploadProgress: (progressEvent) => {
    if (onProgress && progressEvent.total) {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      onProgress(percentCompleted);
    }
  }
}).then(r => r.data);

export const getDatasets = () => api.get("/datasets").then(r => r.data);
export const getDatasetById = (id) => api.get(`/datasets/${id}`).then(r => r.data);
export const deleteDataset = (id) => api.delete(`/datasets/${id}`).then(r => r.data);

export const getDatasetProfile = (id, targetColumn) => {
  const url = targetColumn 
    ? `/datasets/${id}/profile?targetColumn=${encodeURIComponent(targetColumn)}` 
    : `/datasets/${id}/profile`;
  return api.get(url).then(r => r.data);
};

export const updateDatasetTarget = (id, targetColumn) => 
  api.post(`/datasets/${id}/profile`, { targetColumn }).then(r => r.data);

// Module 3: ML Preprocessing Pipeline Services
export const preprocessDataset = (id, options = {}) => 
  api.post(`/datasets/${id}/preprocess`, options).then(r => r.data);

export const getPreprocessingSchema = (id, targetColumn) => {
  const url = targetColumn 
    ? `/datasets/${id}/preprocess/schema?targetColumn=${encodeURIComponent(targetColumn)}` 
    : `/datasets/${id}/preprocess/schema`;
  return api.get(url).then(r => r.data);
};

export default api;