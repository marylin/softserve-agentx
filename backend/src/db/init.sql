CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TYPE incident_status AS ENUM ('received', 'triaging', 'triaged', 'routed', 'resolved', 'failed');
CREATE TYPE severity_level AS ENUM ('P1', 'P2', 'P3', 'P4');
CREATE TYPE attachment_type AS ENUM ('image', 'log', 'video');

CREATE TABLE incidents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    status incident_status NOT NULL DEFAULT 'received',
    reporter_email TEXT NOT NULL,
    reporter_name TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE incident_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    type attachment_type NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE triage_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    severity severity_level NOT NULL,
    confidence REAL NOT NULL,
    summary TEXT NOT NULL,
    affected_modules JSONB NOT NULL DEFAULT '[]',
    code_references JSONB NOT NULL DEFAULT '[]',
    runbook_steps JSONB NOT NULL DEFAULT '[]',
    duplicate_of UUID REFERENCES incidents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE routing_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    incident_id UUID NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
    linear_ticket_id TEXT,
    linear_ticket_url TEXT,
    slack_message_ts TEXT,
    email_sent BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at TIMESTAMPTZ,
    resolution_notified BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_incidents_status ON incidents(status);
CREATE INDEX idx_incidents_created ON incidents(created_at DESC);
CREATE INDEX idx_triage_incident ON triage_results(incident_id);
CREATE INDEX idx_routing_incident ON routing_results(incident_id);
CREATE INDEX idx_routing_linear ON routing_results(linear_ticket_id);
