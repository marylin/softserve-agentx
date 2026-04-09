# AGENTS_USE.md

## 1. Agent Overview

**Agent Name:** AgentX SRE Triage Agent

**Purpose:** AgentX automates incident intake, severity triage, and routing for Medusa.js e-commerce platforms. When an SRE or developer submits an incident report -- including text, screenshots, screen recordings, or log files -- the system runs a three-agent pipeline that extracts technical details, investigates the codebase to assess severity, and routes the incident to Linear, Slack, and email. The goal is to reduce mean time to acknowledgement (MTTA) by eliminating manual triage and ensuring every incident gets a severity classification, a tracked ticket, and the right team notifications within seconds of submission.

**Tech Stack:** Python 3.12, FastAPI, SQLAlchemy (async), React 19, TypeScript, Vite, Tailwind CSS, Anthropic Claude Sonnet (via the Anthropic Python SDK), PostgreSQL 16, Docker Compose, Langfuse, structlog

---

## 2. Agents & Capabilities

### Agent: Intake Agent

| Field | Description |
|-------|-------------|
| **Role** | Analyzes raw incident reports, extracts structured technical details, processes multimodal inputs (images, logs, video), and detects potential duplicate incidents. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4 (configurable: Anthropic direct or OpenRouter) |
| **Inputs** | Incident title (text), description (text), image attachments (base64-encoded PNG/JPEG/WebP/GIF), log files (error-prioritized, capped at 200 lines), video recordings (up to 10 frames extracted via ffmpeg), list of up to 20 open incidents for duplicate matching. |
| **Outputs** | `IntakeResult` -- cleaned title, enriched description, extracted details (error messages, affected services, timestamps, URLs, environment), visual summary, log analysis, video timeline, and duplicate incident ID (if detected). |
| **Tools** | None (pure vision + text analysis). Uses `process_image`, `process_log`, and `extract_video_frames` for preprocessing, but no LLM tool calls. |

### Agent: Triage Agent

| Field | Description |
|-------|-------------|
| **Role** | Investigates the Medusa.js codebase based on the intake results, determines severity (P1-P4) with a confidence score, identifies affected modules, finds code references, and generates runbook steps. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4 (configurable: Anthropic direct or OpenRouter) |
| **Inputs** | `IntakeResult` from the Intake Agent -- cleaned title, enriched description, extracted details, visual summary, log analysis, video timeline. |
| **Outputs** | `TriageResult` -- severity level (P1/P2/P3/P4), confidence score (0.0-1.0), technical summary, list of affected modules, code references (file path + line number + context), and ordered runbook steps. |
| **Tools** | `search_modules` (keyword search over module index), `read_module_docs` (read module documentation), `read_source_file` (read repo files, capped at 500 lines), `search_codebase` (grep with file pattern filtering), `get_api_route` (HTTP method + path lookup), `get_error_pattern` (match against known error patterns). |

### Agent: Router Agent

| Field | Description |
|-------|-------------|
| **Role** | Creates a Linear ticket, sends Slack notifications to the appropriate channel, and sends email notifications via Resend. Executes these in a defined order so the ticket URL can be included in notifications. |
| **Type** | Autonomous |
| **LLM** | Claude Sonnet 4 (configurable: Anthropic direct or OpenRouter) |
| **Inputs** | `TriageResult` from the Triage Agent, original incident title, description, reporter email, and reporter name. |
| **Outputs** | `RoutingResult` -- Linear ticket ID, Linear ticket URL, Slack message timestamp, and email sent status. |
| **Tools** | `create_linear_ticket` (Linear GraphQL API, severity-mapped priority), `send_slack_notification` (incoming webhook with Block Kit formatting, P1 to critical channel with @channel mention, P2-P4 to general channel), `send_email` (Resend API, HTML body, reporter + on-call team for P1). |

---

## 3. Architecture & Orchestration

### Architecture Diagram

