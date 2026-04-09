import { useEffect, useState, useCallback, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Coins,
  Loader2,
  XCircle,
  ExternalLink,
  Mail,
  MessageSquare,
  FileText,
  BookOpen,
  Code,
  Layers,
  Paperclip,
  Clock,
  Link2,
} from "lucide-react";
import { getIncident, getSimilarIncidents, retryIncident } from "../lib/api";
import type { Incident, IncidentStatus } from "../types/incident";
import SeverityBadge from "./SeverityBadge";

const SLA_MINUTES: Record<string, number> = { P1: 15, P2: 60, P3: 240, P4: 1440 };

function getSlaStatus(severity: string, createdAt: string) {
  const slaMs = (SLA_MINUTES[severity] || 60) * 60 * 1000;
  const elapsed = Date.now() - new Date(createdAt).getTime();
  const remaining = slaMs - elapsed;
  return { remaining, breached: remaining <= 0 };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function SlaCountdown({ severity, createdAt }: { severity: string; createdAt: string }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // `now` state triggers re-renders; getSlaStatus uses Date.now() internally
  void now;
  const { remaining, breached } = getSlaStatus(severity, createdAt);

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        breached ? "text-red-400 font-semibold" : "text-green-400"
      }`}
    >
      <Clock className="w-3 h-3" />
      {breached
        ? `SLA BREACHED by ${formatDuration(remaining)}`
        : `SLA: ${formatDuration(remaining)} remaining`}
    </span>
  );
}

function confidenceLabel(c: number): { text: string; color: string } {
  if (c >= 0.85) return { text: "High confidence", color: "text-green-400" };
  if (c >= 0.6) return { text: "Moderate -- review recommended", color: "text-yellow-400" };
  return { text: "Low -- verify manually", color: "text-red-400" };
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface Props {
  incidentId: string;
  onBack: () => void;
}

const STEPS: { key: IncidentStatus; label: string }[] = [
  { key: "received", label: "Received" },
  { key: "triaging", label: "Analyzing" },
  { key: "triaged", label: "Triaged" },
  { key: "routed", label: "Routed" },
  { key: "resolved", label: "Resolved" },
];

const stepIndex = (status: IncidentStatus): number => {
  if (status === "failed") return -1;
  return STEPS.findIndex((s) => s.key === status);
};

export default function StatusTracker({ incidentId, onBack }: Props) {
  const [incident, setIncident] = useState<Incident | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const [similarIncidents, setSimilarIncidents] = useState<
    { id: string; title: string; severity: string; status: string; shared_modules: string[]; created_at: string }[]
  >([]);
  const similarFetched = useRef(false);
  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await getIncident(incidentId);
      if (prevStatusRef.current && prevStatusRef.current !== data.status) {
        if (data.status === "triaged" && data.triage && Notification.permission === "granted") {
          new Notification("Incident Triaged", {
            body: `${data.triage.severity} - ${data.title}\nConfidence: ${(data.triage.confidence * 100).toFixed(0)}%`,
            icon: "/favicon.ico",
          });
        } else if (data.status === "routed" && data.routing && Notification.permission === "granted") {
          new Notification("Incident Routed", {
            body: `${data.title}\nTicket: ${data.routing.linear_ticket_id || "Created"}`,
            icon: "/favicon.ico",
          });
        }
      }
      prevStatusRef.current = data.status;
      setIncident(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incident");
    }
  }, [incidentId]);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 3000);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    if (incident?.triage && !similarFetched.current) {
      similarFetched.current = true;
      getSimilarIncidents(incidentId).then(setSimilarIncidents).catch(() => {});
    }
  }, [incident?.triage, incidentId]);

  if (error && !incident) {
    return (
      <div className="space-y-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
        <div className="flex items-center gap-2 rounded border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <XCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    );
  }

  const current = stepIndex(incident.status);
  const failed = incident.status === "failed";
  const terminal = incident.status === "routed" || incident.status === "resolved" || incident.status === "failed";

  return (
    <div className="space-y-8">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Title */}
      <div>
        <h2 className="text-lg font-semibold text-gray-100">{incident.title}</h2>
        <p className="mt-1 text-sm text-gray-500">ID: {incident.id}</p>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2">
        {STEPS.map((step, i) => {
          const done = !failed && current >= i;
          // Spinner shows on the NEXT step after current (the one being worked on)
          // e.g., status="triaging" -> spinner on "Analyzing" (i=1), check on "Received" (i=0)
          const isInProgress = !failed && !terminal && i === current + 1;
          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-6 ${done ? "bg-indigo-500" : "bg-gray-700"}`}
                />
              )}
              <div className="flex items-center gap-1.5">
                {failed && i === 0 ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : done ? (
                  <CheckCircle2 className="w-5 h-5 text-indigo-500" />
                ) : isInProgress ? (
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                ) : (
                  <Circle className="w-5 h-5 text-gray-600" />
                )}
                <span
                  className={`text-xs font-medium ${
                    failed
                      ? "text-red-400"
                      : done
                        ? "text-gray-200"
                        : "text-gray-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Failed state */}
      {failed && (
        <div className="rounded border border-red-500/50 bg-red-500/10 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="w-4 h-4 shrink-0" />
            Triage failed. The incident could not be processed automatically.
          </div>
          <button
            onClick={async () => {
              setRetrying(true);
              setRetryError(false);
              try {
                await retryIncident(incidentId);
              } catch {
                setRetryError(true);
              }
              setRetrying(false);
            }}
            disabled={retrying}
            className="mt-3 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm rounded"
          >
            {retrying ? "Retrying..." : "Retry Triage"}
          </button>
          {retryError && <p className="text-xs text-red-400 mt-1">Retry failed. Try again.</p>}
        </div>
      )}

      {/* Triage Results */}
      {incident.triage && (
        <section className="space-y-4 rounded border border-gray-800 bg-gray-900 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <FileText className="w-4 h-4 text-indigo-500" />
            Triage Results
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            <SeverityBadge level={incident.triage.severity} />
            {(() => {
              const cl = confidenceLabel(incident.triage.confidence);
              return (
                <span className={`text-xs ${cl.color}`}>
                  {(incident.triage.confidence * 100).toFixed(0)}% -- {cl.text}
                </span>
              );
            })()}
            <SlaCountdown severity={incident.triage.severity} createdAt={incident.created_at} />
            {(() => {
              const baseInputTokens = 8000;
              const baseOutputTokens = 1700;
              const imageTokens = (incident.attachments?.filter(a => a.type === "image").length || 0) * 1500;
              const totalCost = ((baseInputTokens + imageTokens) * 3 + baseOutputTokens * 15) / 1_000_000;
              return (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <Coins className="w-3 h-3" />
                  Est. cost: ~${totalCost.toFixed(2)}
                </span>
              );
            })()}
          </div>

          <div>
            <h4 className="mb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
              Summary
            </h4>
            <p className="text-sm text-gray-300">{incident.triage.summary}</p>
          </div>

          {incident.triage.affected_modules.length > 0 && (
            <div>
              <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <Layers className="w-3 h-3" /> Affected Modules
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {incident.triage.affected_modules.map((m) => (
                  <span
                    key={m}
                    className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-300"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {incident.triage.code_references.length > 0 && (
            <div>
              <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <Code className="w-3 h-3" /> Code References
              </h4>
              <ul className="space-y-1">
                {incident.triage.code_references.map((ref, i) => (
                  <li key={i} className="text-xs text-gray-300">
                    <code className="rounded bg-gray-800 px-1.5 py-0.5 text-indigo-400">
                      {ref.file}
                      {ref.line != null && `:${ref.line}`}
                    </code>{" "}
                    <span className="text-gray-400">{ref.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {incident.triage.runbook_steps.length > 0 && (
            <div>
              <h4 className="mb-1 flex items-center gap-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
                <BookOpen className="w-3 h-3" /> Runbook Steps
              </h4>
              <ol className="list-decimal list-inside space-y-1">
                {incident.triage.runbook_steps.map((step, i) => (
                  <li key={i} className="text-sm text-gray-300">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}

      {/* Similar Incidents */}
      {similarIncidents.length > 0 && (
        <section className="space-y-3 rounded border border-gray-800 bg-gray-900 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <Link2 className="w-4 h-4 text-indigo-500" />
            Related Incidents
          </h3>
          <ul className="divide-y divide-gray-800">
            {similarIncidents.map((sim) => (
              <li
                key={sim.id}
                className="flex flex-wrap items-center gap-2 py-3"
              >
                <span className="text-sm text-gray-200 font-medium">{sim.title}</span>
                <SeverityBadge level={sim.severity as "P1" | "P2" | "P3" | "P4"} />
                <span className="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400 capitalize">
                  {sim.status}
                </span>
                {sim.shared_modules.map((mod) => (
                  <span
                    key={mod}
                    className="rounded bg-indigo-500/10 border border-indigo-500/30 px-1.5 py-0.5 text-xs text-indigo-400"
                  >
                    {mod}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Routing Results */}
      {incident.routing && (
        <section className="space-y-3 rounded border border-gray-800 bg-gray-900 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <ExternalLink className="w-4 h-4 text-indigo-500" />
            Routing
          </h3>

          <div className="space-y-2 text-sm">
            {incident.routing.linear_ticket_url && (
              <div className="flex items-center gap-2 text-gray-300">
                <ExternalLink className="w-4 h-4 text-gray-500" />
                <a
                  href={incident.routing.linear_ticket_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-400 hover:underline"
                >
                  Linear Ticket: {incident.routing.linear_ticket_id}
                </a>
              </div>
            )}
            {incident.routing.slack_message_ts && (
              <div className="flex items-center gap-2 text-gray-300">
                <MessageSquare className="w-4 h-4 text-gray-500" />
                Slack notification sent
              </div>
            )}
            {incident.routing.email_sent && (
              <div className="flex items-center gap-2 text-gray-300">
                <Mail className="w-4 h-4 text-gray-500" />
                Email notification sent
              </div>
            )}
          </div>
        </section>
      )}

      {/* Timeline */}
      {(() => {
        const entries: { label: string; time: string | null; color: string }[] = [
          { label: "Received", time: incident.created_at, color: "bg-gray-500" },
          { label: "Triaging", time: incident.created_at, color: "bg-yellow-500" },
          { label: "Triaged", time: incident.triage?.created_at ?? null, color: "bg-blue-500" },
          { label: "Routed", time: incident.routing?.created_at ?? null, color: "bg-indigo-500" },
          { label: "Resolved", time: incident.routing?.resolved_at ?? null, color: "bg-green-500" },
        ];
        const active = entries.filter((e) => e.time !== null);
        if (active.length < 2) return null;

        const fmt = (iso: string) =>
          new Date(iso).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
            second: "2-digit",
            hour12: true,
          });

        const durationBetween = (a: string, b: string) => {
          const ms = new Date(b).getTime() - new Date(a).getTime();
          if (ms < 0) return null;
          const totalSec = Math.floor(ms / 1000);
          if (totalSec < 60) return `took ${totalSec}s`;
          const m = Math.floor(totalSec / 60);
          const s = totalSec % 60;
          return `took ${m}m ${s}s`;
        };

        return (
          <section className="space-y-3 rounded border border-gray-800 bg-gray-900 p-5">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
              <Clock className="w-4 h-4 text-indigo-500" />
              Timeline
            </h3>
            <div className="relative ml-2">
              {active.map((entry, i) => (
                <div key={entry.label} className="relative flex items-start gap-3 pb-4 last:pb-0">
                  {i < active.length - 1 && (
                    <div className="absolute left-[5px] top-3 bottom-0 w-px bg-gray-700" />
                  )}
                  <div className={`relative z-10 mt-0.5 h-[11px] w-[11px] rounded-full ${entry.color} shrink-0`} />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-gray-200">{entry.label}</span>
                    <span className="ml-2 text-xs text-gray-500">{fmt(entry.time!)}</span>
                    {i > 0 && active[i - 1].time && entry.time && (
                      <span className="ml-2 text-xs text-gray-600">
                        {durationBetween(active[i - 1].time!, entry.time!)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Original Report */}
      <section className="space-y-3 rounded border border-gray-800 bg-gray-900 p-5">
        <h3 className="text-sm font-semibold text-gray-200">Original Report</h3>
        <div className="text-sm text-gray-400">
          <p>
            Reported by <span className="text-gray-200">{incident.reporter_name}</span>{" "}
            on {new Date(incident.created_at).toLocaleString()}
          </p>
        </div>
        <p className="whitespace-pre-wrap text-sm text-gray-300">
          {incident.description}
        </p>

        {incident.attachments.length > 0 && (
          <div>
            <h4 className="mb-1 text-xs font-medium text-gray-400 uppercase tracking-wide">
              Attachments
            </h4>
            <ul className="space-y-3">
              {incident.attachments.map((att) => {
                const url = `${API_URL}/incidents/${incident.id}/attachments/${att.id}`;
                return (
                  <li key={att.id}>
                    {att.type === "image" ? (
                      <a href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={att.original_filename}
                          className="max-w-xs rounded border border-gray-700"
                        />
                        <span className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                          <Paperclip className="w-3 h-3" />
                          {att.original_filename}{" "}
                          <span className="text-gray-600">
                            ({(att.file_size / 1024).toFixed(1)} KB)
                          </span>
                        </span>
                      </a>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-gray-400">
                        <Paperclip className="w-3 h-3" />
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:underline"
                        >
                          {att.original_filename}
                        </a>
                        <span className="text-gray-600">
                          ({att.type}, {(att.file_size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
