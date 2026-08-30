import React, { useState, useEffect } from "react";
import { 
  FiUploadCloud, FiDatabase, FiFileText, FiCheckCircle, FiZap, FiPlusCircle, FiHardDrive 
} from "react-icons/fi";
import { ingestData, uploadFile, getLocalArchive, ingestFromArchive } from "../services/api.js";

export default function IngestPage() {
  const [archive, setArchive] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [activeFile, setActiveFile] = useState(null);

  useEffect(() => {
    fetchArchive();
  }, []);

  const fetchArchive = async () => {
    try {
      const files = await getLocalArchive();
      setArchive(files || []);
    } catch (err) {
      console.error("Failed to fetch archive", err);
    }
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim());
    
    // Improved parsing for quoted values
    const parseLine = (line) => {
      const result = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') inQuotes = !inQuotes;
        else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = "";
        } else current += char;
      }
      result.push(current.trim());
      return result;
    };

    return lines.slice(1).map(line => {
      const values = parseLine(line);
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = values[i] || "";
      });
      return obj;
    }).filter(obj => Object.keys(obj).length > 1);
  };

  const neuralExtract = (text) => {
    const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;
    const userRegex = /user[:\s]+(\S+)|account[:\s]+(\S+)|uid[:\s]+(\S+)/i;
    
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 10);
    return lines.map(line => {
      const ips = line.match(ipRegex) || [];
      const userMatch = line.match(userRegex);
      return {
        timestamp: new Date().toISOString(),
        sourceIp: ips[0] || "0.0.0.0",
        destinationIp: ips[1] || "127.0.0.1",
        userId: userMatch ? (userMatch[1] || userMatch[2] || userMatch[3]) : "unknown",
        action: "Heuristic Extraction",
        category: "Raw Log Entry",
        raw_data: line
      };
    }).filter(p => p.sourceIp !== "0.0.0.0");
  };

  const [progress, setProgress] = useState(0);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setLoading(true);
    setProgress(0);
    setStatus(`Uplinking ${file.name} to SOC Core...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Direct upload with progress monitoring
      const res = await uploadFile(formData, (percent) => {
        setProgress(percent);
        setStatus(`Uplinking ${file.name} to SOC Core: ${percent}%`);
      });
      
      setStatus(`Uplink successful: ${res.count} signals synchronized.`);
      setProgress(100);
      fetchArchive();
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      if (err.response?.status === 403) {
        setStatus("Error: Session expired or invalid. Please log out and sign in again.");
      } else {
        const errorMsg = err.response?.data?.error || err.message || "Uplink failure";
        setStatus(`Error: ${errorMsg}`);
      }
    } finally {
      setLoading(false);
      e.target.value = null; // Reset input
    }
  };

  const handleArchiveIngest = async (filename) => {
    setLoading(true);
    setActiveFile(filename);
    setStatus(`Streaming ${filename}...`);
    try {
      const res = await ingestFromArchive(filename);
      setStatus(`Indexed ${res.count} signals.`);
      setTimeout(() => setStatus(null), 5000);
    } catch (err) {
      setStatus("Sync failed.");
    } finally {
      setLoading(false);
      setActiveFile(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in pb-20">
      <div className="flex justify-between items-end border-b border-divider pb-4">
        <div>
          <h1 className="text-xl">Data Ingestion</h1>
          <p className="text-[0.7rem] text-text-secondary mt-1 font-mono uppercase tracking-widest">Map Telemetry to Forensic Buffer</p>
        </div>
        <div>
           {status && (
             <div className="space-y-2 text-right">
               <div className="font-mono text-[0.65rem] text-primary uppercase tracking-wider">
                 {status}
               </div>
               {loading && (
                 <div className="w-48 h-1 bg-divider rounded-full overflow-hidden ml-auto">
                   <div 
                     className="h-full bg-primary transition-all duration-300" 
                     style={{ width: `${progress}%` }}
                   />
                 </div>
               )}
             </div>
           )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* EXTERNAL UPLINK */}
        <div className="space-y-4">
          <div className="label-mono flex items-center gap-2">
            <FiPlusCircle className="text-primary" /> External Source
          </div>
          <div className="soc-card p-10 border-dashed border-divider bg-surface/50 hover:bg-elevated transition-all group relative cursor-pointer overflow-hidden">
            <input 
              type="file" 
              accept=".csv"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer z-10"
              disabled={loading}
            />
            <div className="flex flex-col items-start space-y-3">
              <div className="text-primary">
                <FiUploadCloud size={32} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-text-primary uppercase tracking-tight">Drop Capture File</h3>
                <p className="text-[0.65rem] text-text-muted mt-1 font-mono uppercase tracking-widest">CSV format // 5000 line limit</p>
              </div>
              <div className="font-mono text-[0.6rem] text-text-secondary uppercase tracking-widest px-2 py-1 border border-divider">
                Browse Files
              </div>
            </div>
          </div>

          <div className="soc-card p-4 bg-background">
             <div className="label-mono mb-2 flex items-center gap-2">
               <FiZap size={12} /> Protocol_Note
             </div>
             <p className="text-[0.7rem] text-text-secondary leading-relaxed font-mono uppercase tracking-tighter">
               External uploads are processed client-side. Large files ( &gt;5000 lines) should be moved to the System Archive for streaming.
             </p>
          </div>
        </div>

        {/* SYSTEM ARCHIVE */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="label-mono flex items-center gap-2">
              <FiHardDrive className="text-primary" /> System Archive
            </div>
            <button onClick={fetchArchive} className="font-mono text-[0.65rem] text-primary hover:underline uppercase tracking-widest">Refresh</button>
          </div>

          <div className="soc-card overflow-hidden">
            <div className="divide-y divide-divider max-h-[400px] overflow-y-auto">
              {archive.length > 0 ? (
                archive.map((file) => (
                  <div key={file.name} className="p-4 flex items-center justify-between hover:bg-elevated transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="text-text-muted">
                        <FiFileText size={20} />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-text-primary">{file.name}</div>
                        <div className="font-mono text-[0.6rem] text-text-muted mt-0.5 uppercase tracking-tighter">Size: {file.size} // Mod: {new Date(file.modified).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleArchiveIngest(file.name)}
                      disabled={loading}
                      className="btn-primary py-1 px-3"
                    >
                      {activeFile === file.name ? (
                         "Syncing..." 
                      ) : (
                         "Ingest"
                      )}
                    </button>
                  </div>
                ))
              ) : (
                <div className="p-16 text-center opacity-30">
                  <div className="font-mono text-[0.65rem] uppercase tracking-[0.2em]">Archive library empty</div>
                </div>
              )}
            </div>
          </div>

          <div className="soc-card p-4 border-success/20">
             <div className="label-mono text-success mb-1 flex items-center gap-2">
               <FiCheckCircle size={12} /> Optimization
             </div>
             <p className="text-[0.7rem] text-text-secondary font-mono uppercase tracking-tighter">
               Archive files are streamed directly into the SOC core. Preferred for high-fidelity captures.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
