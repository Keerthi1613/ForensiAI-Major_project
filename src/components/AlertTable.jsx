import React from "react";
import { formatTimestamp } from "../utils/formatUtils.js";
import { getRiskBadgeClass, getRiskDotClass } from "../utils/riskUtils.js";

export default function AlertTable({ rows, onRowClick, selectedId }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-card/40 shadow-soft">
      <table className="min-w-full text-sm">
        <thead className="bg-white/5">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-300">Timestamp</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-300">User</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-300">IP Address</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-300">Action</th>
            <th className="px-4 py-3 text-left font-semibold text-slate-300">Risk Level</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => {
              const isSelected = selectedId && row.id === selectedId;
              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row)}
                  role={onRowClick ? "button" : undefined}
                  className={[
                    "border-t border-white/5",
                    onRowClick ? "hover:bg-white/5 cursor-pointer" : "",
                    isSelected ? "bg-primary/10" : ""
                  ].join(" ")}
                >
                  <td className="px-4 py-3 text-slate-200 whitespace-nowrap">
                    {formatTimestamp(row.timestamp)}
                  </td>
                  <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{row.user}</td>
                  <td className="px-4 py-3 text-slate-200 whitespace-nowrap">{row.sourceIp}</td>
                  <td className="px-4 py-3 text-slate-200">{row.action}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={getRiskBadgeClass(row.riskLevel)}>
                      <span className={`inline-block h-1.5 w-1.5 rounded-full ${getRiskDotClass(row.riskLevel)} mr-2`} />
                      {row.riskLevel}
                    </span>
                  </td>
                </tr>
              );
            })
          ) : (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                No matching incidents.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

