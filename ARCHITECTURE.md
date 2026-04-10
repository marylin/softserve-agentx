# Architecture

Comprehensive technical architecture for AgentX SRE Triage Agent.

---

## 1. System Overview

```
  User Browser                                       External Services
  +----------------+                                 +----------------+
  | React + Vite   |                                 | Linear (GQL)   |
  | TypeScript      |    HTTP/REST                   | Slack (Webhook) |
  | Tailwind CSS   | ---------------+                | Resend (Email)  |
  | (port 5173)    |                |                | Langfuse (Trace)|
  +----------------+                |                +-------+--------+
                                    v                        ^
                           +------------------+              |
                           |    FastAPI        |  Tool calls  |
                           |    Python 3.12   +--------------+
                           |    (port 8000)    |
                           +--------+---------+
                                    |
                    +---------------+---------------+
                    |               |               |
             +------v------+ +-----v-----+ +------v------+
             |   Intake    | |  Triage   | |   Router    |
             |   Agent     | |  Agent    | |   Agent     |
             |             | |           | |             |
             | Vision      | | 6 tools   | | Linear      |
             | Log parse   | | KB search | | Slack       |
             | Video frames| | Code read | | Email       |
             +------+------+ +-----+-----+ +------+------+
                    |               |               |
                    +---------------+---------------+
                                    |
                           +--------v---------+
                           |  PostgreSQL 16    |
                           |  State + Results  |
                           +------------------+
```

### Component Summary

| Component | Technology | Role |
|-----------|-----------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS | Incident reporting UI, status tracking, metrics dashboard |
| Backend API | Python 3.12, FastAPI, Uvicorn | REST API, input validation, pipeline orchestration |
| Intake Agent | Claude Sonnet via Anthropic SDK | Multimodal analysis, detail extraction, duplicate detection |
| Triage Agent | Claude Sonnet via Anthropic SDK | Codebase investigation, severity classification, runbook generation |
| Router Agent | Claude Sonnet via Anthropic SDK | Ticket creation, Slack/email notifications |
| Database | PostgreSQL 16 (Alpine) | Incident state, triage results, routing results, attachments |
| Observability | Langfuse (cloud or self-hosted) | Per-incident traces, per-agent spans, generation logging |
| Logging | structlog (JSON) | Structured event logs with incident IDs and token counts |
| Infrastructure | Docker Compose | Multi-service orchestration with health checks |

---

## 2. Agent Pipeline Design

### Sequential Pipeline

```
POST /api/incidents
        |
        v
  Save to DB (status: received)
        |
        v  BackgroundTask
  +-----+-----+     +-----+-----+     +-----+-----+
  |   Intake   | --> |   Triage  | --> |   Router  |
  |   Agent    |     |   Agent   |     |   Agent   |
  +-----+-----+     +-----+-----+     +-----+-----+
        |                 |                 |
   IntakeResult      TriageResult     RoutingResult
   (Pydantic)        (Pydantic)       (Pydantic)
```

The orchestrator in `backend/src/agents/orchestrator.py` runs all three agents in strict sequence via `run_pipeline()`. Each agent is executed through `asyncio.to_thread()` because the Anthropic SDK uses synchronous HTTP calls; this prevents blocking the async event loop.

### Why Sequential (Not Parallel)

1. **Data dependencies** -- Each agent's input depends on the previous agent's output. The Triage Agent needs the Intake Agent's extracted details. The Router Agent needs the Triage Agent's severity classification to set ticket priority and choose the Slack channel.
2. **Debuggability** -- One incident = one linear execution path = one Langfuse trace with ordered spans. When something fails, the entire chain is readable top to bottom.
3. **Trace linearity** -- Langfuse spans nest cleanly: intake (6-8s) -> triage (10-15s) -> router (3-5s). Parallel execution would create overlapping spans that are harder to diagnose.
4. **State machine integrity** -- The incident status progresses `received -> triaging -> triaged -> routed` with validated transitions. Parallel agents would require complex concurrent state management.

### Agent Communication: Pydantic Contracts

Agents communicate through typed Pydantic models passed directly in memory (no serialization between stages):

- **IntakeResult** -- cleaned title, enriched description, extracted details (error messages, affected services, timestamps, URLs, environment), visual summary, log analysis, video timeline, duplicate_of ID
- **TriageResult** -- severity (P1-P4), confidence (0.0-1.0), technical summary, affected modules, code references (file + line + context), runbook steps
- **RoutingResult** -- Linear ticket ID/URL, Slack message timestamp, email sent status

