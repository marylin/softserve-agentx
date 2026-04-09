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

const SEVERITY_COLORS: Record<string, string> = {
  P1: "bg-red-600",
  P2: "bg-orange-600",
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
      <div className="flex items-center justify-center py-20 text-gray-400">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading metrics...
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="text-center py-20 text-gray-500">
        Failed to load metrics.
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

      {/* KPI Stats Bar */}
      <div className="flex items-center gap-6 bg-gray-900 rounded-lg border border-gray-800 px-5 py-4">
        <Tooltip text="Total incidents across all statuses">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Total Incidents</p>
            <p className="text-lg font-semibold text-gray-100">
              {metrics.total_incidents}
            </p>
          </div>
        </Tooltip>
        <div className="w-px h-8 bg-gray-800" />
        <Tooltip text="Average AI confidence score across all triaged incidents (higher = more reliable severity)">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Avg Confidence</p>
            <p className="text-lg font-semibold text-gray-100">
              {(metrics.average_confidence * 100).toFixed(1)}%
            </p>
          </div>
        </Tooltip>
        <div className="w-px h-8 bg-gray-800" />
        <Tooltip text="Percentage of incidents that reached resolved status">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Resolution Rate</p>
            <p className="text-lg font-semibold text-gray-100">
              {(metrics.resolution_rate * 100).toFixed(1)}%
            </p>
          </div>
        </Tooltip>
        <div className="w-px h-8 bg-gray-800" />
        <Tooltip text="Percentage of incidents where the triage pipeline failed">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Failure Rate</p>
            <p className="text-lg font-semibold text-gray-100">
              {(metrics.failure_rate * 100).toFixed(1)}%
            </p>
          </div>
        </Tooltip>
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
              <Tooltip key={sev} text={`${sev}: ${count} incident${count !== 1 ? "s" : ""} (${pct.toFixed(0)}% of total)`}>
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
            {Object.entries(metrics.component_distribution)
              .sort(([, a], [, b]) => b - a)
              .map(([component, count]) => {
                const total = Object.values(metrics.component_distribution).reduce((s, n) => s + n, 0);
                const pct = total > 0 ? (count / total) * 100 : 0;
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
              })}
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
                <Tooltip key={status} text={`${count} incident${count !== 1 ? "s" : ""} in ${status} status`}>
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status]}`}
                    />
                    <span className="text-sm text-gray-300 w-24">{status}</span>
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
