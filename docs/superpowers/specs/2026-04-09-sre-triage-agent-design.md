# SRE Incident Intake & Triage Agent -- Design Spec

**Project:** AgentX Hackathon 2026 (SoftServe)
**Author:** Solo entry
**Date:** 2026-04-09
**Deadline:** 2026-04-09 10:00 PM COT

---

## 1. Overview

An SRE agent system that ingests incident reports for a Medusa.js e-commerce application, performs automated triage by analyzing the codebase, and routes issues through a real ticketing/notification workflow.

**Core flow:** UI submit -> AI triage (code/docs analysis) -> Linear ticket -> Slack + email notify -> on resolve, notify reporter.

**Differentiators:**
- Multi-agent architecture (3 specialized agents) via Anthropic Agent SDK
- Pre-built Medusa.js knowledge base for deliberate context engineering
- Built-in browser screen recorder for incident capture
- All real integrations (Linear, Slack, Resend) -- no mocks
- 4-layer security model with prompt injection defense
- Full Langfuse observability with per-incident traces

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + Tailwind CSS (TypeScript) |
| Backend | FastAPI (Python) |
| Agent Framework | Anthropic Agent SDK |
| LLM | Claude Sonnet 4 (multimodal) |
| Database | PostgreSQL 16 |
| Observability | Langfuse (self-hosted) |
| Ticketing | Linear (real, via API) |
| Notifications | Slack (real, webhooks), Resend (real, email API) |
| Containerization | Docker Compose |
| Deployment | Railway (optional live demo) |

---

## 3. Architecture

### 3.1 System Diagram

```
Frontend (React :5173)
    |
    | REST API
    v
FastAPI Gateway (:8000)
    |
    +-- POST /incidents       (submit)
    +-- GET  /incidents/:id   (status)
    +-- GET  /incidents       (list)
    +-- POST /webhooks/linear (resolution)
    |
    v
┌──────────┐   ┌──────────┐   ┌──────────┐
│  INTAKE  │-->│  TRIAGE  │-->│  ROUTER  │
│  AGENT   │   │  AGENT   │   │  AGENT   │
└──────────┘   └──────────┘   └──────────┘
    |               |               |
    v               v               v
[File proc]   [Knowledge    [Linear API ]
[Validation]   Base +       [Slack API  ]
[Dedup     ]   Medusa repo] [Resend API ]
    |               |               |
    +-------+-------+-------+-------+
            |               |
         Postgres       Langfuse
```

### 3.2 Agent Definitions

**Intake Agent**
- Role: Validate, process multimodal input, extract structured data, detect duplicates
- Type: Autonomous
- LLM: Claude Sonnet 4
- Inputs: Raw text, images, log files, screen recordings
- Outputs: Structured incident object (JSON)
- Tools: process_image, process_log, extract_video_frames, check_duplicate
- Duplicate detection: Intake Agent receives a summary of recent open incidents (title + severity + status) as context. It uses Claude to compare the new incident against them and determine if it's a duplicate or related. If matched, linked via `duplicate_of` FK. Agent still processes but marks it in the triage output.

**Triage Agent**
- Role: Analyze incident against Medusa codebase, assign severity, generate technical summary
- Type: Autonomous
- LLM: Claude Sonnet 4
- Inputs: Structured incident object
- Outputs: Triage result (severity, summary, modules, code refs, runbook)
- Tools: search_modules, read_module_docs, read_source_file, search_codebase, get_api_route, get_error_pattern

**Router Agent**
- Role: Create ticket, send notifications, handle resolution flow
- Type: Autonomous
- LLM: Claude Sonnet 4
- Inputs: Triage result
- Outputs: Routing result (ticket URL, notification status)
- Tools: create_linear_ticket, send_slack_notification, send_email, update_incident_status

### 3.3 Orchestration

- Sequential pipeline: Intake -> Triage -> Router
- State managed in PostgreSQL with enforced state machine
- Each agent is a separate Anthropic Agent SDK agent with isolated tools
- Agent handoffs pass structured JSON (Pydantic models)
- On failure at any stage: status set to "failed", error logged to Langfuse, no silent failures

---

## 4. Multimodal Input Pipeline

**Accepted inputs:**
- Text description (required, max 5000 chars)
- Image/screenshot (png/jpg/webp, max 10MB)
- Log file (.log, .txt, .json, .csv, max 5MB)
- Screen recording (webm via built-in browser recorder, max 50MB, max 60s)

**Processing:**
- Text: Structured extraction (who, what, when, error codes, URLs)
- Image: Claude Vision -- visual summary (UI state, errors, stack traces in screenshots)
- Log file: Error pattern detection, key line extraction, stack trace parsing
- Video: ffmpeg extracts keyframes (1fps, deduplicated) -> Claude Vision per frame -> timeline