If an agent's JSON output fails to parse, a fallback result is constructed with conservative defaults (P3 severity, 0.3 confidence) rather than failing the pipeline.

### Tool-Use Loop

The base agent loop in `backend/src/agents/base.py` implements the standard Anthropic tool-use pattern:

```
1. Send message to Claude with system prompt + tools
2. Receive response
3. If response contains tool_use blocks:
   a. Execute each tool via registered handler
   b. Append assistant message + tool results to conversation
   c. Go to step 1
4. If stop_reason is end_turn or no tool calls:
   Return final text response
```

Safety mechanisms in the loop:
- **Max iterations**: 30 (raises `RuntimeError` if exceeded)
- **Max tool calls**: 20 per agent run (via `ToolCallCounter`)
- **API retry**: 3 attempts with exponential backoff (1s, 2s, 4s) for rate limits, timeouts, and connection errors
- **Tool errors**: Return JSON `{"error": "..."}` to the LLM rather than crashing the loop

---

## 3. State Machine

### Incident Status Transitions

```
                         +----------+
                    +--->| received |---+
                    |    +-----+----+   |
                    |          |        |
                    |          v        |
                    |    +----------+   |
                    |    | triaging |---+
                    |    +-----+----+   |
                    |          |        |
                    |          v        |
                    |    +----------+   |
                    |    | triaged  |---+
                    |    +-----+----+   |
                    |          |        |
                    |          v        |
                    |    +----------+   |
                    |    |  routed  |---+
                    |    +-----+----+   |
                    |          |        |
                    |          v        v
                    |    +----------+  +--------+
                    |    | resolved |  | failed |
                    |    +----------+  +--------+
                    |     (terminal)   (terminal)
```

### Transition Rules

Defined in `backend/src/models/incident.py`:

```python
VALID_TRANSITIONS = {
    "received": {"triaging", "failed"},
    "triaging": {"triaged", "failed"},
    "triaged": {"routed", "failed"},
    "routed": {"resolved", "failed"},
    "resolved": set(),   # terminal
    "failed": set(),     # terminal
}
```

- Forward-only: no skipping states (`received` cannot jump to `triaged`)
- Any active state can transition to `failed`
- `resolved` and `failed` are terminal -- no further transitions
- `validate_transition()` is called before every status change in the orchestrator

### How Status Drives the UI

The frontend polls `GET /api/incidents/:id` every 3 seconds. Each status maps to a visual state in the StatusTracker component:

| Status | UI Behavior |
|--------|------------|
| `received` | Step 1 active, "Processing..." indicator |
| `triaging` | Step 2 active, intake results shown |
| `triaged` | Step 3 active, severity badge + confidence + affected modules visible |
| `routed` | All steps complete, Linear ticket link + Slack/email confirmations shown |
| `resolved` | Resolved badge, SLA timer frozen, resolution timestamp shown |
| `failed` | Error state with retry button |

The SLA countdown timer runs live based on the incident's `created_at` timestamp and the SLA threshold for its severity level. It turns red and pulses when breached.

---

## 4. Context Engineering Strategy

### Pre-Built Knowledge Base (Not RAG)

The Triage Agent investigates a Medusa.js codebase using a structured knowledge base stored as static files:

```
backend/knowledge-base/
  index.json           # Module index (10 modules, searchable)
  modules/*.md         # Per-module documentation
  api-routes.json      # 54 API route definitions
  error-patterns.json  # 30 known error patterns with fixes
backend/medusa-subset/
  packages/...         # Curated source code files
```

**Why static files over vector DB:**
- The Medusa.js codebase is bounded and well-organized -- no need for fuzzy semantic search
- Tool-based lookup provides deterministic, reproducible results
- No embedding model or vector store infrastructure to maintain
- The agent drives its own investigation, choosing tools based on what it learns at each step

### 6 Triage Agent Tools

| Tool | Purpose | Constraints |
|------|---------|-------------|
| `search_modules` | Keyword search over module index | Returns matched module names |
| `read_module_docs` | Read module documentation | Capped at 5,000 characters |
| `read_source_file` | Read a specific source file | Capped at 500 lines, path-traversal protected |
| `search_codebase` | Grep with file pattern filtering | 10-second subprocess timeout |
| `get_api_route` | Look up route by HTTP method + path | Matches against api-routes.json |
| `get_error_pattern` | Match error message to known patterns | Returns known issue + fix if matched |

