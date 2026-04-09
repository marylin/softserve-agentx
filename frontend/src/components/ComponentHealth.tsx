import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { listIncidents } from "../lib/api";

const COMPONENTS = [
  "Cart & Checkout",
  "Payment Processing",
  "Product Catalog & Search",
  "Order Management",
  "Customer Accounts & Auth",
  "Inventory & Stock",
  "Fulfillment & Shipping",
  "Promotions & Discounts",
  "Admin Dashboard",
  "Storefront (General)",
  "API / Integrations",
];

type HealthStatus = "healthy" | "degraded" | "impacted" | "critical";

interface ComponentData {
  name: string;
  status: HealthStatus;
  openCount: number;
  lastIncidentTime: string | null;
}

function extractAffectedArea(description: string): string | null {
  const match = description.match(/^\[Affected Area: (.+?)\]/);
  return match ? match[1] : null;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

const STATUS_CONFIG: Record<
  HealthStatus,
  { label: string; textColor: string; dotColor: string }
> = {
  healthy: {
    label: "Healthy",
    textColor: "text-green-400",
    dotColor: "bg-green-400",
  },
  degraded: {
    label: "Degraded",
    textColor: "text-yellow-400",
    dotColor: "bg-yellow-400",
  },
  impacted: {
    label: "Impacted",
    textColor: "text-amber-400",
    dotColor: "bg-amber-400",
  },
  critical: {
    label: "Critical",
    textColor: "text-red-400",
    dotColor: "bg-red-400",
  },
};

interface Props {
  onSelectComponent?: (area: string) => void;
}

export default function ComponentHealth({ onSelectComponent }: Props) {
  const [components, setComponents] = useState<ComponentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [unmappedCount, setUnmappedCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        const incidents = await listIncidents();

        const componentMap: Record<
          string,
          {
            openCount: number;
            lastTime: string | null;
            maxSeverity: string | null;
          }
        > = {};

        for (const comp of COMPONENTS) {
          componentMap[comp] = {
            openCount: 0,
            lastTime: null,
            maxSeverity: null,
          };
        }

        for (const inc of incidents) {
          const area = extractAffectedArea(inc.description || "");
          if (!area || !componentMap[area]) continue;

          const entry = componentMap[area];

          // Track last incident time
          if (!entry.lastTime || inc.created_at > entry.lastTime) {
            entry.lastTime = inc.created_at;
          }

          // Only count open incidents (not resolved, not failed)
          const isOpen = inc.status !== "resolved" && inc.status !== "failed";
          if (!isOpen) continue;

          entry.openCount++;

          // Track max severity for open incidents
          const sevPriority: Record<string, number> = {
            P1: 4,
            P2: 3,
            P3: 2,
            P4: 1,
          };
          const sev = inc.severity;
          if (sev) {
            const currentMax = entry.maxSeverity
              ? sevPriority[entry.maxSeverity] || 0
              : 0;
            if ((sevPriority[sev] || 0) > currentMax) {
              entry.maxSeverity = sev;
            }
          }
        }

        const unmappedCount = incidents.filter((inc: { description?: string }) => {
          const desc = inc.description || "";
          return !desc.startsWith("[Affected Area: ");
        }).length;

        const result: ComponentData[] = COMPONENTS.map((name) => {
          const entry = componentMap[name];
          let status: HealthStatus = "healthy";
          if (entry.openCount > 0) {
            if (entry.maxSeverity === "P1") status = "critical";
            else if (entry.maxSeverity === "P2") status = "impacted";
            else status = "degraded";
          }
          return {
            name,
            status,
            openCount: entry.openCount,
            lastIncidentTime: entry.lastTime,
          };
        });

        if (active) {
          setComponents(result);
          setUnmappedCount(unmappedCount);
          setLoading(false);
        }
      } catch {
        // Health data fetch failed; show empty state on next render
        if (active) setLoading(false);
      }
    }

    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading component health...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-gray-100">Component Health</h2>
      <div className="bg-gray-900 rounded-lg border border-gray-800">
        {components.map((comp) => {
          const cfg = STATUS_CONFIG[comp.status];
          return (
            <div
              key={comp.name}
              onClick={() => onSelectComponent?.(comp.name)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectComponent?.(comp.name);
                }
              }}
              className="flex items-center justify-between px-4 py-3 min-h-[44px] border-b border-gray-800 last:border-0 cursor-pointer hover:bg-gray-800/50 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${cfg.dotColor}${comp.status === "critical" ? " animate-subtle-pulse" : ""}`} />
                <span className="text-sm font-medium text-gray-100 truncate">
                  {comp.name}
                </span>
              </div>
              <div className="flex items-center gap-4 shrink-0 ml-4">
                <span className={`text-xs font-medium ${cfg.textColor}`}>
                  {cfg.label}
                </span>
                <span className="text-xs text-gray-400 w-16 sm:w-20 text-right">
                  {comp.openCount} open
                </span>
                <span className="hidden sm:block text-xs text-gray-500 w-24 text-right">
                  {comp.lastIncidentTime
                    ? relativeTime(comp.lastIncidentTime)
                    : "No incidents"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-2 text-xs text-gray-500">
        <p>Health status is derived from open incident reports, not live system monitoring.</p>
        {unmappedCount > 0 && (
          <p className="text-yellow-500">{unmappedCount} incident(s) not mapped to a component (no affected area selected).</p>
        )}
      </div>
    </div>
  );
}
