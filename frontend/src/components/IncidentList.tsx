import { useEffect, useState, useCallback, useMemo } from "react";
import { Loader2, RefreshCw, Search, Download } from "lucide-react";
import { listIncidents } from "../lib/api";
import type { IncidentListItem, IncidentStatus, SeverityLevel } from "../types/incident";
import SeverityBadge from "./SeverityBadge";

const SLA_MINUTES: Record<string, number> = { P1: 15, P2: 60, P3: 240, P4: 1440 };

function formatAge(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d`;
}

function isSlaBreach(severity: string | null, createdAt: string): boolean {
  if (!severity) return false;
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 60000;
  return elapsed > (SLA_MINUTES[severity] || 60);
}

function formatReported(createdAt: string) {
  const ms = Date.now() - new Date(createdAt).getTime();
  if (ms < 86400000) return formatAge(createdAt) + " ago";
  return new Date(createdAt).toLocaleDateString();
}

interface Props {
  onSelect: (id: string) => void;
  onReportNew?: () => void;
}

const statusColors: Record<IncidentStatus, string> = {
  received: "text-blue-400",
  triaging: "text-yellow-400",
  triaged: "text-orange-400",
  routed: "text-purple-400",
  resolved: "text-green-400",
  failed: "text-red-400",
};

const statusLabel: Record<IncidentStatus, string> = {
  received: "Received",
  triaging: "Analyzing",
  triaged: "Triaged",
  routed: "Routed",
  resolved: "Resolved",
  failed: "Failed",
};

const ALL_SEVERITIES: SeverityLevel[] = ["P1", "P2", "P3", "P4"];
const ALL_STATUSES: IncidentStatus[] = ["received", "triaging", "triaged", "routed", "resolved", "failed"];

const filterInputClasses = "bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-sm text-gray-100";

export default function IncidentList({ onSelect, onReportNew }: Props) {
  const [incidents, setIncidents] = useState<IncidentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchText, setSearchText] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityLevel | "">("");
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "">("");

  const filteredIncidents = useMemo(() => {
    return incidents.filter((inc) => {
      if (searchText && !inc.title.toLowerCase().includes(searchText.toLowerCase()) &&
          !(inc.description || "").toLowerCase().includes(searchText.toLowerCase())) {
        return false;
      }
      if (severityFilter && inc.severity !== severityFilter) {
        return false;
      }
      if (statusFilter && inc.status !== statusFilter) {
        return false;
      }
      return true;
    });
  }, [incidents, searchText, severityFilter, statusFilter]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(incidents, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incidents-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Check URL for area filter on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const area = params.get("area");
    if (area) setSearchText(area);
  }, []);

  // Listen for filter-area events from health cards
  useEffect(() => {
    const handler = (e: Event) => {
      const area = (e as CustomEvent).detail;
      setSearchText(area);
    };
    window.addEventListener("filter-area", handler);
    return () => window.removeEventListener("filter-area", handler);
  }, []);

  const fetch_ = useCallback(async () => {
    try {
      const data = await listIncidents();
      setIncidents(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, 10_000);
    return () => clearInterval(id);
  }, [fetch_]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">Incidents</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={incidents.length === 0}
            className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={() => {
              setLoading(true);
              fetch_();
            }}
            className="flex items-center gap-1.5 rounded border border-gray-700 bg-gray-800 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search by title or description..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className={`${filterInputClasses} pl-9 w-full`}
          />
        </div>
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as SeverityLevel | "")}
          className={filterInputClasses}
        >
          <option value="">All Severities</option>
          {ALL_SEVERITIES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as IncidentStatus | "")}
          className={filterInputClasses}
        >
          <option value="">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{statusLabel[s]}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && incidents.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : incidents.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-3">No incidents reported yet.</p>
          {onReportNew && (
            <button onClick={onReportNew} className="text-orange-400 hover:text-orange-300 text-sm">
              Report your first incident
            </button>
          )}
        </div>
      ) : filteredIncidents.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          No incidents match the current filters.
          <button onClick={() => { setSearchText(""); setSeverityFilter(""); setStatusFilter(""); }} className="text-orange-400 hover:text-orange-300 text-sm ml-2">
            Clear filters
          </button>
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-800">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/60 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-3 font-medium">Title</th>
                <th className="px-4 py-3 font-medium">Reporter</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Age</th>
                <th className="px-4 py-3 font-medium">Reported</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncidents.map((inc) => (
                <tr
                  key={inc.id}
                  onClick={() => onSelect(inc.id)}
                  className="cursor-pointer border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors"
                >
                  <td className="px-4 py-3 text-gray-200">{inc.title}</td>
                  <td className="px-4 py-3 text-gray-400">{inc.reporter_name}</td>
                  <td className="px-4 py-3">
                    {inc.severity ? (
                      <SeverityBadge level={inc.severity} />
                    ) : (
                      <span className="text-gray-600">--</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${statusColors[inc.status]}`}>
                      {statusLabel[inc.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={
                      inc.status === "resolved" ? "text-green-400" :
                      (inc.status !== "failed" && isSlaBreach(inc.severity, inc.created_at)) ? "text-red-400" :
                      "text-gray-500"
                    }>
                      {formatAge(inc.created_at)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatReported(inc.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