### Investigation Flow

The agent autonomously narrows scope through progressive discovery:

```
1. search_modules("cart checkout error")
   -> Identifies "cart" and "checkout" modules

2. read_module_docs("cart")
   -> Understands cart behavior, configuration, dependencies

3. search_codebase("CartService", "*.ts")
   -> Finds relevant source files

4. read_source_file("packages/medusa/src/services/cart.ts")
   -> Reads actual implementation code

5. get_error_pattern("500 Internal Server Error")
   -> Matches against known patterns

6. get_api_route("POST", "/store/cart")
   -> Finds the route handler for correlation
```

### Token Management

| Source | Limit | Rationale |
|--------|-------|-----------|
| Source file reads | 500 lines per file | Prevents single large file from consuming context |
| Module documentation | 5,000 characters | Keeps docs concise |
| Log file processing | 200 lines (100 error-priority) | Error lines surfaced first |
| Video frame extraction | 10 frames max | Bounds vision token cost |
| Open incident descriptions | 300 characters each | Enough for duplicate matching |
| Router description input | 2,000 characters | Ticket creation doesn't need full detail |
| LLM response cap | 4,096 tokens | Prevents runaway generation |
| Langfuse I/O logging | 2,000 characters | Keeps trace storage bounded |

---

## 5. Integration Architecture

### Linear (Ticketing)

- **Protocol**: GraphQL API via `httpx`
- **Authentication**: `LINEAR_API_KEY` (Bearer token)
- **Features**:
  - Ticket creation with severity-mapped priority (P1=1/Urgent, P2=2/High, P3=3/Medium, P4=4/Low)
  - Smart state routing: P1 -> In Progress, P2 -> Todo, P3/P4 -> Backlog
  - Severity labels: color-coded (P1-Critical red, P2-High orange, P3-Medium yellow, P4-Low blue) + Bug label
  - Auto-assign: P1/P2 tickets assigned to `LINEAR_DEFAULT_ASSIGNEE_ID`
- **Webhook**: `POST /webhooks/linear` receives state change events -> triggers resolution flow when ticket moves to Done/Cancelled

### Slack (Notifications)

- **Protocol**: Incoming Webhooks with Block Kit JSON
- **Channels**:
  - `SLACK_WEBHOOK_CRITICAL` -- P1 incidents with `@channel` mention
  - `SLACK_WEBHOOK_GENERAL` -- P2/P3/P4 incidents
- **Format**: Block Kit with severity badge, title, summary, ticket link, reporter
- **Escalation alerts**: Auto-escalation task sends `[ESCALATED]` messages with SLA breach details

### Resend (Email)

- **Protocol**: REST API via `resend` Python SDK
- **Templates**: Styled HTML with teal branding, triage card (severity, confidence, modules, runbook)
- **Routing**:
  - Reporter always receives notification
  - On-call team (`RESEND_TEAM_EMAIL`) notified for P1 incidents
  - Resolution emails sent when Linear ticket reaches Done state
- **From address**: Configurable via `RESEND_FROM_EMAIL`

### Langfuse (Observability)

- **Architecture**: One trace per incident, three nested spans (intake, triage, router)
- **Generations**: Logged per LLM call with model name, truncated I/O (2,000 chars), token usage
- **Events**: Tool calls, pipeline errors recorded as span events
- **Graceful degradation**: `_NoOp` stub absorbs all calls when Langfuse is disabled or unavailable
- **Hosting**: Langfuse Cloud (default) or self-hosted via `docker compose --profile self-hosted`

### Webhook Flow (Linear -> Resolution)

```
Linear ticket state changes
        |
        v
POST /webhooks/linear
        |
        v
Verify LINEAR_WEBHOOK_SECRET
        |
        v
If state = "Done" or "Cancelled":
  1. Find routing_result by linear_ticket_id
  2. Set resolved_at timestamp
  3. Transition incident status to "resolved"
  4. Send resolution email (if not already notified)
```

### Graceful Degradation

Every integration is optional. Missing API keys result in `{"status": "skipped"}` -- the pipeline continues without that integration. This means the core triage value (severity classification, codebase analysis, runbook steps) works even with zero integrations configured.

---

## 6. Security Architecture

### 4-Layer Defense Model

