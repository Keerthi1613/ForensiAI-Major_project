import React from "react";
import { getRiskBadgeClass, getRiskTone } from "../utils/riskUtils.js";

export default function DashboardCard({ title, value, riskLevel, icon: Icon }) {
  const tone = getRiskTone(riskLevel ?? title);

  const toneStyles =
    tone === "high"
      ? {
          ring: "from-high/35 via-high/15 to-white/5",
          icon: "bg-high/12 border-high/25 text-high",
          glow: "hover:shadow-glowRed"
        }
      : tone === "low"
        ? {
            ring: "from-low/30 via-low/12 to-white/5",
            icon: "bg-low/12 border-low/25 text-low",
            glow: "hover:shadow-glowGreen"
          }
        : {
            ring: "from-primary/35 via-primary/15 to-white/5",
            icon: "bg-primary/12 border-primary/25 text-primary",
            glow: "hover:shadow-glowBlue"
          };

  return (
    <div className="relative rounded-2xl p-[1px] bg-gradient-to-br shadow-soft">
      <div
        className={[
          "relative overflow-hidden rounded-2xl p-5",
          "bg-card/55 backdrop-blur-xl border border-white/10",
          "transition duration-300 ease-out",
          "hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-card/65",
          toneStyles.glow
        ].join(" ")}
      >
        {/* gradient ring */}
        <div
          className={[
            "pointer-events-none absolute -inset-24 opacity-60",
            "bg-[radial-gradient(circle_at_30%_0%,rgba(37,99,235,0.30),transparent_55%)]"
          ].join(" ")}
          aria-hidden
        />
        <div
          className={[
            "pointer-events-none absolute inset-0 opacity-60",
            "bg-gradient-to-br",
            toneStyles.ring
          ].join(" ")}
          aria-hidden
        />

        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs tracking-wide uppercase text-slate-400 font-semibold">
              {title}
            </div>
            <div className="mt-2 text-3xl sm:text-4xl font-extrabold text-slate-100 leading-none">
              {value}
            </div>
            {riskLevel ? (
              <div className="mt-3">
                <span className={getRiskBadgeClass(riskLevel)}>{riskLevel} Risk</span>
              </div>
            ) : null}
          </div>

          <div
            className={[
              "h-12 w-12 rounded-2xl border flex items-center justify-center",
              "shadow-soft",
              toneStyles.icon
            ].join(" ")}
            aria-hidden
          >
            {Icon ? <Icon className="text-lg" /> : <span className="text-lg font-bold">AI</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