```
  User Browser (React)
        |
        | POST /api/incidents (multipart)
        v
  FastAPI Backend -----> PostgreSQL (state, results)
        |
        | run_pipeline(incident_id)
        |
        v
  +--[Intake Agent]--+
  | Multimodal input  |     No tool calls.
  | Vision + text     |     Preprocesses images/logs/video
  | Duplicate check   |     before sending to Claude.
  +-------+-----------+
          | IntakeResult (Pydantic model)
          v
  +--[Triage Agent]---+
  | Codebase search    |    Up to 20 tool calls:
  | Module docs        |    search_modules, read_module_docs,
  | Error patterns     |    read_source_file, search_codebase,
  | Source file reads   |    get_api_route, get_error_pattern
  +-------+-----------+
          | TriageResult (Pydantic model)
          v
  +--[Router Agent]---+
  | Linear ticket      |    Up to 20 tool calls:
  | Slack notify       |    create_linear_ticket,
  | Email notify       |    send_slack_notification,
  +-------+-----------+    send_email
          | RoutingResult (Pydantic model)
          v
  PostgreSQL (incident status -> "routed")
```

### Orchestration Approach

**Sequential pipeline.** The orchestrator (`run_pipeline` in `orchestrator.py`) runs all three agents in strict sequence: Intake -> Triage -> Router. Each agent is executed via `asyncio.to_thread()` to avoid blocking the async event loop, since the Anthropic SDK uses synchronous HTTP calls. The pipeline is triggered as a background task after the initial HTTP response returns the incident ID to the user.

### State Management

**PostgreSQL.** The incident record tracks status through a validated state machine:

```
received -> triaging -> triaged -> routed -> resolved
    |           |           |         |
    +-----+-----+-----+-----+---------+
          |
        failed
```

Each transition is validated by `validate_transition()` before being applied. Triage results and routing results are stored as separate database rows linked by foreign key to the incident. The pipeline commits to the database after each agent stage, so partial progress is preserved if a later stage fails.

### Error Handling

**Fail-safe with status tracking.** If any agent stage throws an exception:
1. The error is logged as structured JSON with the incident ID.
2. A Langfuse event is recorded on the trace with the error details.
3. The incident status transitions to `failed` (if the transition is valid from the current state).
4. The exception is re-raised for the background task handler.

Individual tool calls within agents also have error handling -- tool errors return a JSON `{"error": "..."}` payload to the LLM rather than crashing the agent loop. Integration tools (Linear, Slack, Resend) return `{"status": "skipped"}` when API keys are not configured.

### Handoff Logic

**Pydantic models as contracts.** Each agent produces a typed Pydantic model (`IntakeResult`, `TriageResult`, `RoutingResult`) that serves as the input contract for the next stage. The orchestrator passes these models directly -- there is no serialization/deserialization between stages. If an agent's JSON output fails to parse, a fallback result is constructed with safe defaults (e.g., P3 severity with 0.3 confidence for triage).

---

## 4. Context Engineering

### Context Sources

| Source | Agent | Purpose |
|--------|-------|---------|
| User-submitted title and description | Intake | Primary incident data |
| Screenshot images (base64) | Intake | Visual evidence of errors, dashboards |
| Log files (error-prioritized excerpts) | Intake | Error patterns, stack traces |
| Screen recording frames (up to 10) | Intake | Timeline of events leading to the issue |
| Open incidents list (last 20) | Intake | Duplicate detection |
| Medusa.js module index (`index.json`) | Triage | Module discovery and search |
| Module documentation (`modules/*.md`) | Triage | Understanding module behavior and config |
| Source code files (Medusa.js repo subset) | Triage | Direct code evidence for root cause analysis |
| API route definitions (`api-routes.json`) | Triage | Matching reported endpoints to handlers |
| Known error patterns (`error-patterns.json`) | Triage | Matching errors to known issues and fixes |
| Triage results + incident metadata | Router | Ticket content, notification formatting |

### Context Strategy

The system uses a **tool-based progressive discovery** approach rather than RAG or embedding search:

1. **Module search** -- The Triage Agent starts by searching the module index with keywords from the incident description. This narrows the investigation scope.
2. **Documentation read** -- For matched modules, the agent reads the documentation files to understand expected behavior and configuration.
3. **Targeted source file reads** -- When the agent identifies relevant code paths, it reads specific source files (capped at 500 lines per file).
4. **Code grep** -- For error messages or specific patterns, the agent greps the codebase with file type filtering.
5. **Error pattern matching** -- Known error patterns are matched against the reported error messages for quick diagnosis.
6. **API route lookup** -- When the incident involves specific endpoints, the agent looks up route definitions.

This strategy avoids loading large amounts of irrelevant context. The agent drives its own investigation by choosing which tools to call based on what it learns at each step.

### Token Management

