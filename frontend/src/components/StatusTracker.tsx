import { useEffect, useState, useCallback, useRef } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
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
} from "lucide-react";
import { getIncident } from "../lib/api";
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

  const { remaining, breached } = getSlaStatus(severity, createdAt);
  // Force recalc with current time
  const _ = now;

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        breached ? "text-red-400 animate-pulse" : "text-green-400"
      }`}
    >
      <Clock className="w-3 h-3" />
      {breached
        ? `SLA BREACHED by ${formatDuration(remaining)}`
        : `SLA: ${formatDuration(remaining)} remaining`}
    </span>
  );
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

  const poll = useCallback(async () => {
    try {
      const data = await getIncident(incidentId);
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
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const current = stepIndex(incident.status);
  const failed = incident.status === "failed";

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
          const active = !failed && current === i;
          return (
            <div key={step.key} className="flex items-center gap-2">
              {i > 0 && (
                <div
                  className={`h-px w-6 ${done ? "bg-orange-500" : "bg-gray-700"}`}
                />
              )}
              <div className="flex items-center gap-1.5">
                {failed && i === 0 ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : done ? (
                  active ? (
                    <Loader2 className="w-5 h-5 animate-spin text-orange-500" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 text-orange-500" />
                  )
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
        <div className="flex items-center gap-2 rounded border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <XCircle className="w-4 h-4 shrink-0" />
          Triage failed. The incident could not be processed automatically.
        </div>
      )}

      {/* Triage Results */}
      {incident.triage && (
        <section className="space-y-4 rounded border border-gray-800 bg-gray-900/50 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <FileText className="w-4 h-4 text-orange-500" />
            Triage Results
          </h3>

          <div className="flex flex-wrap items-center gap-3">
            <SeverityBadge level={incident.triage.severity} />
            <span className="text-xs text-gray-400">
              Confidence: {(incident.triage.confidence * 100).toFixed(0)}%
            </span>
            <SlaCountdown severity={incident.triage.severity} createdAt={incident.created_at} />
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
                    <code className="rounded bg-gray-800 px-1.5 py-0.5 text-orange-400">
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

      {/* Routing Results */}
      {incident.routing && (
        <section className="space-y-3 rounded border border-gray-800 bg-gray-900/50 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-200">
            <ExternalLink className="w-4 h-4 text-orange-500" />
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
                  className="text-orange-400 hover:underline"
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

      {/* Original Report */}
      <section className="space-y-3 rounded border border-gray-800 bg-gray-900/50 p-5">
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
                          className="text-orange-400 hover:underline"
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
