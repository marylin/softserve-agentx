import { useState } from "react";
import { Shield } from "lucide-react";

type View = "form" | "list" | "detail";

export default function App() {
  const [view, setView] = useState<View>("form");
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
              className={`px-3 py-1.5 rounded text-sm ${
                view === "list"
                  ? "bg-orange-600 text-white"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Dashboard
            </button>
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-6">
        {view === "form" && (
          <p className="text-gray-400">Incident form -- loading...</p>
        )}
        {view === "list" && (
          <p className="text-gray-400">Incident list -- loading...</p>
        )}
        {view === "detail" && selectedId && (
          <p className="text-gray-400">Incident detail -- loading...</p>
        )}
      </main>
    </div>
  );
}
