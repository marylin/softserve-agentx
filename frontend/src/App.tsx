import { useState, useEffect } from "react";
import { Shield, FileText } from "lucide-react";
import IncidentForm from "./components/IncidentForm";
import IncidentList from "./components/IncidentList";
import MetricsDashboard from "./components/MetricsDashboard";
import ComponentHealth from "./components/ComponentHealth";
import StatusTracker from "./components/StatusTracker";

type View = "form" | "list" | "detail" | "metrics" | "health";

export default function App() {
  const [view, setView] = useState<View>("form");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [alertCounts, setAlertCounts] = useState({ open: 0, critical: 0 });

  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/metrics/`);
        const data = await res.json();
        const open = Object.entries(data.status_distribution)
          .filter(([k]) => !["resolved", "failed"].includes(k))
          .reduce((sum, [, v]) => sum + (v as number), 0);
        const critical = (data.severity_distribution?.P1 || 0);
        setAlertCounts({ open, critical });
      } catch {}
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-orange-500" />
            <h1 className="text-xl font-semibold text-gray-100">
              AgentX SRE Triage
            </h1>
          </div>
          <nav className="flex gap-4">
            <button
              onClick={() => setView("form")}
              className={`px-3 py-1.5 rounded text-sm ${
                view === "form"
                  ? "bg-orange-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Report Incident
            </button>
            <button
              onClick={() => setView("list")}
              className={`relative px-3 py-1.5 rounded text-sm ${
                view === "list"
                  ? "bg-orange-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Incidents
              {alertCounts.open > 0 && (
                <span className="absolute -top-1 -right-1 bg-orange-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {alertCounts.open}
                </span>
              )}
            </button>
            <button
              onClick={() => setView("metrics")}
              className={`px-3 py-1.5 rounded text-sm ${
                view === "metrics"
                  ? "bg-orange-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Metrics
            </button>
            <button
              onClick={() => setView("health")}
              className={`relative px-3 py-1.5 rounded text-sm ${
                view === "health"
                  ? "bg-orange-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Health
              {alertCounts.critical > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 rounded-full w-2 h-2" />
              )}
            </button>
            <a
              href={`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-300 text-sm flex items-center gap-1"
            >
              <FileText className="w-3.5 h-3.5" />
              API
            </a>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        {view === "form" && (
          <IncidentForm
            onSubmitted={(id) => {
              setSelectedId(id);
              setView("detail");
            }}
          />
        )}
        {view === "list" && (
          <IncidentList
            onSelect={(id) => {
              setSelectedId(id);
              setView("detail");
            }}
            onReportNew={() => setView("form")}
          />
        )}
        {view === "metrics" && <MetricsDashboard />}
        {view === "health" && <ComponentHealth />}
        {view === "detail" && selectedId && (
          <StatusTracker
            incidentId={selectedId}
            onBack={() => setView("list")}
          />
        )}
      </main>
    </div>
  );
}