- **Image processing:** Images are base64-encoded and sent as native multimodal content blocks -- no intermediate text description step.
- **Log file capping:** Log files are processed to prioritize error/exception lines (up to 100 error lines), with remaining space filled by context lines, capped at 200 lines total.
- **Video frame limit:** Up to 10 frames extracted at 1fps, keeping the vision token cost bounded.
- **Source file truncation:** `read_source_file` returns a maximum of 500 lines per file with a truncation notice.
- **Module docs cap:** Documentation files are capped at 5,000 characters.
- **Incident description truncation:** The Router Agent receives a maximum of 2,000 characters of the original description.
- **Open incident truncation:** Duplicate detection uses the first 300 characters of each open incident's description.
- **LLM max tokens:** All agent calls use `max_tokens=4096` for responses.

### Grounding

- **Tool-based code evidence:** The Triage Agent's severity assessment is grounded in actual code reads and grep results, not general knowledge. Code references include specific file paths and line numbers.
- **Confidence scores:** Every triage result includes a 0.0-1.0 confidence score. The system prompt instructs the agent to set lower confidence when evidence is limited.
- **Structured output with fallbacks:** Agent responses are parsed as JSON with required fields. If parsing fails, a conservative fallback is used (P3 severity, 0.3 confidence) rather than trusting a malformed response.
- **Known error pattern matching:** Error diagnosis is cross-referenced against a curated database of known patterns, not generated from scratch.
- **Prompt grounding instruction:** The Intake Agent's system prompt explicitly states: "Be precise and technical. Do not speculate beyond what the evidence shows."

---

## 5. Use Cases

### Use Case 1: Standard Incident Report (Text + Screenshot)

- **Trigger:** An SRE submits an incident through the web UI with a title like "Checkout 500 error on /store/cart", a description of the issue, and a screenshot of the error page.
- **Steps:**
  1. Frontend sends the form data and image file to `POST /api/incidents` as multipart.
  2. Backend validates inputs (text length, prompt injection scan, file type/size), creates the incident in PostgreSQL with status `received`, saves the image to disk.
  3. Intake Agent receives the text wrapped in `<user_input>` XML tags and the screenshot as a base64 image block. It extracts the HTTP 500 error, identifies "cart" and "checkout" as affected services, and describes the error visible in the screenshot.
  4. Triage Agent calls `search_modules("cart checkout")`, reads the matched module documentation, then calls `search_codebase("500", "*.ts")` to find relevant error handling code. It classifies the incident as P2 (High) with 0.8 confidence, lists `cart` and `checkout` as affected modules, and provides code references pointing to the cart service handler.
  5. Router Agent creates a Linear ticket titled "[P2] Checkout 500 error on /store/cart" with priority 2, sends a Slack notification to the general channel, and emails the reporter.
  6. Frontend displays the completed triage: severity badge, confidence percentage, affected modules, code references with file paths, runbook steps, and a link to the Linear ticket.
- **Expected outcome:** Incident fully triaged and routed in under 30 seconds. The reporter has a Linear ticket link and knows the severity without any manual intervention.

### Use Case 2: Critical P1 with Screen Recording

- **Trigger:** An SRE records a 30-second screen recording of the storefront being completely unresponsive, then submits it with a title "Production store down -- no pages loading".
- **Steps:**
  1. The browser's Screen Recorder component captures the video as a WebM file using `getDisplayMedia`.
  2. Backend saves the video and triggers the pipeline.
  3. Intake Agent receives the text plus up to 10 frames extracted from the video via ffmpeg. It describes the timeline: initial page load attempt, spinning loader, timeout error, repeated attempts failing.
  4. Triage Agent investigates with multiple tool calls, identifies this as a full outage, and classifies as P1 (Critical) with 0.95 confidence. Runbook steps include checking the server health endpoint, reviewing recent deployments, and checking database connectivity.
  5. Router Agent creates a P1 Linear ticket with priority 1 (urgent), sends a Slack notification to the **critical** channel with `@channel` mention, emails the reporter, and sends a second email to the on-call team.
- **Expected outcome:** All stakeholders are notified within seconds. The critical channel gets a high-visibility alert. The on-call team has a runbook to follow.

### Use Case 3: Duplicate Detection

- **Trigger:** A second SRE reports "Cart page returning error" while a similar incident "Checkout 500 error on /store/cart" is already open.
- **Steps:**
  1. Backend retrieves the 20 most recent open incidents (status in `received`, `triaging`, `triaged`, or `routed`).
  2. Intake Agent receives both the new report and the open incidents list in its context. It identifies the existing incident as a likely duplicate based on overlapping services and error patterns.
  3. The `IntakeResult` includes `duplicate_of` set to the existing incident's UUID.
  4. Triage proceeds normally but the duplicate flag is saved to the triage results table.
  5. Router creates the ticket and notifications, noting the potential duplicate in the ticket description.
