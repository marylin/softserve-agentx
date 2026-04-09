# AgentX SRE Triage Agent

[![CI - Build & Test](https://github.com/marylin/softserve-agentx/actions/workflows/ci.yml/badge.svg)](https://github.com/marylin/softserve-agentx/actions/workflows/ci.yml)

Manual SRE triage takes 15-30 minutes on average -- reading the report, searching the codebase, classifying severity, filing a ticket, and pinging the right team. AgentX reduces this to under 30 seconds. From incident report to triaged Linear ticket with severity classification, codebase analysis, runbook steps, and team notifications across Slack and email -- fully autonomous, no human in the loop.

## Key Metrics

| Metric | Value |
|--------|-------|
| Pipeline time (end-to-end) | 15-45 seconds |
| Cost per incident | ~$0.04-0.12 (Claude Sonnet) |
| Agents | 3 specialized (Intake, Triage, Router) + auto-escalation background task |
| Codebase tools | 6 autonomous investigation tools |
| Knowledge base | 10 modules, 54 API routes, 30 error patterns |
| Automated tests | 62 passing |
| Integrations | Linear + Slack + Resend (all real, not mocked) |
| Multimodal inputs | Text, screenshots, screen recordings, log files |
| Frontend views | 5 (Report, Incidents, Detail/Tracker, Metrics, Health) |

## Architecture

```
                          +------------------+
                          |   React + Vite   |
                          |   Frontend UI    |
                          |  (port 5173)     |
                          +--------+---------+
                                   |
                             HTTP / REST
                                   |
                          +--------v---------+
                          |    FastAPI        |
                          |    Backend        |
                          |  (port 8000)     |
                          +--------+---------+
                                   |
                    +--------------+--------------+
                    |              |              |
             +------v------+ +----v------+ +----v------+
             |   Intake    | |  Triage   | |  Router   |
             |   Agent     | |  Agent    | |  Agent    |
             |             | |           | |           |
             | - Vision    | | - Code    | | - Linear  |
             | - Log parse | |   search  | | - Slack   |
             | - Video     | | - KB docs | | - Email   |
             |   frames    | | - Error   | |           |
             |             | |   patterns| |           |
             +------+------+ +----+------+ +----+------+
                    |              |              |
                    +--------------+--------------+
                                   |
                          +--------v---------+
                          |   PostgreSQL 16   |
                          |   State Store     |
                          +------------------+
                                   |
                          +--------v---------+
                          |    Langfuse       |
                          |  Observability    |
                          +------------------+
```

## Tech Stack

| Layer          | Technology                                |
|----------------|-------------------------------------------|
| Frontend       | React 19, TypeScript, Vite, Tailwind CSS  |
| Backend        | Python 3.12, FastAPI, SQLAlchemy (async)  |
| LLM            | Anthropic Claude Sonnet (via SDK)         |
| LLM Alt        | OpenRouter (multi-model support)           |
| Database       | PostgreSQL 16 (Alpine)                    |
| Ticketing      | Linear (GraphQL API)                      |
| Notifications  | Slack (Incoming Webhooks), Resend (Email) |
| Observability  | Langfuse (traces, generations, spans)     |
| Logging        | structlog (JSON structured logs)          |
| Infrastructure | Docker Compose                            |
| Validation     | Pydantic v2, pydantic-settings            |

## Project Structure

```
softserve-agentx/
  docker-compose.yml          # Multi-service orchestration
  .env.example                # All configuration with setup links
  frontend/
    src/App.tsx                # Nav tabs, view routing (form/list/detail/metrics/health)
    src/components/
      IncidentForm.tsx         # Report form: AI suggest, voice input, component picker, attachments
      IncidentList.tsx         # Search, filter, age column, SLA breach highlighting, export
      StatusTracker.tsx        # SLA countdown, timeline, similar incidents, confidence labels, retry, cost
      MetricsDashboard.tsx     # KPI cards, severity/status/component distribution charts
      ComponentHealth.tsx      # Health grid per affected area, disclaimers
      ScreenRecorder.tsx       # In-browser screen recording
      SeverityBadge.tsx        # Shared severity badge component
  backend/
    agent-config.yaml          # Team-configurable severity, SLA, routing, areas, agent limits
    src/agents/                # Intake, Triage, Router agents
    src/agents/tools/          # Linear (state mapping, labels, auto-assign), Slack, Resend, codebase
    src/api/incidents.py       # CRUD, retry, suggest, config/areas, similar incidents, attachments
    src/api/metrics.py         # Metrics endpoint (status, severity, component distributions)
    src/api/escalation.py      # Auto-escalation background task (SLA breach detection)
    src/api/webhooks.py        # Linear webhook handler
    src/agent_config.py        # YAML config loader
    src/security/              # Input validation, prompt injection defense
    src/observability/         # Langfuse tracing, structured logging
    knowledge-base/            # Pre-built Medusa.js module docs, API routes, error patterns
    medusa-subset/             # Curated source code for agent analysis
    tests/                     # 62 tests (security, state machine, parsing)
```

## Features

### Agent Pipeline
- **Three-agent sequential pipeline** -- Intake (extraction), Triage (severity + investigation), Router (ticketing + notifications)
- **Codebase-aware triage** -- the Triage Agent searches a Medusa.js knowledge base, reads source files, matches error patterns, and looks up API routes
- **Severity scoring with confidence** -- P1-P4 classification with a 0-1 confidence score, color-coded confidence labels (High / Moderate / Low)
- **Duplicate detection** -- the Intake Agent compares new reports against the 20 most recent open incidents
- **Auto-escalation** -- background task checks SLA breaches every 60 seconds; breached incidents are escalated one severity level (P4->P3->P2->P1) with Slack notification
- **Smart state routing** -- Linear tickets auto-placed in the correct workflow state (P1 -> In Progress, P2 -> Todo, P3/P4 -> Backlog)
- **Severity labels** -- Linear tickets tagged with color-coded labels (P1-Critical, P2-High, P3-Medium, P4-Low) and Bug label
- **Auto-assign Linear** -- P1/P2 tickets auto-assigned to the default assignee configured via `LINEAR_DEFAULT_ASSIGNEE_ID`
- **Team-configurable agent-config.yaml** -- severity criteria, SLA thresholds, notification routing, affected areas, and agent limits all editable without code changes

### Incident Reporting
- **Multimodal incident input** -- text descriptions, screenshots (PNG/JPEG/WebP/GIF), log files (.log/.txt), and screen recordings (WebM/MP4)
- **In-browser screen recorder** -- capture a 60-second screen recording directly from the incident form
- **AI-assisted description writing** -- click "AI Suggest" to generate a structured incident report from the title and affected area
- **Voice-to-text input** -- dictate incident descriptions using the browser's Web Speech API
- **Component picker** -- dropdown of affected areas (loaded from agent-config.yaml) enables component health tracking
- **Description quality guidance** -- real-time feedback on description length and detail level

### Frontend Views
- **Incident list** -- search by title, filter by severity/status, SLA breach age highlighting, JSON export
- **Status tracker** -- step-by-step progress indicator, SLA countdown timer (live, with breach animation), incident timeline with durations, estimated cost per triage
- **Similar incidents** -- related incidents surfaced by shared affected modules
- **Metrics dashboard** -- KPI cards (total incidents, avg confidence, resolution rate, failure rate), severity/status/component distribution charts
- **Component health grid** -- per-component health status (healthy/degraded/impacted/critical) derived from open incidents, with disclaimers about data source
- **Browser notifications** -- desktop notifications on triage completion and routing completion
- **Retry failed incidents** -- one-click retry for failed triage from the status tracker

### Platform
- **Real integrations** -- Linear tickets (with priority mapping), Slack notifications (with severity-based channel routing and @channel for P1), email via Resend
- **Graceful degradation** -- every integration is optional; missing API keys result in a "skipped" status, not a pipeline failure
- **Security guardrails** -- prompt injection detection, input length limits, file type/size validation, XML trust boundaries, path traversal protection, tool call limits
- **Full observability** -- Langfuse traces per incident, per-agent spans, generation logging with token usage, structured JSON logs
- **State machine** -- incidents progress through `received -> triaging -> triaged -> routed -> resolved` with validated transitions and a `failed` terminal state

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/marylin/softserve-agentx.git
cd softserve-agentx

# 2. Copy the environment file
cp .env.example .env

# 3. Fill in your API keys (at minimum, ANTHROPIC_API_KEY)
#    See QUICKGUIDE.md for links to get each key

# 4. Start all services
docker compose up --build

# 5. Open the UI
#    http://localhost:5173
```

See [QUICKGUIDE.md](QUICKGUIDE.md) for detailed setup instructions including API key links and troubleshooting.

## Screenshots

See demo video.

## How It Works

1. **Submit** -- A user fills out the incident form in the React frontend: title, description (with optional AI Suggest or voice-to-text), affected area (component picker), and optional attachments (screenshots, screen recordings, log files). The form posts to the FastAPI backend via multipart upload.

2. **Persist** -- The backend validates all inputs (text length, file types, file sizes, prompt injection checks), saves the incident to PostgreSQL with status `received`, and stores attachments on disk.

3. **Intake Agent** -- The pipeline starts. The Intake Agent receives the raw report as a multimodal message (text + base64 images + extracted video frames + parsed log excerpts). It enriches the description, extracts error messages, affected services, timestamps, and URLs. It also checks for duplicates against open incidents. Output: structured `IntakeResult`.

4. **Triage Agent** -- Receives the `IntakeResult` and investigates the Medusa.js codebase using six tools: `search_modules`, `read_module_docs`, `read_source_file`, `search_codebase`, `get_api_route`, and `get_error_pattern`. It assigns a severity level (P1-P4) with a confidence score, identifies affected modules, provides code references with file paths and line numbers, and generates runbook steps. Output: structured `TriageResult`.

5. **Router Agent** -- Receives the `TriageResult` and creates a Linear ticket (with severity-mapped priority, state routing, severity labels, and auto-assignment for P1/P2), sends a Slack notification (P1 to the critical channel with @channel, P2-P4 to the general channel), and sends email notifications via Resend (reporter always, on-call team for P1). Output: structured `RoutingResult`.

6. **Track** -- The frontend polls the incident status every 3 seconds and renders a live progress tracker with SLA countdown timer, incident timeline with step durations, confidence labels, estimated cost, and similar incidents. Browser notifications fire on triage and routing completion.

7. **Monitor** -- The Metrics dashboard shows KPIs (total incidents, avg confidence, resolution/failure rates) and distribution charts. The Component Health view shows per-area health status. The auto-escalation background task checks for SLA breaches every 60 seconds and escalates severity automatically.

## Live Demo

- **Frontend:** https://ssagentx.up.railway.app
- **Backend API:** https://ssagentx-b.up.railway.app
- **Slack workspace:** [Join ss-agentx](https://join.slack.com/t/ss-agentx/shared_invite/zt-3uykoe9oh-Y~eBDCd8QPs3Y6ipjaSFQw)

## Related Documentation

- [AGENTS_USE.md](AGENTS_USE.md) -- Detailed agent documentation (hackathon submission format)
- [SCALING.md](SCALING.md) -- Scaling strategy and assumptions
- [QUICKGUIDE.md](QUICKGUIDE.md) -- Step-by-step setup guide

## License

MIT
