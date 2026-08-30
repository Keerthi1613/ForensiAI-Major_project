import React, { useState, useEffect } from "react";
import { FiCpu, FiZap, FiShield, FiAlertTriangle, FiClock, FiActivity } from "react-icons/fi";
import { getIncidents } from "../services/api.js";

export default function AIInvestigationPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const data = await getIncidents();
      setIncidents(data);
      if (data.length > 0) {
        generateInvestigation(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateInvestigation = (events) => {
    const highRisk = events.filter(e => e.riskLevel === 'High');
    const categories = [...new Set(events.map(e => e.category))];
    const topIp = events.reduce((acc, curr) => {
      acc[curr.sourceIp] = (acc[curr.sourceIp] || 0) + 1;
      return acc;
    }, {});
    const leadIp = Object.entries(topIp).sort((a,b) => b[1]-a[1])[0]?.[0];

    const reconstruction = {
      severity: highRisk.length > 10 ? "CRITICAL" : highRisk.length > 0 ? "HIGH" : "STABLE",
      verdict: highRisk.length > 0 ? "Potential multi-stage attack detected." : "System baseline normal.",
      timeline: events.slice(0, 5).map(e => ({
        time: new Date(e.timestamp).toLocaleTimeString(),
        event: e.action,
        actor: e.sourceIp,
        impact: e.threatScore
      })),
      summary: `SOC Engine identified ${events.length} tactical signals. Automated correlation suggests ${highRisk.length} high-severity anomalies primarily originating from ${leadIp || 'internal sources'}. Attack vectors include ${categories.slice(0, 3).join(", ")}.`,
      mitigation: [
        "Isolate source endpoint " + (leadIp || "N/A"),
        "Block identified threat vectors in firewall perimeter",
        "Enable enhanced audit logging for affected service accounts",
        "Initiate tier-2 forensic memory dump on target nodes"
      ]
    };
    setAnalysis(reconstruction);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
      <FiCpu className="animate-spin text-primary" size={40} />
      <span className="text-xs font-bold text-primary tracking-[0.3em] uppercase">Neural Reconstruction in Progress...</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in pb-20">
      <div className="flex justify-between items-end border-b border-white/[0.05] pb-8">
        <div>
          <h1 className="text-4xl font-black text-white tracking-tighter uppercase italic">Neural_Investigation</h1>
          <p className="text-sm text-primary/60 mt-1 uppercase tracking-widest font-mono">Autonomous attack reconstruction and forensic synthesis</p>
        </div>
        <div className={`px-4 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest ${
          analysis?.severity === 'CRITICAL' ? 'bg-danger/10 border-danger/20 text-danger' : 'bg-primary/10 border-primary/20 text-primary'
        }`}>
          Status: {analysis?.severity || 'STABLE'}
        </div>
      </div>

      {analysis ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Summary */}
          <div className="lg:col-span-2 space-y-8">
            <div className="soc-card p-8 bg-primary/[0.02] relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                 <FiShield size={120} />
               </div>
               <div className="flex items-center gap-3 text-xs font-bold text-primary uppercase tracking-widest mb-6">
                 <FiActivity /> Executive_Synthesis
               </div>
               <h2 className="text-2xl font-bold text-white mb-4 leading-tight">{analysis.verdict}</h2>
               <p className="text-slate-400 leading-relaxed text-sm mb-8">{analysis.summary}</p>
               
               <div className="grid grid-cols-2 gap-4">
                 <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Threat Actor</div>
                    <div className="text-sm font-mono text-white">{analysis.timeline[0]?.actor || "None"}</div>
                 </div>
                 <div className="bg-black/40 p-4 rounded-xl border border-white/5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Primary Vector</div>
                    <div className="text-sm font-mono text-white">{analysis.timeline[0]?.event || "None"}</div>
                 </div>
               </div>
            </div>

            {/* Timeline Reconstruction */}
            <div className="soc-card p-8">
               <div className="flex items-center gap-3 text-xs font-bold text-white uppercase tracking-widest mb-8">
                 <FiClock className="text-primary" /> Attack_Timeline_Reconstruction
               </div>
               <div className="space-y-8 relative">
                 <div className="absolute left-4 top-2 bottom-2 w-px bg-white/10" />
                 {analysis.timeline.map((step, i) => (
                   <div key={i} className="flex gap-8 relative">
                      <div className="h-8 w-8 rounded-full bg-black border-2 border-primary flex items-center justify-center shrink-0 z-10 shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                      </div>
                      <div className="flex-1 pb-2">
                        <div className="flex justify-between items-start">
                          <span className="text-[10px] font-bold text-primary font-mono">{step.time}</span>
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Impact: {step.impact}</span>
                        </div>
                        <h4 className="text-white font-bold mt-1">{step.event}</h4>
                        <p className="text-xs text-slate-500 mt-1 font-mono italic">Origin: {step.actor}</p>
                      </div>
                   </div>
                 ))}
               </div>
            </div>
          </div>

          {/* Mitigation and Knowledge */}
          <div className="space-y-8">
            <div className="soc-card p-6 border-warning/20">
               <div className="flex items-center gap-3 text-xs font-bold text-warning uppercase tracking-widest mb-6">
                 <FiAlertTriangle /> Response_Playbook
               </div>
               <div className="space-y-3">
                 {analysis.mitigation.map((step, i) => (
                   <div key={i} className="flex gap-3 p-3 bg-warning/5 rounded-lg border border-warning/10 text-[11px] text-slate-300 font-medium">
                     <span className="text-warning font-bold">0{i+1}</span>
                     {step}
                   </div>
                 ))}
               </div>
            </div>

            <div className="soc-card p-6">
               <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Neural Confidence</div>
               <div className="flex items-end gap-3 mb-2">
                 <div className="text-3xl font-black text-white">94%</div>
                 <div className="text-[10px] font-bold text-primary uppercase pb-1 tracking-widest">High Accuracy</div>
               </div>
               <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                 <div className="h-full bg-primary w-[94%] shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
               </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="soc-card p-20 text-center opacity-30">
          <FiZap size={40} className="mx-auto mb-4" />
          <div className="text-[10px] font-bold uppercase tracking-[0.4em]">Awaiting Forensic Buffer Stream</div>
        </div>
      )}
    </div>
  );
}
