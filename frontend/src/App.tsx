import { useState, useEffect } from "react";
import { Shield, FileText, Plus, List, BarChart3, Activity } from "lucide-react";
import IncidentForm from "./components/IncidentForm";
import IncidentList from "./components/IncidentList";
import MetricsDashboard from "./components/MetricsDashboard";
import ComponentHealth from "./components/ComponentHealth";
import StatusTracker from "./components/StatusTracker";

type View = "form" | "list" | "detail" | "metrics" | "health";

function parseRoute(): { view: View; selectedId: string | null } {
  const path = window.location.pathname;
  const params = new URLSearchParams(window.location.search);
  if (path === "/metrics") return { view: "metrics", selectedId: null };
  if (path === "/health") return { view: "health", selectedId: null };
  if (path === "/incidents" && params.get("id")) return { view: "detail", selectedId: params.get("id") };
  if (path === "/incidents") return { view: "list", selectedId: null };
  return { view: "form", selectedId: null };
}

export default function App() {
  const initial = parseRoute();
  const [view, setView] = useState<View>(initial.view);
  const [selectedId, setSelectedId] = useState<string | null>(initial.selectedId);
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
      } catch {
        // Metrics fetch is non-critical; silently retry on next interval
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 15000);
    return () => clearInterval(interval);
  }, []);

  const navigate = (newView: View, id: string | null = null) => {
    setView(newView);
    setSelectedId(id);
    let path = "/";
    if (newView === "list") path = "/incidents";
    if (newView === "detail" && id) path = `/incidents?id=${id}`;
    if (newView === "metrics") path = "/metrics";
    if (newView === "health") path = "/health";
    window.history.pushState({ view: newView, id }, "", path);
  };

  useEffect(() => {
    const handlePop = () => {
      const route = parseRoute();
      setView(route.view);
      setSelectedId(route.selectedId);
    };
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-4 sm:px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <Shield className="w-6 h-6 text-indigo-500" />
            <h1 className="text-lg font-semibold tracking-tight text-gray-100">
              AgentX <span className="hidden sm:inline font-normal text-gray-400">SRE Triage</span>
            </h1>
          </div>
          <nav className="flex flex-wrap gap-1 sm:gap-4 justify-end">
            <button
              onClick={() => navigate("form")}
              className={`min-h-[44px] sm:min-h-0 px-2 sm:px-4 py-2 rounded text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 flex items-center gap-1.5 ${
                view === "form"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Plus className="w-4 h-4 sm:hidden" />
              <span className="hidden sm:inline">Report Incident</span>
              <span className="sm:hidden">Report</span>
            </button>
            <button
              onClick={() => navigate("list")}
              className={`relative min-h-[44px] sm:min-h-0 px-2 sm:px-4 py-2 rounded text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 flex items-center gap-1.5 ${
                view === "list"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <List className="w-4 h-4 sm:hidden" />
              Incidents
              {alertCounts.open > 0 && (
                <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {alertCounts.open}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate("metrics")}
              className={`min-h-[44px] sm:min-h-0 px-2 sm:px-4 py-2 rounded text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 flex items-center gap-1.5 ${
                view === "metrics"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <BarChart3 className="w-4 h-4 sm:hidden" />
              Metrics
            </button>
            <button
              onClick={() => navigate("health")}
              className={`relative min-h-[44px] sm:min-h-0 px-2 sm:px-4 py-2 rounded text-sm transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 flex items-center gap-1.5 ${
                view === "health"
                  ? "bg-indigo-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              <Activity className="w-4 h-4 sm:hidden" />
              Health
              {alertCounts.critical > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 rounded-full w-2 h-2" />
              )}
            </button>
            <a
              href={`${import.meta.env.VITE_API_URL || "http://localhost:8000"}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] sm:min-h-0 text-gray-500 hover:text-gray-300 text-sm flex items-center gap-1 transition-colors focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded px-2 sm:px-0"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API</span>
            </a>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6" key={view}>
        <div className="animate-fade-in">
          {view === "form" && (
            <IncidentForm
              onSubmitted={(id) => navigate("detail", id)}
            />
          )}
          {view === "list" && (
            <IncidentList
              onSelect={(id) => navigate("detail", id)}
              onReportNew={() => navigate("form")}
            />
          )}
          {view === "metrics" && <MetricsDashboard />}
          {view === "health" && (
            <ComponentHealth
              onSelectComponent={(area) => {
                navigate("list");
                window.history.replaceState({}, "", `/incidents?area=${encodeURIComponent(area)}`);
                window.dispatchEvent(new CustomEvent("filter-area", { detail: area }));
              }}
            />
          )}
          {view === "detail" && selectedId && (
            <StatusTracker
              incidentId={selectedId}
              onBack={() => navigate("list")}
            />
          )}
        </div>
      </main>
    </div>
  );
}