- **Expected outcome:** The duplicate relationship is recorded in the database. The team is aware that two reports may describe the same issue, avoiding duplicate investigation effort.

---

## 6. Observability

### Logging

**Structured JSON logging** via `structlog` with ISO timestamps. Every log entry includes:
- Log level
- Timestamp (ISO 8601)
- Logger name (e.g., `agents.intake`, `tools.linear`, `agents.orchestrator`)
- Structured key-value fields (incident ID, agent name, tool name, token counts, error details)

Key events logged: `pipeline_start`, `intake_complete`, `triage_complete`, `pipeline_complete`, `pipeline_failed`, `tool_call`, `tool_error`, `api_retry`, `linear_ticket_created`, `slack_sent`, `email_sent`.

### Tracing

**Langfuse** provides end-to-end tracing across the entire pipeline:
- One **trace** per incident (keyed by incident ID)
- Three **spans** per trace: `intake`, `triage`, `router`
- **Generations** logged per LLM call within each span, including: model name, input text (first 2,000 chars), output text (first 2,000 chars), token usage (input + output)
- **Events** for pipeline errors with error metadata

Langfuse is optional -- when disabled or unconfigured, a `_NoOp` stub silently absorbs all calls so the pipeline runs without modification.

### Metrics

Metrics available through Langfuse and structured logs:
- **Latency:** Per-agent execution time (derived from span start/end)
- **Token usage:** Input and output tokens per LLM call (logged to Langfuse generations)
- **Tool call counts:** Number of tool calls per agent run (tracked by `ToolCallCounter`)
- **Success/failure rates:** Pipeline completion vs. failure (tracked via incident status in PostgreSQL)
- **Integration status:** Per-integration success/skip/error (logged as structured events)

### Dashboards

Langfuse provides built-in dashboards for trace exploration, latency analysis, token usage trends, and cost tracking. Access via Langfuse Cloud at https://cloud.langfuse.com or self-hosted at http://localhost:3000.

### Evidence

Evidence screenshots will be added in `docs/evidence/` after integration testing.

---

## 7. Security & Guardrails

### Prompt Injection Defense

**Four-layer defense:**

1. **Regex pattern detection** (`validation.py`): Incoming text is scanned against 10 injection patterns including "ignore previous instructions", "you are now a", "system:", "ADMIN OVERRIDE", "ACT AS", and variants. Matches are rejected before reaching any agent.

2. **XML trust boundaries** (`guardrails.py`): All user-supplied content is wrapped in `<user_input>...</user_input>` tags before being included in the LLM prompt. This creates an explicit boundary between system instructions and untrusted input.

3. **System prompt hardening**: Each agent has a focused system prompt that defines its exact task and output format. The Intake Agent prompt explicitly states "Do not speculate beyond what the evidence shows." The Triage Agent prompt defines exact severity criteria. The Router Agent prompt defines exact execution order.

4. **Output validation**: Agent JSON outputs are parsed with explicit field extraction and type checking. If parsing fails, a safe fallback is used rather than trusting the raw output.

### Input Validation

- **Text length limits:** Title max 200 chars, description max 5,000 chars, total text input max 10,000 chars.
- **Email validation:** Reporter email is validated as `EmailStr` by Pydantic.
- **HTML stripping:** HTML tags are stripped from text inputs.
- **File type allowlist:** Only specific MIME types and extensions are accepted:
  - Images: PNG, JPEG, WebP, GIF (max 10 MB)
  - Logs: text/plain, .log, .txt, .out (max 5 MB)
  - Video: MP4, WebM (max 50 MB)
- **File size enforcement:** Each file type has a hard size cap checked before processing.

### Tool Use Safety

- **Tool call limit:** Each agent run is capped at 20 tool calls via `ToolCallCounter`. If the limit is exceeded, the tool returns an error message to the LLM and no further tool calls are executed.
- **Path traversal protection:** `sanitize_path()` resolves all file paths under the designated base directory and rejects any path that escapes it using `os.path.realpath()`.
- **Source file read cap:** The `read_source_file` tool returns a maximum of 500 lines per file.
- **Subprocess timeout:** Codebase grep commands have a 10-second timeout. ffmpeg frame extraction has a 30-second timeout.