```
  Untrusted Input
        |
        v
+-------+--------+    Layer 1: Input Validation
| Text limits     |    - Max length (10,000 chars)
| HTML stripping  |    - HTML tag removal
| Unicode norm    |    - NFC normalization, zero-width char removal
| File validation |    - MIME type + extension allowlist, size limits
| Email check     |    - Pydantic EmailStr
+-------+--------+
        |
        v
+-------+--------+    Layer 2: Prompt Injection Defense
| 10 regex checks |    - "ignore previous instructions", "ADMIN OVERRIDE", etc.
| XML boundaries  |    - <user_input> tags around all user content
| System prompts  |    - Focused role boundaries per agent
| Output parsing  |    - JSON schema validation with safe fallbacks
+-------+--------+
        |
        v
+-------+--------+    Layer 3: Tool Use Safety
| Allowlisting    |    - Each agent only accesses its registered tools
| Call counter    |    - ToolCallCounter: max 20 per agent run
| Max iterations  |    - 30 iteration cap with RuntimeError
| Path traversal  |    - sanitize_path with os.path.realpath
| Subprocess cap  |    - 10s grep timeout, 30s ffmpeg timeout
| Read limits     |    - 500 lines per file read
+-------+--------+
        |
        v
+-------+--------+    Layer 4: Data Protection
| Env vars only   |    - All API keys via pydantic-settings
| Non-root Docker |    - Containers run as non-root user
| No PII in logs  |    - Incident IDs only, no descriptions
| I/O truncation  |    - Langfuse inputs/outputs capped at 2,000 chars
| Minimal ports   |    - Only 5173, 8000, 3000 exposed
+-------+--------+
```

See [SECURITY.md](SECURITY.md) for the full security document.

---

## 7. Background Services

### Auto-Escalation Loop

Defined in `backend/src/api/escalation.py`, started at application boot as an `asyncio` background task:

```
Every 60 seconds:
  1. Query all incidents in "triaged" or "routed" status
  2. Join with triage_results to get current severity
  3. For each incident:
     a. Look up SLA threshold for its severity (from agent-config.yaml)
     b. Calculate elapsed time since created_at
     c. If elapsed > SLA and severity is not already P1:
        - Bump severity one level (P4->P3->P2->P1)
        - Commit to database
        - Send Slack notification with escalation details
```

SLA thresholds (configurable in `agent-config.yaml`):

| Severity | SLA | Escalates To |
|----------|-----|--------------|
| P1 | 15 minutes | -- (already highest) |
| P2 | 60 minutes | P1 |
| P3 | 240 minutes (4h) | P2 |
| P4 | 1,440 minutes (24h) | P3 |

### Pipeline Background Tasks

The agent pipeline runs as a FastAPI `BackgroundTask`. The API endpoint:
1. Validates inputs and saves the incident to PostgreSQL
2. Returns the incident ID immediately (HTTP 201)
3. Starts `run_pipeline()` as a background task

This allows the frontend to begin polling for status updates immediately while the pipeline executes asynchronously.

---

## 8. Configuration

### agent-config.yaml

Located at `backend/agent-config.yaml`. Editable without code changes -- restart the backend to apply.

| Section | What It Controls |
|---------|-----------------|
| `severity_criteria` | P1-P4 definitions injected into the Triage Agent's system prompt |
| `sla_minutes` | SLA thresholds per severity (used by auto-escalation) |
| `routing` | Slack channel mapping, auto-assign severity levels, email team triggers |
| `affected_areas` | Dropdown options in the incident form (loaded via `/api/config/areas`) |
| `agent_settings` | max_tool_calls, max_iterations, max_file_read_lines, max_log_lines, max_video_frames |
| `codebase` | Knowledge base metadata (name, version, module list) |

### Environment Variables

All secrets and deployment configuration are environment variables loaded via `pydantic-settings`. See `.env.example` for the full list.

