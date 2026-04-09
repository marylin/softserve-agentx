export type IncidentStatus =
  | "received"
  | "triaging"
  | "triaged"
  | "routed"
  | "resolved"
  | "failed";

export type SeverityLevel = "P1" | "P2" | "P3" | "P4";

export type AttachmentType = "image" | "log" | "video";

export interface Attachment {
  id: string;
  type: AttachmentType;
  file_size: number;
  mime_type: string;
  original_filename: string;
  created_at: string;
}

export interface TriageResult {
  severity: SeverityLevel;
  confidence: number;
  summary: string;
  affected_modules: string[];
  code_references: { file: string; line?: number; description: string }[];
  runbook_steps: string[];
  duplicate_of: string | null;
  created_at: string;
}

export interface RoutingResult {
  linear_ticket_id: string | null;
  linear_ticket_url: string | null;
  slack_message_ts: string | null;
  email_sent: boolean;
  resolved_at: string | null;
  resolution_notified: boolean;
  created_at: string;
}

export interface Incident {
  id: string;
  status: IncidentStatus;
  title: string;
  description: string;
  reporter_name: string;
  attachments: Attachment[];
  triage: TriageResult | null;
  routing: RoutingResult | null;
  created_at: string;
  updated_at: string;
}

export interface IncidentListItem {
  id: string;
  status: IncidentStatus;
  title: string;
  description: string;
  reporter_name: string;
  severity: SeverityLevel | null;
  created_at: string;
  updated_at: string;
}