### Data Handling

- **API keys in environment variables:** All secrets (Anthropic, Linear, Slack, Resend, Langfuse) are loaded from environment variables via `pydantic-settings`, never hardcoded.
- **Docker isolation:** The backend runs in a container with volume-mounted upload directory. The Medusa repo and knowledge base are mounted read-only paths within the container.
- **No user data in logs:** Structured logs include incident IDs and metadata but not full user descriptions or attachment contents.
- **Langfuse input/output truncation:** LLM inputs and outputs logged to Langfuse are truncated to 2,000 characters.

### Evidence

Security test results will be added in `docs/evidence/` after integration testing.

---

## 8. Scalability

**Current capacity:** Single instance, synchronous sequential pipeline, one incident processed at a time. Subsequent incidents queue behind the running pipeline at the application level.

**Scaling approach:** Horizontal scaling via async job queue (Redis + BullMQ or Celery), multiple stateless backend replicas behind a load balancer, connection pooling for PostgreSQL.

**Bottlenecks identified:** LLM API latency (10-30 seconds per agent), LLM rate limits, single-threaded pipeline execution, synchronous tool calls within agents.

See [SCALING.md](SCALING.md) for the full scaling analysis including cost estimates, component-level scaling strategies, and architecture decisions.

---

## 9. Lessons Learned & Team Reflections

### What Worked Well

- **Sequential pipeline over complex orchestration.** A simple Intake -> Triage -> Router pipeline turned out to be the right abstraction. Each agent has a clear contract (Pydantic model in, Pydantic model out), making the system easy to debug and extend. We considered event-driven architectures and supervisor patterns, but the linear flow matched the actual incident lifecycle.

- **Tool-based codebase investigation.** Giving the Triage Agent six focused tools and letting it drive its own investigation produced better results than pre-loading context. The agent learns to search, read docs, then drill into source files -- similar to how a human SRE would investigate. The tool call limit (20) prevents runaway investigations without being too restrictive.

- **Graceful degradation everywhere.** Making every integration optional was the best architectural decision. Missing a Slack webhook? Pipeline still completes. Langfuse down? The `_NoOp` stub absorbs all calls silently. This made development and testing dramatically easier and means the core triage value works even with zero integrations configured.

- **Structured logging from day one.** structlog's JSON output with structured fields (incident ID, agent name, tool name, token counts) made debugging multi-agent interactions straightforward. Every meaningful event has a named log entry.

### What We Would Do Differently

- **Async agent execution.** Running agents via `asyncio.to_thread()` works but is a workaround for the Anthropic SDK's synchronous API. A native async client would allow better concurrency and easier integration with async database operations.

- **Knowledge base quality.** The effectiveness of the Triage Agent depends heavily on the quality of the knowledge base (module index, documentation, error patterns). We would invest more time in curating and expanding this knowledge base with real incident data from production Medusa.js deployments.

- **Streaming responses.** The current pipeline returns results only after all three agents complete. Streaming intermediate results (e.g., showing the Intake Agent's output while the Triage Agent is still running) would significantly improve the perceived performance.

### Key Technical Decisions

- **Multi-agent vs. single agent:** We split into three agents because the tasks require fundamentally different capabilities: the Intake Agent needs vision, the Triage Agent needs codebase tools, and the Router Agent needs external API tools. A single agent with all tools would have a bloated system prompt and confused tool selection. The trade-off is higher total latency (three serial LLM calls instead of one), which we accepted for better specialization.

- **Knowledge base over RAG:** We chose a structured knowledge base (JSON indexes + markdown docs + source files) over vector embeddings because the Medusa.js codebase is bounded and well-organized. The Triage Agent's tool-based search provides deterministic, reproducible results. RAG would add infrastructure complexity (embedding model, vector store) without clear benefit for a known codebase.

- **Synchronous pipeline for v1:** We chose a synchronous pipeline over async job queuing because it is simpler to reason about, easier to debug (one incident = one trace = one linear execution path), and reliable enough for the expected volume (<100 incidents/day). See [SCALING.md](SCALING.md) for what triggers the switch to async.

- **Fallback parsing over strict validation:** When agent JSON output is malformed, we use conservative fallback values (P3 severity, 0.3 confidence) instead of failing the pipeline. This keeps the system running even when the LLM produces unexpected output, at the cost of occasionally producing a low-confidence triage that a human would review.
