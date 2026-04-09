# SCALING.md

## Current Capacity

The system runs as a **single-instance synchronous pipeline**:

- One incident processed at a time; subsequent submissions queue behind the active pipeline at the application level
- Three sequential LLM calls per incident (Intake, Triage, Router), each with a 4,096 token response cap
- Expected end-to-end latency: 15-60 seconds depending on Triage Agent tool call depth
- Database: single PostgreSQL instance with no connection pooling beyond SQLAlchemy's default async pool
- File storage: local Docker volume for uploads
- Auto-escalation: background task runs every 60 seconds, checking SLA breaches and escalating severity (a reliability feature that works at any scale)
- Metrics endpoint: `/metrics/` aggregates status, severity, and component distributions from the database (foundation for monitoring dashboards at scale)

**Assumptions for v1:**
- Single-tenant deployment
- Low-to-medium incident volume: fewer than 100 incidents per day
- One team, one Medusa.js codebase
- All users on the same network or behind a single deployment

---

## Horizontal Scaling Strategy

### Phase 1: Async Job Queue (10-500 incidents/day)

The first scaling bottleneck is the synchronous pipeline. With a single backend instance, the pipeline blocks the event loop thread for 15-60 seconds per incident.

**Solution:** Introduce a job queue (Redis + Celery, or BullMQ if moving to Node.js workers):

```
Frontend -> FastAPI -> Redis Queue -> Worker Pool -> PostgreSQL
                                         |
                                    [Agent Pipeline]
```

- The API endpoint writes the incident to PostgreSQL and enqueues a job, then returns immediately.
- A pool of worker processes pulls jobs from the queue and runs the pipeline.
- Workers are stateless -- they read the incident from PostgreSQL, run the agents, and write results back.
- Scaling: add more workers to process incidents in parallel.

**What triggers this phase:** Consistent pipeline queueing (incidents waiting >30 seconds before processing starts) or SLA requirements for time-to-triage.

### Phase 2: Multi-Replica Backend (500+ incidents/day)

```
                   Load Balancer (nginx / cloud LB)
                  /          |           \
            FastAPI-1    FastAPI-2    FastAPI-3
                  \          |           /
                   Redis Queue (shared)
                  /          |           \
            Worker-1    Worker-2    Worker-3
                  \          |           /
                  PostgreSQL (connection pool)
```

- Backend replicas behind a load balancer for API availability
- Shared Redis for job queue and (optionally) caching
- PostgreSQL with PgBouncer for connection pooling
- Workers can scale independently from API servers

---

## Component-Level Scaling

### Frontend

- **Current:** Vite dev server in Docker (port 5173)
- **Production:** Build static assets (`npm run build`), serve from CDN (Vercel, CloudFront, Netlify)
- **Scaling concern:** None. Static files scale trivially with CDN edge caching.

### Backend (API)

- **Current:** Single FastAPI instance with Uvicorn
- **Production:** Multiple Uvicorn workers (`uvicorn --workers N`), then multiple replicas behind a load balancer
- **Scaling concern:** The API itself is lightweight (validate input, write to DB, enqueue job). Stateless by design -- no session state, no in-memory caches. Scales linearly with replicas.

### Database (PostgreSQL)

- **Current:** Single PostgreSQL 16 Alpine instance in Docker
- **Phase 1:** Add PgBouncer for connection pooling (each async worker opens a connection pool)
- **Phase 2:** Read replicas for the incident list query (the dashboard polls every 10 seconds)
- **Phase 3:** Partitioning by created_at date if the incidents table grows past millions of rows
- **Scaling concern:** At <100 incidents/day, PostgreSQL handles the load easily. The main concern is connection count from multiple workers hitting the same instance.

### Agent Pipeline (Workers)

- **Current:** Runs in the FastAPI process via `asyncio.to_thread()`
- **Phase 1:** Separate worker processes pulling from Redis queue
- **Phase 2:** Worker auto-scaling based on queue depth (Kubernetes HPA, or cloud-native auto-scaling)
- **Scaling concern:** Each worker processes one incident at a time. Agent execution is CPU-idle (waiting on LLM API), so a single worker machine can handle many concurrent pipelines with async I/O. The bottleneck is LLM rate limits, not compute.

### File Storage

- **Current:** Docker volume (`/app/uploads`)
- **Production:** Object storage (S3, GCS, R2) with pre-signed URLs for uploads
- **Scaling concern:** Local disk doesn't work with multiple replicas. Object storage is required for any horizontal scaling.

---

## LLM Bottleneck

### Rate Limits

The Anthropic API enforces rate limits on requests per minute (RPM) and tokens per minute (TPM). At scale:

- **3 LLM calls per incident** (Intake, Triage, Router)
- At 100 incidents/day: ~300 LLM calls/day, ~12.5/hour -- well within limits
- At 1,000 incidents/day: ~3,000 LLM calls/day, ~125/hour -- may hit RPM limits on lower-tier API plans
- Mitigation: Exponential backoff with retry (already implemented in `base.py`, 3 retries with 1/2/4 second waits), request queuing to smooth bursts, upgrade API tier

### Token Cost Estimates

Per-incident cost estimate using Claude Sonnet 4 pricing ($3/MTok input, $15/MTok output):

| Agent | Est. Input Tokens | Est. Output Tokens | Est. Cost |
|-------|------------------:|-------------------:|----------:|
| Intake (text + image) | ~2,000-8,000 | ~500-1,000 | $0.01-0.04 |
| Triage (text + tool results) | ~3,000-10,000 | ~1,000-2,000 | $0.02-0.06 |
| Router (text, tool calls) | ~1,500-3,000 | ~500-1,000 | $0.01-0.02 |
| **Total per incident** | | | **$0.04-0.12** |

- Incidents with images or video frames cost more due to vision token usage.
- Triage cost varies with the number of tool calls (each tool result adds to the context).
- At 100 incidents/day: ~$4-12/day, ~$120-360/month
- At 1,000 incidents/day: ~$40-120/day, ~$1,200-3,600/month

### Cost Optimization

- **OpenRouter fallback:** The system supports OpenRouter as an alternative LLM provider, enabling access to cheaper models for lower-severity incidents.
- **Severity-based model routing (future):** Use a faster/cheaper model for P3/P4 triage, reserve Sonnet for P1/P2.
- **Caching (future):** Cache knowledge base search results and module documentation across incidents to reduce repeated tool call token costs.

---

## Observability at Scale

### Langfuse

- **Cloud:** Langfuse Cloud handles volume scaling automatically. No infrastructure management needed.
- **Self-hosted:** The self-hosted Langfuse instance (included in `docker-compose.yml` under the `self-hosted` profile) would need its own PostgreSQL scaling for high-volume trace storage.
- **Retention:** Configure trace retention policies to manage storage costs at high volume.

### Structured Logs

- **Current:** structlog writes JSON to stdout, captured by Docker logging driver
- **Production:** Ship logs to a centralized logging platform (ELK stack, Datadog, Grafana Loki)
- **Scaling concern:** Log volume grows linearly with incident count. At ~20 log entries per incident, 1,000 incidents/day produces ~20,000 log entries/day -- trivial for any centralized logging system.

---

## Architecture Decisions

### Why Synchronous for Now

1. **Simplicity.** One incident = one pipeline execution = one Langfuse trace. No distributed transaction concerns, no job deduplication, no dead letter queues.
2. **Debuggability.** When something fails, the entire execution path is in one process with one log stream. Stack traces are meaningful. Langfuse spans show the complete timeline.
3. **Reliability.** No additional infrastructure dependencies (no Redis, no message broker). Fewer moving parts means fewer failure modes.

### What Triggers the Switch to Async

- Pipeline queue depth consistently exceeds 5 incidents (users waiting >2 minutes for processing to start)
- Team scales beyond one Medusa.js instance (multi-tenant requirements)
- SLA requirement for time-to-triage drops below 60 seconds at p95
- Need for incident priority queuing (P1 incidents should jump the queue)

### Team Customization Layer

The `agent-config.yaml` file provides a zero-code customization layer for teams. Severity criteria, SLA thresholds, notification routing rules, affected area lists, and agent tool limits are all editable without code changes. At scale, this enables multi-team deployments where each team has its own configuration (loaded per-request from the YAML file or, in a multi-tenant setup, from a database-backed config store).

### What Does Not Need to Scale

- **Knowledge base:** The Medusa.js knowledge base (module index, docs, error patterns) is read-only and fits in memory. It does not need a database or search engine.
- **Frontend:** Static assets served from CDN. No server-side rendering. No WebSocket connections (uses polling).
- **Integration APIs:** Linear, Slack, and Resend are external services with their own scaling. Our usage is well within their free/standard tier limits for any reasonable incident volume.
- **Metrics endpoint:** The `/metrics/` endpoint aggregates data directly from PostgreSQL. At higher volumes, this could be backed by a materialized view or pre-computed cache (Redis) to avoid repeated aggregation queries, but at current scale it runs fast enough as a live query.
- **Auto-escalation:** The escalation loop queries a small set of open incidents every 60 seconds. Even at thousands of incidents/day, the number of simultaneously open (non-resolved) incidents remains bounded. No scaling concern.
