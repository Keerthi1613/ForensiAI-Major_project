export const RISK_LEVELS = ["High", "Medium", "Low"];

export function getRiskTone(riskLevel) {
  const level = String(riskLevel ?? "").toLowerCase();
  if (level === "high") return "high";
  if (level === "medium") return "medium";
  if (level === "low") return "low";
  // Default to medium for unknown values.
  return "medium";
}

export function getRiskBadgeClass(riskLevel) {
  const tone = getRiskTone(riskLevel);
  const base = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";
  if (tone === "high") return `${base} bg-high/20 text-high border border-high/30`;
  if (tone === "low") return `${base} bg-low/20 text-low border border-low/30`;
  return `${base} bg-medium/20 text-medium border border-medium/30`;
}

export function getRiskDotClass(riskLevel) {
  const tone = getRiskTone(riskLevel);
  if (tone === "high") return "bg-high";
  if (tone === "low") return "bg-low";
  return "bg-medium";
}