**Screen Recorder:**
- Browser `getDisplayMedia()` API
- Start/Stop UI in the incident form
- Max 60 seconds
- Saves as webm, uploaded on form submit
- ffmpeg processes server-side in Docker container

---

## 5. Context Engineering -- Medusa Knowledge Base

### 5.1 Knowledge Base Structure

```
knowledge-base/
  index.json            # Module registry
  modules/
    cart.md             # Per-module: API routes, models, services, common errors
    order.md
    payment.md
    product.md
    customer.md
    fulfillment.md
    ...
  api-routes.json       # All endpoints: method, path, module, handler file
  error-patterns.json   # Known errors, stack traces, root causes
  architecture.md       # System overview, data flow, tech stack
```

Generated by `build_kb.py` which clones the Medusa repo and uses Claude to summarize each module. Runs as a **pre-build step** (developer runs once, output committed to repo) -- not at Docker build time, to avoid requiring an API key during `docker compose up --build`. Static files, no vector DB.

### 5.2 Triage Agent Tools

| Tool | Purpose |
|------|---------|
| search_modules | Match error/keywords to relevant modules via index.json |
| read_module_docs | Read full summary for a specific module |
| read_source_file | Read a specific file from Medusa repo (path-restricted) |
| search_codebase | Grep-like search for symbol/string across Medusa repo |
| get_api_route | Look up endpoint handler, module, related code |
| get_error_pattern | Match error message against known patterns |

### 5.3 Triage Flow

1. Extract keywords, error codes, API endpoints from incident
2. search_modules -> identify 1-3 candidate modules
3. read_module_docs -> understand module context
4. read_source_file / search_codebase -> drill into specific code
5. Correlate with error_patterns
6. Produce: severity (P1-P4), affected modules, technical summary, code references, runbook steps, confidence score

### 5.4 Severity Criteria

| Level | Criteria | Notification |
|-------|----------|-------------|
| P1 | Payment/checkout down, data loss, security breach | Slack @channel + email immediately |
| P2 | Major feature broken, orders affected | Slack + email |
| P3 | Non-critical feature degraded, workaround exists | Slack, normal queue |
| P4 | Cosmetic, minor UX, enhancement | Ticket only |

---

## 6. Integrations

### 6.1 Linear (Ticketing)

- Real API integration
- Ticket fields: title (with severity prefix), body (full triage report), labels (severity + modules), priority (mapped from P1-P4)
- Webhook on ticket resolution -> triggers reporter notification

### 6.2 Slack (Team Notification)

- Webhook integration
- Block Kit rich messages: severity color bar, summary, ticket link, reporter info
- P1: #incidents-critical with @channel
- P2-P4: #incidents-general

### 6.3 Resend (Email)

- Reporter confirmation email on submission (with ticket link)
- Team notification email (on-call / module owner)
- Resolution email to reporter when ticket marked done

### 6.4 Linear Webhook (Resolution)

- FastAPI endpoint: POST /webhooks/linear
- Listens for ticket status -> "Done"
- Triggers: email to reporter, incident status -> resolved, Langfuse span closed

---

## 7. Security & Guardrails

### Layer 1: Input Validation (Gateway)
- Text: max 5000 chars, HTML/script stripping, prompt injection pattern detection
- Files: size limits, MIME type + magic byte verification, no executables
- Email: format validation, stored hashed

### Layer 2: Prompt Injection Defense (Agents)
- System prompt hardening with explicit role boundaries
- User content wrapped in XML delimiters
- Output validation against expected JSON schema
- Retry on schema deviation

### Layer 3: Tool Use Safety
- Per-agent tool allowlisting (enforced by SDK)
- Parameter bounds checking
- File reads restricted to Medusa repo directory (path traversal prevention)
- No write operations on filesystem
- Max 20 tool calls per triage

### Layer 4: Data Protection
- API keys in environment variables only
- Reporter email hashed in DB
- Langfuse traces scrub PII
- Docker containers run as non-root
- Only required ports exposed (5173, 8000, 3000)

---

## 8. Observability

### 8.1 Langfuse Traces

Every incident gets one trace with nested spans:

```
Trace: incident-{id}
  Span: intake
    - input_validation (duration, pass/fail)
    - file_processing (type, size, duration)
    - multimodal_analysis (model, tokens_in, tokens_out, cost)
    - duplicate_check (result, similarity_score)
  Span: triage
    - module_search (query, results_count)
    - code_analysis (files_read, tokens_used)
    - severity_assignment (level, confidence, reasoning)
    - summary_generation (model, tokens_in, tokens_out, cost)
  Span: routing
    - linear_ticket_create (ticket_id, duration, status)
    - slack_notification (channel, severity, status)
    - email_confirmation (recipient_hash, status)
    - status_update (old -> new)
  Span: resolution
    - webhook_received (source, ticket_id)
    - reporter_notification (status)
```

### 8.2 Metrics