| Category | Variables |
|----------|----------|
| LLM | `LLM_PROVIDER`, `ANTHROPIC_API_KEY`, `LLM_MODEL`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| Database | `DATABASE_URL`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` |
| Linear | `LINEAR_API_KEY`, `LINEAR_TEAM_ID`, `LINEAR_WEBHOOK_SECRET`, `LINEAR_DEFAULT_ASSIGNEE_ID` |
| Slack | `SLACK_WEBHOOK_CRITICAL`, `SLACK_WEBHOOK_GENERAL` |
| Email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_TEAM_EMAIL` |
| Langfuse | `LANGFUSE_ENABLED`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_HOST` |
| Paths | `UPLOAD_DIR`, `MEDUSA_REPO_PATH`, `KNOWLEDGE_BASE_PATH`, `FRONTEND_URL` |

---

## 9. Data Model

### Tables

```
incidents                    incident_attachments
+------------------+         +---------------------+
| id (UUID PK)     |<---+    | id (UUID PK)        |
| status (enum)    |    |    | incident_id (FK)     |
| reporter_email   |    |    | type (enum)          |
| reporter_name    |    |    | file_path            |
| title            |    |    | file_size            |
| description      |    |    | mime_type            |
| created_at       |    |    | original_filename    |
| updated_at       |    |    | created_at           |
+------------------+    |    +---------------------+
       ^                |
       |                |    triage_results
       |                |    +---------------------+
       +----------------+----| id (UUID PK)        |
       |                     | incident_id (FK)     |
       |                     | severity (enum)      |
       |                     | confidence (float)   |
       |                     | summary              |
       |                     | affected_modules (JSONB) |
       |                     | code_references (JSONB)  |
       |                     | runbook_steps (JSONB)|
       |                     | duplicate_of (FK)    |
       |                     | created_at           |
       |                     +---------------------+
       |
       |                routing_results
       |                +---------------------+
       +----------------| id (UUID PK)        |
                        | incident_id (FK)     |
                        | linear_ticket_id     |
                        | linear_ticket_url    |
                        | slack_message_ts     |
                        | email_sent (bool)    |
                        | resolved_at          |
                        | resolution_notified  |
                        | created_at           |
                        +---------------------+
```

### Enums

- **incident_status**: `received`, `triaging`, `triaged`, `routed`, `resolved`, `failed`
- **severity_level**: `P1`, `P2`, `P3`, `P4`
- **attachment_type**: `image`, `log`, `video`

### Indexes

| Index | Table | Column(s) | Purpose |
|-------|-------|-----------|---------|
| `idx_incidents_status` | incidents | status | Filter by pipeline state |
| `idx_incidents_created` | incidents | created_at DESC | Sort by recency |
| `idx_triage_incident` | triage_results | incident_id | Join incident to triage |
| `idx_routing_incident` | routing_results | incident_id | Join incident to routing |
| `idx_routing_linear` | routing_results | linear_ticket_id | Webhook lookup by ticket ID |

### Relationships

- `incidents` 1:N `incident_attachments` (CASCADE delete)
- `incidents` 1:1 `triage_results` (CASCADE delete)
- `incidents` 1:1 `routing_results` (CASCADE delete)
- `triage_results.duplicate_of` -> `incidents.id` (self-referential FK)

---

## 10. Technology Decisions

| Decision | Options Considered | Choice | Rationale |
|----------|-------------------|--------|-----------|
| LLM | GPT-4o, Claude Sonnet, Gemini, Llama | Claude Sonnet 4 | Best reasoning quality for code analysis tasks; native tool-use support; vision capabilities for screenshots |
| LLM framework | LangChain, CrewAI, AutoGen, raw SDK | Anthropic SDK directly | Lightweight, no framework overhead, full control over the tool-use loop, no abstraction leaks |
| API framework | Flask, Django, Express, FastAPI | FastAPI | Native async, automatic OpenAPI docs, Pydantic integration for type-safe request/response models |
| Database | SQLite, MongoDB, Supabase, PostgreSQL | PostgreSQL 16 | JSONB for flexible triage data, native enums for status/severity, production-grade reliability, indexed queries |
| Frontend | Next.js, SvelteKit, React+Vite | React 19 + Vite + Tailwind | Fast HMR, TypeScript strict mode, dark mode via Tailwind, no SSR complexity needed for a dashboard app |
| Observability | OpenTelemetry, Datadog, custom logging | Langfuse + structlog | Langfuse is LLM-native (traces/spans/generations map to agent calls), self-hostable; structlog provides structured JSON logs |
| Knowledge base | RAG (embeddings + vector DB), fine-tuning | Static files + tool-based search | Bounded codebase makes RAG overhead unnecessary; deterministic tool results are reproducible and debuggable |
| Pipeline model | Event-driven, supervisor pattern, DAG | Sequential (Intake->Triage->Router) | Matches the actual incident lifecycle; each stage depends on the previous; simplest to debug and trace |
| Integration approach | Required integrations, plugin system | Optional with graceful degradation | Every integration skippable via missing API key; core triage works standalone; dramatically easier to develop and test |
| Container orchestration | Kubernetes, ECS, Docker Compose | Docker Compose | Appropriate for single-instance deployment; all services in one file; easy local development |
