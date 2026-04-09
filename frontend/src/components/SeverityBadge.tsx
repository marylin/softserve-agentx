import type { SeverityLevel } from "../types/incident";

const config: Record<SeverityLevel, { label: string; classes: string }> = {
  P1: {
    label: "Critical",
    classes:
      "border-red-500/50 bg-red-500/10 text-red-400",
  },
  P2: {
    label: "High",
    classes:
      "border-orange-500/50 bg-orange-500/10 text-orange-400",
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
      className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${classes}`}
    >
      {level} {label}
    </span>
  );
}