- End-to-end latency (submit -> routed)
- Per-agent latency
- Token usage per incident
- Severity distribution
- Tool call count per triage
- Success/failure rate per stage
- Duplicate detection rate

### 8.3 Structured JSON Logging

All non-LLM stages log structured JSON: timestamp, level, stage, incident_id, action, duration_ms.

---

## 9. Database

### 9.1 Tables

**incidents:** id, status, reporter_email (hashed), reporter_name, title, description, created_at, updated_at

**incident_attachments:** id, incident_id (FK), type (image/log/video), file_path, file_size, mime_type, created_at

**triage_results:** id, incident_id (FK), severity, confidence, summary, affected_modules (JSON), code_references (JSON), runbook_steps (JSON), duplicate_of (FK nullable), created_at

**routing_results:** id, incident_id (FK), linear_ticket_id, linear_ticket_url, slack_message_ts, email_sent, resolved_at, resolution_notified, created_at

### 9.2 State Machine

```
received -> triaging -> triaged -> routed -> resolved
    |           |          |
    +-----------+----------+---> failed
```

Enforced in code. Each transition logged.

---

## 10. Docker Compose

**Services:**
- frontend (React, :5173)
- backend (FastAPI, :8000)
- postgres (PostgreSQL 16)
- langfuse (self-hosted, :3000)
- langfuse-db (separate Postgres for Langfuse)

All services start with `docker compose up --build`. No host dependencies.

---

## 11. Project Structure

```
softserve-agentx/
  docker-compose.yml
  .env.example
  LICENSE (MIT)
  README.md
  AGENTS_USE.md
  SCALING.md
  QUICKGUIDE.md
  frontend/
    Dockerfile
    package.json, vite.config.ts, tailwind.config.ts
    src/
      App.tsx, main.tsx
      components/  (IncidentForm, ScreenRecorder, StatusTracker, IncidentList, SeverityBadge)
      hooks/       (useIncident)
      types/       (incident.ts)
      lib/         (api.ts)
  backend/
    Dockerfile
    pyproject.toml
    src/
      main.py, config.py
      models/      (incident.py, schemas.py)
      api/         (incidents.py, webhooks.py)
      agents/      (intake.py, triage.py, router.py)
      agents/tools/ (codebase.py, linear.py, slack.py, email.py, files.py)
      security/    (validation.py, guardrails.py)
      observability/ (langfuse_client.py, logging.py)
      db/          (database.py, init.sql)
    knowledge-base/
      build_kb.py, index.json, modules/, api-routes.json, error-patterns.json, architecture.md
```

---

## 12. Parallel Execution Strategy

**Phase 0 -- Foundation (45 min, main branch):**
- Scaffold repo structure
- docker-compose.yml + Dockerfiles
- .env.example
- Shared contracts (Pydantic schemas + TypeScript types)
- DB init.sql
- Git init + first commit

**Phase 1 -- Parallel worktrees (8-10 hours):**

| Lane | Worktree | Scope |
|------|----------|-------|
| 1 | frontend | React UI: incident form, screen recorder, status tracker, dashboard |
| 2 | agents | All 3 agents, Medusa KB build script, KB generation, security layer |
| 3 | integrations | Linear, Slack, Resend adapters, webhook receiver, Langfuse setup |

**Phase 2 -- Merge & integration (2 hours):**
- Merge all worktrees to main
- Integration testing: submit incident, verify full E2E flow
- Fix any interface mismatches
- Polish UI, fix edge cases

**Phase 3 -- Documentation & demo (2-3 hours):**
- README.md, AGENTS_USE.md, SCALING.md, QUICKGUIDE.md
- Record 3-min demo video
- Publish to YouTube
- Optional: deploy to Railway

**Buffer: ~2-3 hours** for unexpected issues.

---

## 13. Deliverables Checklist

- [ ] Solution introduction (2-3 paragraphs)
- [ ] Demo video (YouTube, max 3 min, English, #AgentXHackathon)
- [ ] Public Git repo with MIT License
- [ ] README.md
- [ ] AGENTS_USE.md
- [ ] SCALING.md
- [ ] QUICKGUIDE.md
- [ ] docker-compose.yml
- [ ] .env.example
- [ ] Runs with `docker compose up --build`

---

## 14. Evaluation Alignment

| Criterion | How We Address It |
|-----------|-------------------|
| Reliability | 3-agent pipeline with enforced state machine, error handling at each stage, retry logic |
| Observability | Langfuse traces per incident, structured JSON logs, metrics collection, self-hosted dashboard |
| Scalability | Documented in SCALING.md: stateless agents, DB connection pooling, async-ready architecture |
| Context Engineering | Pre-built knowledge base, targeted tool calls, severity-aware depth, documented strategy |
| Security | 4-layer model: input validation, prompt hardening, tool allowlisting, data protection + evidence |
| Documentation | All required files + AGENTS_USE.md with architecture diagrams, evidence screenshots, lessons learned |
