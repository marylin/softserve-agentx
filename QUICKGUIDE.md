# QUICKGUIDE.md

Step-by-step setup guide for AgentX SRE Triage Agent.

---

## 1. Prerequisites

- **Docker Desktop** (or Docker Engine + Docker Compose v2) -- [Install Docker](https://docs.docker.com/get-docker/)
- **Git** -- [Install Git](https://git-scm.com/downloads)

That's it. No Python, Node.js, or PostgreSQL installation needed -- everything runs in containers.

---

## 2. Clone the Repository

```bash
git clone https://github.com/marylin/softserve-agentx.git
cd softserve-agentx
```

---

## 3. Copy the Environment File

```bash
cp .env.example .env
```

---

## 4. Fill In API Keys

Open `.env` in your editor and fill in the required and optional keys:

### Required

| Key | Where to get it |
|-----|----------------|
| `ANTHROPIC_API_KEY` | [Anthropic Console > API Keys](https://console.anthropic.com/settings/keys) |

This is the only key needed to run the core pipeline. All integrations below are optional.

### Optional: Ticketing (Linear)

| Key | Where to get it |
|-----|----------------|
| `LINEAR_API_KEY` | [Linear > Settings > API](https://linear.app/settings/api) -- create a personal API key |
| `LINEAR_TEAM_ID` | Linear > Settings > Teams > click your team > copy the ID from the URL |
| `LINEAR_DEFAULT_ASSIGNEE_ID` | Linear > Settings > Members > click a user > copy ID from URL. P1/P2 tickets will be auto-assigned to this user. |

### Optional: Notifications (Slack)

Join the demo Slack workspace: https://join.slack.com/t/ss-agentx/shared_invite/zt-3uykoe9oh-Y~eBDCd8QPs3Y6ipjaSFQw

| Key | Where to get it |
|-----|----------------|
| `SLACK_WEBHOOK_CRITICAL` | [Slack API > Incoming Webhooks](https://api.slack.com/messaging/webhooks) -- create an app, enable incoming webhooks, add a webhook for your critical alerts channel |
| `SLACK_WEBHOOK_GENERAL` | Same process, pointing to your general incidents channel |

### Optional: Email (Resend)

| Key | Where to get it |
|-----|----------------|
| `RESEND_API_KEY` | [Resend Dashboard > API Keys](https://resend.com/api-keys) |
| `RESEND_FROM_EMAIL` | The verified sender email in your Resend account |
| `RESEND_TEAM_EMAIL` | The on-call team email address for P1 notifications |

### Optional: Observability (Langfuse)

| Key | Where to get it |
|-----|----------------|
| `LANGFUSE_SECRET_KEY` | [Langfuse Cloud](https://cloud.langfuse.com) -- sign up (free tier), create a project, go to project settings > API Keys |
| `LANGFUSE_PUBLIC_KEY` | Same location as the secret key |

---

## 5. For OpenRouter Users

If you want to use OpenRouter instead of the Anthropic API directly, set these in your `.env`:

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=your-openrouter-key-here
OPENROUTER_MODEL=anthropic/claude-sonnet-4
```

Get your OpenRouter API key at [openrouter.ai/keys](https://openrouter.ai/keys).

---

## 6. Start the Application

```bash
docker compose up --build
```

This starts three services:
- **frontend** -- React app on http://localhost:5173
- **backend** -- FastAPI on http://localhost:8000
- **postgres** -- PostgreSQL 16 on port 5432 (internal only)

Wait for the health checks to pass. You should see log output from all three services. The first build takes 2-5 minutes depending on your connection (Docker pulls images and installs dependencies).

---

## 7. Open the UI

Navigate to **http://localhost:5173** in your browser.

You will see the incident form. The navigation bar has five views:
- **Report Incident** -- submit new incidents with AI-assisted descriptions, voice input, and component picker
- **Incidents** -- searchable/filterable list with SLA breach highlighting and JSON export
- **Metrics** -- KPI cards and distribution charts (severity, status, components)
- **Health** -- per-component health grid derived from open incidents
- **API** -- link to the FastAPI interactive docs

---

## 8. Test the Pipeline

1. Fill in the **Report an Incident** form:
   - Your name and email
   - A title like "Payment processing fails with 500 error"
   - Select an **Affected Area** from the component picker (recommended -- enables component health tracking)
   - For the description, try clicking **AI Suggest** to auto-generate a structured report, or use the **Voice** button to dictate
   - Optionally attach a screenshot or click "Record Screen" to capture a short recording

2. Click **Submit Incident**.

3. You will be taken to the status tracker page. Watch as the incident progresses through the stages:
   - **Received** -- your report was saved
   - **Analyzing** -- the Intake Agent is processing your report
   - **Triaged** -- the Triage Agent has assessed severity and investigated the codebase
   - **Routed** -- the Router Agent has created tickets and sent notifications

4. Once complete, you will see:
   - Severity badge (P1-P4) with confidence percentage and confidence label (High/Moderate/Low)
   - Live SLA countdown timer
   - Technical summary of the issue
   - Affected modules
   - Code references with file paths
   - Runbook steps
   - Related incidents (by shared modules)
   - Incident timeline with step durations
   - Estimated triage cost
   - Links to the Linear ticket (if configured)
   - Notification status for Slack and email

---

## 9. Optional: Self-Hosted Langfuse

If you prefer to run Langfuse locally instead of using Langfuse Cloud:

```bash
docker compose --profile self-hosted up --build
```

This adds two additional services:
- **langfuse** -- Langfuse web UI on http://localhost:3000
- **langfuse-db** -- Dedicated PostgreSQL for Langfuse

After startup:
1. Open http://localhost:3000
2. Create an account (first user becomes admin)
3. Create a project
4. Go to project settings > API Keys, copy the secret key and public key
5. Update your `.env`:
   ```bash
   LANGFUSE_SECRET_KEY=sk-lf-your-local-key
   LANGFUSE_PUBLIC_KEY=pk-lf-your-local-key
   LANGFUSE_HOST=http://langfuse:3000
   ```
6. Restart the backend: `docker compose restart backend`

---

## 10. Troubleshooting

### Port Conflicts

If ports 5173, 8000, or 5432 are already in use:

```
Error: Bind for 0.0.0.0:5173 failed: port is already allocated
```

Stop the conflicting service or change the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "5174:5173"  # Change the left-side port
```

### API Key Errors

If the pipeline fails immediately after submission, check the backend logs:

```bash
docker compose logs backend --tail 50
```

Look for:
- `"error": "AuthenticationError"` -- your `ANTHROPIC_API_KEY` is invalid or expired
- `"error": "RateLimitError"` -- you have hit the Anthropic API rate limit; the system will retry automatically (3 attempts with exponential backoff)

### First Build Is Slow

The first `docker compose up --build` downloads base images and installs all dependencies. Subsequent builds use Docker layer caching and are much faster. If you want to rebuild from scratch:

```bash
docker compose down -v
docker compose up --build
```

### Database Connection Issues

If the backend fails to connect to PostgreSQL:

```bash
docker compose logs postgres --tail 20
```

Ensure the PostgreSQL container is healthy before the backend starts. The `docker-compose.yml` includes health checks with `depends_on: condition: service_healthy`, so this should resolve automatically on restart.

### Resetting Everything

To completely reset the database and start fresh:

```bash
docker compose down -v    # removes volumes (all data)
docker compose up --build
```

---

## 11. Customizing Agent Behavior

Edit `backend/agent-config.yaml` to customize without code changes:

- **Severity criteria** -- define what qualifies as P1/P2/P3/P4 for your team
- **SLA thresholds** -- set response time targets per severity level (used by the auto-escalation task)
- **Notification routing** -- control which severity levels trigger Slack critical channel, auto-assignment, and team email
- **Affected areas** -- customize the component picker dropdown in the incident form
- **Agent limits** -- adjust max tool calls, file read limits, and video frame extraction

After editing, restart the backend: `docker compose restart backend`
