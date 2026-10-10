import React, { useState, useEffect } from "react";
import { getIncidents, getIncidentExplanation } from "../services/api.js";
import { FiFilter, FiSearch, FiTarget, FiAlertCircle, FiX, FiActivity, FiShield, FiCpu, FiInfo } from "react-icons/fi";

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  useEffect(() => {
    fetchIncidents();
  }, []);

  useEffect(() => {
    if (selectedIncident) {
      setLoadingExplanation(true);
      setExplanation(null);
      getIncidentExplanation(selectedIncident.id)
        .then((data) => {
          setExplanation(data);
        })
        .catch((err) => {
          console.error("Failed to fetch SHAP explanation:", err);
        })
        .finally(() => {
          setLoadingExplanation(false);
        });
    }
  }, [selectedIncident]);

  const fetchIncidents = async () => {
    try {
      const data = await getIncidents();
      setIncidents(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const filtered = incidents.filter(i => 
    (i.action || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.sourceIp || "").includes(search) ||
    (i.userId || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.category || "").toLowerCase().includes(search.toLowerCase())
  );

  const parseRawData = (rawStr) => {
    if (!rawStr) return {};
    try {
      return typeof rawStr === "string" ? JSON.parse(rawStr) : rawStr;
    } catch (e) {
      return {};
    }
  };

  const getIncidentMetadata = (inc) => {
    const raw = parseRawData(inc.raw_data);
    const predLabel = raw.mlPrediction || (explanation && explanation.prediction_label) || (inc.riskLevel === 'High' ? 'ATTACK' : 'BENIGN');
    const prob = raw.mlAttackProbability !== undefined 
      ? (raw.mlAttackProbability * 100).toFixed(1) + '%' 
      : (explanation && explanation.attack_probability !== undefined 
        ? (explanation.attack_probability * 100).toFixed(1) + '%' 
        : (inc.threatScore !== undefined ? inc.threatScore + '%' : 'N/A'));
    const anomaly = raw.mlAnomalyLabel || (explanation && explanation.anomaly_label) || (raw.mlAnomaly ? 'YES' : 'NO');
    const anomalyScore = raw.mlAnomalyScore !== undefined 
      ? raw.mlAnomalyScore.toFixed(4) 
      : (explanation && explanation.anomaly_score !== undefined ? explanation.anomaly_score.toFixed(4) : null);
    const model = raw.mlModel || (explanation && explanation.model) || 'Combined XGBoost + Isolation Forest';

    const rawAttackType = raw.mlAttackType || (explanation && explanation.attack_type);
    let attackType = null;
    if (predLabel === 'ATTACK') {
      if (rawAttackType && rawAttackType !== 'BENIGN') {
        attackType = rawAttackType;
      } else if (inc.category && inc.category !== 'General Traffic' && inc.category !== 'Anomaly Traffic' && inc.category !== 'Unclassified') {
        attackType = inc.category;
      } else {
        attackType = 'Unknown Attack';
      }
    }

    const dstPort = inc.destinationPort || (explanation && explanation.destinationPort) || raw.destinationPort || raw.dstPort || raw['Dst Port'] || raw['dst_port'] || raw['Destination Port'] || raw.port || raw.Port || null;
    let protocol = inc.protocol || (explanation && explanation.protocol) || raw.protocol || raw['Protocol'] || raw.proto || null;
    if (protocol === "6" || protocol === 6) protocol = "TCP (6)";
    else if (protocol === "17" || protocol === 17) protocol = "UDP (17)";
    else if (protocol === "1" || protocol === 1) protocol = "ICMP (1)";

    return { raw, predLabel, prob, anomaly, anomalyScore, model, dstPort, protocol, attackType };
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-xl">Threat Events</h1>
          <p className="text-[0.7rem] text-text-secondary mt-1 font-mono uppercase tracking-widest">Forensic Signal Audit Log</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative group min-w-[280px]">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted group-focus-within:text-primary transition-colors" size={14} />
            <input 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by IP, User, Action..."
              className="input-soc w-full pl-9 py-1.5 text-xs"
            />
          </div>
          <button className="p-2 border border-divider rounded-sm text-text-muted hover:text-text-primary transition-all">
            <FiFilter size={16} />
          </button>
        </div>
      </div>

      <div className="soc-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="soc-table">
            <thead>
              <tr>
                <th className="w-10">PRI</th>
                <th>Source Entity</th>
                <th>User Context</th>
                <th>Target Resource</th>
                <th>Threat Vector</th>
                <th>Risk Level</th>
                <th className="text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="h-5 w-5 border border-divider border-t-primary rounded-full animate-spin" />
                      <span className="font-mono text-[0.65rem] text-text-muted uppercase tracking-widest">Reading forensic buffer...</span>
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-8 py-20 text-center text-text-muted font-mono text-[0.65rem] uppercase tracking-widest">
                    No matching events detected in buffer
                  </td>
                </tr>
              ) : (
                filtered.map((inc) => (
                  <tr 
                    key={inc.id} 
                    onClick={() => setSelectedIncident(inc)}
                    className="cursor-pointer group hover:bg-elevated/50 transition-colors"
                  >
                    <td className="text-center">
                       <div className={`mx-auto h-2 w-2 rounded-sm ${inc.riskLevel === 'High' ? 'bg-danger' : inc.riskLevel === 'Medium' ? 'bg-warning' : 'bg-success'}`} />
                    </td>
                    <td>
                      <div className="flex flex-col">
                        <span className="text-text-primary font-mono text-[0.75rem]">{inc.sourceIp}</span>
                        <span className="text-[0.6rem] text-text-muted uppercase tracking-tighter">Dest: {inc.destinationIp}</span>
                      </div>
                    </td>
                    <td className="font-mono text-[0.7rem]">{inc.userId || 'system'}</td>
                    <td className="font-mono text-[0.7rem] text-text-secondary">{inc.resource || 'N/A'}</td>
                    <td>
                      <div className="text-[0.75rem] font-bold text-text-primary">{inc.action}</div>
                      <div className="text-[0.65rem] text-text-muted uppercase tracking-tight">{inc.category}</div>
                    </td>
                    <td>
                      <span className={inc.riskLevel === 'High' ? 'badge-danger' : inc.riskLevel === 'Medium' ? 'badge-warning' : 'badge-success'}>
                        {inc.riskLevel}
                      </span>
                    </td>
                    <td className="text-right">
                      <div className="font-mono text-[0.7rem] text-text-primary">{new Date(inc.timestamp).toLocaleDateString()}</div>
                      <div className="font-mono text-[0.6rem] text-text-muted mt-0.5 uppercase">
                        {new Date(inc.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Incident Forensics Detail Modal with SHAP Explainability */}
      {selectedIncident && (() => {
        const meta = getIncidentMetadata(selectedIncident);
        const topFeatures = explanation?.top_features || [];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
            <div className="soc-card max-w-2xl w-full p-6 space-y-6 border border-divider shadow-2xl relative my-8">
              <div className="flex justify-between items-start border-b border-divider pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-mono text-primary uppercase tracking-widest">
                    <FiCpu /> ML Signal Forensic Inspection
                  </div>
                  <h3 className="text-lg font-bold text-text-primary mt-1">Incident #{selectedIncident.id}</h3>
                </div>
                <button 
                  onClick={() => setSelectedIncident(null)}
                  className="p-1.5 rounded-sm hover:bg-elevated text-text-muted hover:text-text-primary transition-colors"
                >
                  <FiX size={18} />
                </button>
              </div>

              {/* Core Detection & Anomaly Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                <div className="bg-elevated p-3 rounded-sm border border-divider">
                  <div className="text-[0.65rem] text-text-muted uppercase tracking-wider mb-1">Detection</div>
                  <div className={`font-bold text-sm ${meta.predLabel === 'ATTACK' ? 'text-danger' : 'text-success'}`}>
                    {meta.predLabel}
                  </div>
                </div>

                <div className="bg-elevated p-3 rounded-sm border border-divider">
                  <div className="text-[0.65rem] text-text-muted uppercase tracking-wider mb-1">Attack Probability</div>
                  <div className="font-bold text-sm text-text-primary">{meta.prob}</div>
                </div>

                <div className="bg-elevated p-3 rounded-sm border border-divider">
                  <div className="text-[0.65rem] text-text-muted uppercase tracking-wider mb-1">Anomaly Signal</div>
                  <div className="flex items-center gap-1.5">
                    <span className={`font-bold text-sm ${meta.anomaly === 'YES' ? 'text-warning' : 'text-text-muted'}`}>
                      {meta.anomaly}
                    </span>
                    {meta.anomalyScore && (
                      <span className="text-[0.6rem] text-text-muted">
                        ({meta.anomalyScore})
                      </span>
                    )}
                  </div>
                </div>

                <div className="bg-elevated p-3 rounded-sm border border-divider">
                  <div className="text-[0.65rem] text-text-muted uppercase tracking-wider mb-1">Risk Level</div>
                  <div className={`font-bold text-sm ${selectedIncident.riskLevel === 'High' ? 'text-danger' : selectedIncident.riskLevel === 'Medium' ? 'text-warning' : 'text-success'}`}>
                    {selectedIncident.riskLevel}
                  </div>
                </div>
              </div>

              {/* Network Metadata & Model Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono bg-elevated/40 p-3.5 rounded-sm border border-divider/60">
                {meta.predLabel === 'ATTACK' && (
                  <div className="flex justify-between items-center py-1.5 px-3 mb-1 border border-danger/40 bg-danger/10 rounded-sm col-span-1 md:col-span-2">
                    <span className="text-danger font-bold uppercase tracking-wider text-[0.7rem]">Attack Subtype</span>
                    <span className="text-danger font-bold text-xs">{meta.attackType || 'Unknown Attack'}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-divider/40">
                  <span className="text-text-muted uppercase">Model Name</span>
                  <span className="text-primary font-bold text-right">{meta.model}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-divider/40">
                  <span className="text-text-muted uppercase">Threat Vector</span>
                  <span className="text-text-primary text-right">{selectedIncident.action}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-divider/40">
                  <span className="text-text-muted uppercase">Source IP</span>
                  <span className="text-text-primary">{selectedIncident.sourceIp}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-divider/40">
                  <span className="text-text-muted uppercase">Destination IP</span>
                  <span className="text-text-primary">{selectedIncident.destinationIp}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-text-muted uppercase">Destination Port</span>
                  <span className="text-text-primary font-bold">{meta.dstPort !== null ? meta.dstPort : 'N/A'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-text-muted uppercase">Protocol</span>
                  <span className="text-text-primary font-bold">{meta.protocol !== null ? meta.protocol : 'N/A'}</span>
                </div>
              </div>

              {/* WHY WAS THIS DETECTED? (SHAP Explainability Section) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-divider pb-2">
                  <div className="flex items-center gap-2 text-xs font-bold font-mono text-text-primary uppercase tracking-wider">
                    <FiTarget className="text-primary" size={15} /> WHY WAS THIS DETECTED?
                  </div>
                  <span className="text-[0.65rem] font-mono text-text-muted uppercase tracking-tight">Top 5 SHAP Feature Contributions</span>
                </div>

                {loadingExplanation ? (
                  <div className="bg-elevated/30 p-6 rounded-sm border border-divider text-center flex flex-col items-center gap-2">
                    <div className="h-4 w-4 border border-divider border-t-primary rounded-full animate-spin" />
                    <span className="font-mono text-[0.65rem] text-text-muted uppercase tracking-widest">
                      Computing SHAP feature contributions...
                    </span>
                  </div>
                ) : topFeatures.length > 0 ? (
                  <div className="space-y-2">
                    {topFeatures.map((feat, idx) => (
                      <div key={idx} className="bg-elevated p-2.5 rounded-sm border border-divider flex items-center justify-between gap-4 font-mono text-xs">
                        <div className="flex flex-col min-w-0">
                          <span className="font-bold text-text-primary truncate">{feat.feature}</span>
                          <span className="text-[0.65rem] text-text-muted">Actual Value: <span className="text-text-secondary">{feat.value}</span></span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[0.65rem] px-2 py-0.5 rounded-xs font-bold uppercase ${feat.shap_value > 0 ? 'bg-danger/20 text-danger border border-danger/40' : 'bg-success/20 text-success border border-success/40'}`}>
                            {feat.shap_value > 0 ? `+${feat.shap_value.toFixed(4)}` : feat.shap_value.toFixed(4)} ({feat.direction})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-elevated/30 p-4 rounded-sm border border-divider text-center text-text-muted font-mono text-[0.65rem] uppercase tracking-widest">
                    SHAP feature breakdown unavailable for this signal
                  </div>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button 
                  onClick={() => setSelectedIncident(null)}
                  className="btn-outline text-xs px-4 py-1.5"
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
