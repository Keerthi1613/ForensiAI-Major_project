import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  FiActivity, FiAlertCircle, FiShield, FiTrendingUp, FiTarget, FiArrowRight, FiCpu 
} from "react-icons/fi";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar, Cell 
} from "recharts";
import { getDashboard } from "../services/api.js";

const MetricCard = ({ title, value, icon: Icon, colorClass, subtitle }) => (
  <div className="soc-card p-4 flex flex-col justify-between group">
    <div className="flex justify-between items-start">
      <div className="text-text-muted group-hover:text-primary transition-colors">
        <Icon size={18} />
      </div>
      <div className={`font-mono text-[0.6rem] font-bold uppercase tracking-wider ${colorClass || 'text-text-muted'}`}>
        Live
      </div>
    </div>
    <div className="mt-6">
      <div className="label-mono mb-1">{title}</div>
      <div className="text-2xl font-bold text-text-primary tracking-tight">
        {typeof value === 'number' ? value.toLocaleString() : value || "0"}
      </div>
      {subtitle && <div className="font-mono text-[0.6rem] mt-1 uppercase text-text-muted tracking-tighter">{subtitle}</div>}
    </div>
  </div>
);

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const data = await getDashboard();
      setStats(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Sync Failure");
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) return (
    <div className="h-[80vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-6 w-6 border border-divider border-t-primary rounded-full animate-spin" />
        <span className="font-mono text-[0.65rem] uppercase tracking-[0.2em] text-text-muted">Establishing Node Connection...</span>
      </div>
    </div>
  );

  const dashboardData = stats || {
    totalLogs: 0,
    suspiciousEvents: 0,
    activeIncidents: 0,
    riskLevel: "Stable",
    lineChartData: [],
    barChartData: [],
    recentAlerts: []
  };

  const isEmpty = dashboardData.totalLogs === 0;

  return (
    <div className="space-y-6 animate-fade-in max-w-[1600px] mx-auto pb-12">
      {/* Header Section */}
      <div className="flex justify-between items-end pb-4 border-b border-divider">
        <div>
          <h1 className="text-xl">Operational Intelligence</h1>
          <p className="text-[0.7rem] text-text-secondary mt-1 font-mono uppercase tracking-widest">Active Signal Monitor // SOC-ALPHA</p>
        </div>
        <div className="flex gap-4">
          {error ? (
            <div className="badge-danger">
               Sync Interrupted
            </div>
          ) : (
            <div className="flex items-center gap-2 font-mono text-[0.6rem] text-success uppercase tracking-wider">
              <span className="h-2 w-2 rounded-full bg-success" />
              Secure Uplink Active
            </div>
          )}
        </div>
      </div>

      {isEmpty && (
        <div className="soc-card p-10 border-dashed flex flex-col items-start space-y-4">
           <div className="max-w-md">
             <h2 className="text-sm font-bold text-text-primary uppercase tracking-tight">Forensic Buffer Empty</h2>
             <p className="text-text-secondary mt-1 text-xs">
               No tactical signals detected in current buffer. Initialize signal ingestion to map the threat landscape.
             </p>
           </div>
           <button 
             onClick={() => navigate('/ingest')}
             className="btn-primary"
           >
             Begin Ingestion
           </button>
        </div>
      )}

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          title="Total Signals" 
          value={dashboardData.totalLogs} 
          icon={FiActivity} 
          subtitle="Buffer Ingest"
        />
        <MetricCard 
          title="Threat Events" 
          value={dashboardData.suspiciousEvents} 
          icon={FiAlertCircle} 
          colorClass="text-danger"
          subtitle="Priority Review"
        />
        <MetricCard 
          title="Risk Index" 
          value={dashboardData.riskLevel} 
          icon={FiTarget} 
          colorClass={dashboardData.riskLevel === 'High' ? 'text-danger' : 'text-success'}
          subtitle="Heuristic Score"
        />
        <MetricCard 
          title="System Core" 
          value="ENCRYPTED" 
          icon={FiShield} 
          colorClass="text-primary"
          subtitle="Node Verification"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Traffic Trend */}
        <div className="lg:col-span-2 soc-card p-6">
          <div className="flex justify-between items-center mb-6">
            <div className="label-mono flex items-center gap-2">
              <FiTrendingUp className="text-primary" size={14} /> Traffic Sequence Map
            </div>
          </div>
          <div className="h-64 w-full">
            {!isEmpty && dashboardData.lineChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboardData.lineChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E2530" vertical={false} />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6B7A8D', fontSize: 10, fontFamily: 'IBM Plex Mono'}} 
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6B7A8D', fontSize: 10, fontFamily: 'IBM Plex Mono'}} 
                  />
                  <Tooltip 
                    contentStyle={{backgroundColor: '#0F1318', border: '1px solid #1E2530', borderRadius: '0px'}}
                    itemStyle={{color: '#00D4FF', fontSize: '11px', fontFamily: 'IBM Plex Mono'}}
                    labelStyle={{color: '#6B7A8D', fontSize: '10px', marginBottom: '4px'}}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#00D4FF" 
                    strokeWidth={1.5}
                    fillOpacity={0.1} 
                    fill="#00D4FF" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-muted space-y-2">
                <div className="font-mono text-[0.6rem] uppercase tracking-widest">Awaiting Telemetry...</div>
              </div>
            )}
          </div>
        </div>

        {/* Vector Distribution */}
        <div className="soc-card p-6">
          <div className="label-mono mb-6">Vector Intelligence</div>
          <div className="h-64 w-full">
            {!isEmpty && dashboardData.barChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dashboardData.barChartData} layout="vertical" margin={{ left: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#6B7A8D', fontSize: 9, fontFamily: 'IBM Plex Mono'}}
                    width={80}
                  />
                  <Bar dataKey="value" radius={[0, 1, 1, 0]} barSize={12}>
                    {dashboardData.barChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#00D4FF' : '#1E2530'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-text-muted">
                 <div className="font-mono text-[0.6rem] uppercase tracking-widest">No Vectors Analyzed</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Critical Events Feed */}
      <div className="soc-card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-divider flex justify-between items-center bg-elevated">
          <div className="label-mono text-text-primary">Operational Briefings</div>
          <button onClick={() => navigate('/incidents')} className="font-mono text-[0.65rem] text-primary hover:underline uppercase tracking-widest">Full Audit</button>
        </div>
        <div className="overflow-x-auto">
          <table className="soc-table">
            <thead>
              <tr>
                <th className="w-10"></th>
                <th>Action</th>
                <th>Source/Dest</th>
                <th>Category</th>
                <th className="text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {dashboardData.recentAlerts.length > 0 ? (
                dashboardData.recentAlerts.map((alert) => (
                  <tr key={alert.id} className="cursor-pointer group" onClick={() => navigate('/incidents')}>
                    <td className="text-center">
                      <div className={`mx-auto h-2 w-2 rounded-sm ${alert.riskLevel === 'High' ? 'bg-danger' : 'bg-primary'}`} />
                    </td>
                    <td className="text-text-primary font-medium">{alert.action}</td>
                    <td className="font-mono text-[0.7rem]">{alert.sourceIp} → {alert.destinationIp}</td>
                    <td className="text-[0.7rem] uppercase tracking-tighter">{alert.category}</td>
                    <td className="text-right font-mono text-[0.7rem] text-text-muted">
                      {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-[0.65rem] font-mono text-text-muted uppercase tracking-widest">Buffer Clear // No Anomalies</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
