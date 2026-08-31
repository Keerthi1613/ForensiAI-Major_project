import React, { useState, useEffect } from "react";
import { getIncidents } from "../services/api.js";
import { FiFilter, FiSearch, FiTarget, FiAlertCircle } from "react-icons/fi";

export default function IncidentsPage() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchIncidents();
  }, []);

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
                  <tr key={inc.id} className="cursor-pointer group">
                    <td className="text-center">
                       <div className={`mx-auto h-2 w-2 rounded-sm ${inc.riskLevel === 'High' ? 'bg-danger' : 'bg-success'}`} />
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
                      <span className={inc.riskLevel === 'High' ? 'badge-danger' : 'badge-success'}>
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
    </div>
  );
}
