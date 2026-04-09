import type { SeverityLevel } from "../types/incident";

const SLA_TOOLTIPS: Record<string, string> = {
  P1: "SLA: 15 min response",
  P2: "SLA: 1 hour response",
  P3: "SLA: 4 hour response",
  P4: "SLA: 24 hour response",
};

const config: Record<SeverityLevel, { label: string; classes: string }> = {
  P1: {
    label: "Critical",
    classes:
      "border-red-500/50 bg-red-500/10 text-red-400",
  },
  P2: {
    label: "High",
    classes:
      "border-amber-500/50 bg-amber-500/10 text-amber-400",
  },
  P3: {
    label: "Medium",
    classes:
      "border-yellow-500/50 bg-yellow-500/10 text-yellow-400",
  },
  P4: {
    label: "Low",
    classes:
      "border-gray-500/50 bg-gray-500/10 text-gray-400",
  },
};

export default function SeverityBadge({ level }: { level: SeverityLevel }) {
  const { label, classes } = config[level];
  return (
    <span
      title={SLA_TOOLTIPS[level] || ""}
      className={`animate-badge inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {level} {label}
    </span>
  );
}
