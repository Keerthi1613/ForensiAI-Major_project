import React from "react";
import { getRiskBadgeClass } from "../utils/riskUtils.js";

export default function ReportCard({ report, onGenerate, onDownload, generating, downloading }) {
  const risk = report?.summary?.risk || report?.risk || "Medium";
  const timeframe = report?.summary?.timeframe || "Last 24 hours";
  const highlights = report?.summary?.highlights || [];

  return (
    <div className="bg-card border border-white/10 rounded-2xl shadow-soft p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-slate-100">Investigation Report</div>
          <div className="text-sm text-slate-400 mt-1">Executive summary and recommended actions</div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className={getRiskBadgeClass(risk)}>{risk} Risk</span>
            <span className="text-xs text-slate-500 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              {timeframe}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold transition border",
              generating
                ? "bg-white/10 text-slate-400 border-white/10 cursor-not-allowed"
                : "bg-primary/15 text-primary border-primary/30 hover:bg-primary/20"
            ].join(" ")}
          >
            {generating ? "Generating…" : "Generate Report"}
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={!report || downloading}
            className={[
              "rounded-xl px-4 py-2 text-sm font-semibold transition border",
              !report || downloading
                ? "bg-white/10 text-slate-400 border-white/10 cursor-not-allowed"
                : "bg-white/5 text-slate-200 border-white/10 hover:bg-white/10"
            ].join(" ")}
          >
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
          <div className="text-sm font-semibold text-slate-200">Summary Preview</div>
          <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">
            {report?.summaryText || "Generate a report to see a preview here."}
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-background/30 p-4">
          <div className="text-sm font-semibold text-slate-200">Key Highlights</div>
          <div className="mt-3 space-y-2">
            {highlights.length ? (
              highlights.map((h, i) => (
                <div
                  key={`${h}_${i}`}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200"
                >
                  {h}
                </div>
              ))
            ) : (
              <div className="text-sm text-slate-500">No highlights yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

