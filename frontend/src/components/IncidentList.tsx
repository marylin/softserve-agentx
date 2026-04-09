import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { listIncidents } from "../lib/api";
import type { IncidentListItem, IncidentStatus } from "../types/incident";
import SeverityBadge from "./SeverityBadge";

interface Props {
  onSelect: (id: string) => void;
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

export default function IncidentList({ onSelect }: Props) {
  const [incidents, setIncidents] = useState<IncidentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <p className="py-10 text-center text-sm text-gray-500">
          No incidents reported yet.
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
                <th className="px-4 py-3 font-medium">Reported</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((inc) => (
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
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(inc.created_at).toLocaleDateString()}
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
