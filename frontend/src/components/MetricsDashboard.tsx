import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Metrics {
  total_incidents: number;
  status_distribution: Record<string, number>;
  severity_distribution: Record<string, number>;
  component_distribution: Record<string, number>;
  average_confidence: number;
  resolution_rate: number;
  failure_rate: number;
}

const STATUS_COLORS: Record<string, string> = {
  received: "bg-gray-400",
  triaging: "bg-yellow-400",
  triaged: "bg-blue-400",
  routed: "bg-indigo-400",
  resolved: "bg-green-400",
  failed: "bg-red-400",
};

const STATUS_LABELS: Record<string, string> = {
  received: "Received",
  triaging: "Analyzing",
  triaged: "Triaged",
  routed: "Routed",
  resolved: "Resolved",
  failed: "Failed",
};

const SEVERITY_COLORS: Record<string, string> = {
  P1: "bg-red-600",
  P2: "bg-amber-600",
  P3: "bg-yellow-600",
  P4: "bg-gray-600",
};

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div className="relative group">
      {children}
      <div role="tooltip" className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-gray-200 whitespace-nowrap opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity pointer-events-none z-10">
        {text}
      </div>
    </div>
  );
}

export default function MetricsDashboard() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function fetchMetrics() {
      try {
        const res = await fetch(`${API_URL}/metrics/`);
        if (!res.ok) throw new Error("Failed to fetch metrics");
        const data = await res.json();
        if (active) {
          setMetrics(data);
          setLoading(false);
        }
      } catch {
        // Metrics fetch failed; fall through to error state
        if (active) setLoading(false);
      }
    }

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin" />
        Loading metrics...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-20 text-gray-500">
        Could not load metrics. The server may be temporarily unavailable.
      </div>
    );
  }

  const severityTotal = Object.values(metrics.severity_distribution).reduce(
    (sum, n) => sum + n,
    0
  );

  return (
    <div className="space-y-8">
      <h2 className="text-lg font-semibold text-gray-100">Metrics</h2>

      {/* Inline Summary */}
      <div className="rounded-lg border border-gray-800 bg-gray-900 px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <Tooltip text="Total incidents reported across all statuses and severities">
            <span className="text-2xl font-semibold text-gray-100">{metrics.total_incidents}</span>
            <span className="ml-1.5 text-sm text-gray-400">incidents</span>
          </Tooltip>
          <Tooltip text="How confident the AI is in its severity classifications. Above 80% is reliable.">
            <span className="text-sm text-gray-400">Confidence</span>
            <span className="ml-1.5 text-sm font-medium text-gray-200">{(metrics.average_confidence * 100).toFixed(0)}%</span>
          </Tooltip>
          <Tooltip text="Percentage of incidents that have been fully resolved. Higher means faster turnaround.">
            <span className="text-sm text-gray-400">Resolved</span>
            <span className="ml-1.5 text-sm font-medium text-gray-200">{(metrics.resolution_rate * 100).toFixed(0)}%</span>
          </Tooltip>
          {metrics.failure_rate > 0 && (
            <Tooltip text="Percentage of incidents where automated triage failed. These need manual review.">
              <span className="text-sm text-gray-400">Failed</span>
              <span className="ml-1.5 text-sm font-medium text-red-400">{(metrics.failure_rate * 100).toFixed(0)}%</span>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Severity Distribution */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">
          Severity Distribution
        </h3>
        <div className="space-y-2">
          {["P1", "P2", "P3", "P4"].map((sev) => {
            const count = metrics.severity_distribution[sev] || 0;
            const pct = severityTotal > 0 ? (count / severityTotal) * 100 : 0;
            return (
              <Tooltip key={sev} text={`${sev}: ${count} incident${count !== 1 ? "s" : ""} (${pct.toFixed(0)}% of total). SLA: ${sev === "P1" ? "15 min" : sev === "P2" ? "1 hour" : sev === "P3" ? "4 hours" : "24 hours"}`}>
                <div className="flex items-center gap-3">
                  <span className="w-8 text-sm font-medium text-gray-300">
                    {sev}
                  </span>
                  <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                    <div
                      className={`h-full ${SEVERITY_COLORS[sev]} rounded`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="w-8 text-sm text-gray-400 text-right">
                    {count}
                  </span>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Component Distribution */}
      {Object.keys(metrics.component_distribution).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-3">
            Affected Components
          </h3>
          <div className="space-y-2">
            {(() => {
              const componentTotal = Object.values(metrics.component_distribution).reduce((s, n) => s + n, 0);
              return Object.entries(metrics.component_distribution)
              .sort(([, a], [, b]) => b - a)
              .map(([component, count]) => {
                const pct = componentTotal > 0 ? (count / componentTotal) * 100 : 0;
                return (
                  <Tooltip key={component} text={`${component}: ${count} incident${count !== 1 ? "s" : ""} (${pct.toFixed(0)}% of total)`}>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-300 w-32 sm:w-48 truncate">{component}</span>
                      <div className="flex-1 h-6 bg-gray-800 rounded overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 rounded"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-sm text-gray-400 text-right">{count}</span>
                    </div>
                  </Tooltip>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Status Distribution */}
      <div>
        <h3 className="text-sm font-medium text-gray-300 mb-3">
          Status Distribution
        </h3>
        <div className="space-y-2">
          {["received", "triaging", "triaged", "routed", "resolved", "failed"].map(
            (status) => {
              const count = metrics.status_distribution[status] || 0;
              return (
                <Tooltip key={status} text={`${count} incident${count !== 1 ? "s" : ""} in ${STATUS_LABELS[status] || status} status`}>
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status]}`}
                    />
                    <span className="text-sm text-gray-300 w-24">{STATUS_LABELS[status] || status}</span>
                    <span className="text-sm text-gray-400">{count}</span>
                  </div>
                </Tooltip>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
}
