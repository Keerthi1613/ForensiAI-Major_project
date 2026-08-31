import React, { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { getReport } from "../services/api.js";
import { FiFileText, FiDownload, FiZap, FiShield, FiAlertCircle, FiActivity, FiTarget } from "react-icons/fi";

function generateProfessionalPdf(report) {
  try {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const margin = 40;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const drawBackground = () => {
      doc.setFillColor(10, 12, 15);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
    };

    const drawHeaderFooter = (data) => {
      // Header Bar
      doc.setFillColor(0, 212, 255);
      doc.rect(0, 0, pageWidth, 40, "F");
      
      doc.setTextColor(0, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("FORENSIAI // SOC INVESTIGATION REPORT", margin, 25);
      
      // Footer
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(7);
      doc.text(`CLASSIFIED SECURITY DATA | Page ${data.pageNumber}`, pageWidth / 2, pageHeight - 15, { align: "center" });
    };

    // Initial Background
    drawBackground();
    
    let y = 70;

    doc.setTextColor(0, 212, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("01. EXECUTIVE SUMMARY", margin, y); y += 25;

    doc.setTextColor(200, 200, 200);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Identity: ${Date.now()}`, margin, y); y += 15;
    doc.text(`Timestamp: ${new Date(report.generationTime).toLocaleString()}`, margin, y); y += 15;
    doc.text(`Integrity: ${report.riskScore?.toUpperCase()}`, margin, y); y += 15;
    doc.text(`Threat Score: ${report.avgThreatScore}/100`, margin, y); y += 30;

    autoTable(doc, {
      startY: y,
      head: [["Metric", "Value", "Notes"]],
      body: [
        ["Total Signals", report.incidents.toLocaleString(), "Volume of ingested telemetry"],
        ["High Risk Events", report.high.toLocaleString(), "Critical anomalies detected"],
        ["Medium Risk Events", report.medium.toLocaleString(), "Potential reconnaissance signals"],
        ["Low Risk Events", report.low.toLocaleString(), "Standard operational traffic"],
      ],
      theme: 'grid',
      styles: { fillColor: [15, 19, 24], textColor: [200, 200, 200], fontSize: 8, lineColor: [30, 37, 48] },
      headStyles: { fillColor: [0, 212, 255], textColor: [0, 0, 0], fontStyle: "bold" },
      didDrawPage: (data) => {
        // Draw background for every new page
        if (data.pageNumber > 1) drawBackground();
        drawHeaderFooter(data);
      }
    });
    y = doc.lastAutoTable.finalY + 30;

    if (report.recentHighRisk?.length > 0) {
      if (y > pageHeight - 100) { doc.addPage(); y = 70; }
      doc.setTextColor(239, 68, 68);
      doc.setFontSize(11);
      doc.text("02. CRITICAL INCIDENT LOG (TOP 5)", margin, y); y += 15;
      autoTable(doc, {
        startY: y,
        head: [["User", "Resource", "Source IP", "Action", "Score"]],
        body: report.recentHighRisk.map(e => [
          e.userId || "system",
          e.resource || "N/A",
          e.sourceIp,
          e.action,
          e.threatScore
        ]),
        theme: 'grid',
        styles: { fillColor: [15, 19, 24], textColor: [200, 200, 200], fontSize: 7, lineColor: [30, 37, 48] },
        headStyles: { fillColor: [180, 30, 30], textColor: [255, 255, 255] },
        didDrawPage: (data) => {
          // Headers are already handled by the first autoTable's didDrawPage if it spans multiple pages, 
          // but we need them for this one too if it starts on a new page.
          drawHeaderFooter(data);
        }
      });
    }

    doc.save(`ForensiAI_Report_${Date.now()}.pdf`);
  } catch (err) {
    console.error(err);
    alert("Report generation failure.");
  }
}

export default function ReportsPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getReport();
      setReport(data);
    } catch (err) {
      setError("SOC Link failure: Unable to compile report");
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = () => {
    if (!report) return;
    setDownloading(true);
    setTimeout(() => {
      generateProfessionalPdf(report);
      setDownloading(false);
    }, 800);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in pb-12">
      <div className="flex justify-between items-center pb-4 border-b border-divider">
        <div>
          <h1 className="text-xl">Intelligence Reports</h1>
          <p className="text-[0.7rem] text-text-secondary mt-1 font-mono uppercase tracking-widest">Compile and Export Forensic Summaries</p>
        </div>
        <button onClick={fetchReport} disabled={loading} className="btn-primary flex items-center gap-2">
          <FiZap className={loading ? "animate-spin" : ""} size={14} />
          {loading ? "Compiling..." : "Generate Report"}
        </button>
      </div>

      {error && (
        <div className="bg-danger/10 border border-danger/20 p-4 rounded-sm text-danger text-[0.7rem] font-mono uppercase tracking-wider flex items-center gap-2">
          <FiAlertCircle /> {error}
        </div>
      )}

      {report ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total Signals", value: report.incidents, icon: FiActivity, color: "text-primary" },
              { label: "High Risk", value: report.high, icon: FiAlertCircle, color: "text-danger" },
              { label: "Mean Threat Score", value: report.avgThreatScore, icon: FiTarget, color: "text-warning" },
              { label: "System Status", value: report.riskScore, icon: FiShield, color: report.riskScore === "Critical" ? "text-danger" : "text-success" },
            ].map((card) => (
              <div key={card.label} className="soc-card p-4">
                <div className="label-mono mb-2">{card.label}</div>
                <div className="flex items-end justify-between">
                  <div className="text-xl font-bold text-text-primary">{card.value}</div>
                  <card.icon className={`${card.color} opacity-20`} size={20} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.categoryBreakdown?.length > 0 && (
              <div className="soc-card p-4">
                <div className="label-mono mb-4 flex items-center gap-2">
                  <FiTarget className="text-primary" size={12} /> Category Breakdown
                </div>
                <div className="space-y-3">
                  {report.categoryBreakdown.map((cat) => (
                    <div key={cat.name}>
                      <div className="flex justify-between font-mono text-[0.65rem] uppercase mb-1">
                        <span className="text-text-secondary">{cat.name}</span>
                        <span className="text-primary">{cat.count}</span>
                      </div>
                      <div className="h-1 bg-divider rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{ width: `${Math.min((cat.count / report.incidents) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.topSourceIps?.length > 0 && (
              <div className="soc-card p-4">
                <div className="label-mono mb-4 flex items-center gap-2">
                  <FiShield className="text-primary" size={12} /> Top Source IPs
                </div>
                <div className="divide-y divide-divider">
                  {report.topSourceIps.map((ip, i) => (
                    <div key={ip.ip} className="py-2 flex items-center justify-between">
                      <span className="font-mono text-[0.7rem] text-text-primary">{ip.ip}</span>
                      <span className="font-mono text-[0.65rem] text-text-muted uppercase">{ip.count} events</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button
            onClick={downloadPdf}
            disabled={downloading}
            className="w-full btn-outline flex items-center justify-center gap-2 py-3"
          >
            {downloading ? "Formatting..." : <><FiDownload /> Download Intelligence Report</>}
          </button>
        </div>
      ) : (
        <div className="soc-card p-12 flex flex-col items-start space-y-3">
          <div className="text-text-muted">
            <FiFileText size={32} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-text-primary uppercase">No Active Report</h3>
            <p className="text-[0.7rem] text-text-secondary mt-1 font-mono uppercase tracking-widest">Click "Generate Report" to compile current data.</p>
          </div>
        </div>
      )}
    </div>
  );
}
