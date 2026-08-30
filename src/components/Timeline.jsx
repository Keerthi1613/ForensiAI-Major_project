import React from "react";
import { FiActivity, FiAlertCircle, FiClock } from "react-icons/fi";

const StatusBadge = ({ status }) => {
  const s = status?.toLowerCase();
  const isDanger = s === "critical" || s === "high";
  const isWarning = s === "medium";
  
  if (isDanger) return <span className="badge-danger">{status}</span>;
  if (isWarning) return <span className="badge-warning">{status}</span>;
  return <span className="badge-success">{status}</span>;
};

export default function Timeline({ events }) {
  if (!events || events.length === 0) {
    return (
      <div className="py-12 text-left text-text-muted font-mono text-[0.7rem] uppercase tracking-widest">
        No chronological signals indexed in current buffer.
      </div>
    );
  }

  const ordered = [...events].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <div className="relative">
      {/* Vertical Line */}
      <div className="absolute left-[7px] top-0 bottom-0 w-px bg-divider" />

      <div className="space-y-6">
        {ordered.map((ev) => {
          const s = ev.status?.toLowerCase();
          const isDanger = s === "critical" || s === "high";
          
          return (
            <div key={ev.id} className="relative pl-8 group">
              {/* Timeline Dot */}
              <div className="absolute left-0 top-1.5 z-10">
                <div className={`h-[14px] w-[14px] rounded-sm border-2 border-background shadow-tactical ${
                  isDanger ? 'bg-danger' : 'bg-primary'
                }`} />
              </div>

              <div className="soc-card p-4 hover:border-text-muted transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="mt-1 text-text-muted shrink-0">
                      {isDanger ? <FiAlertCircle size={16} className="text-danger" /> : <FiActivity size={16} className="text-primary" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-bold text-text-primary tracking-tight">{ev.title}</h3>
                        <StatusBadge status={ev.status} />
                      </div>
                      <p className="text-[0.75rem] text-text-secondary mt-1 leading-relaxed max-w-2xl">{ev.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[0.65rem] font-mono text-text-muted sm:text-right shrink-0 uppercase tracking-tighter">
                    <FiClock size={12} />
                    {new Date(ev.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
