# AgentX SRE Triage Agent

## Project

SRE Incident Intake & Triage Agent for Medusa.js e-commerce. Built for the SoftServe AgentX Hackathon 2026.

## Architecture

- **Frontend:** React + Vite + Tailwind (TypeScript) in `frontend/`
- **Backend:** FastAPI + Anthropic SDK (Python 3.12) in `backend/`
- **Database:** PostgreSQL 16
- **Observability:** Langfuse (cloud default, self-hosted option)
- **Integrations:** Linear (ticketing), Slack (webhooks), Resend (email)
- **Container:** Docker Compose (`docker compose up --build`)

## Key Patterns

- 3 agents: Intake (multimodal), Triage (codebase analysis), Router (integrations)
- Agent loop in `backend/src/agents/base.py` -- tool-use pattern with Anthropic SDK
- State machine: received -> triaging -> triaged -> routed -> resolved (or failed)
- Pre-built Medusa knowledge base in `backend/knowledge-base/`
- Curated Medusa source in `backend/medusa-subset/` (NOT full repo)

## Commands

- **Dev frontend:** `cd frontend && npm run dev`
- **Dev backend:** `cd backend && pip install -e ".[test]" && uvicorn src.main:app --reload --port 8000`
- **Tests:** `cd backend && pytest tests/ -v`
- **Full stack:** `docker compose up --build`
- **Self-hosted Langfuse:** `docker compose --profile self-hosted up --build`

## Implementation Plan

See `docs/superpowers/plans/2026-04-09-sre-triage-agent.md` for the full plan with code.
Read the **AMENDMENTS** section at the top first -- it overrides parts of the original plan.

## Design Spec

See `docs/superpowers/specs/2026-04-09-sre-triage-agent-design.md`

## Rules

- All integration tools (Linear, Slack, Resend) MUST check if API key is present before calling. If missing, return `{"status": "skipped"}` and continue pipeline.
- Never commit `.env` or any API keys.
- Backend: Python with type hints. Use Pydantic for all data models.
- Frontend: TypeScript strict mode. Tailwind for styling. Dark mode.
- Docker containers run as non-root. Only expose ports 5173, 8000, 3000.
- LF line endings everywhere.

## Worktree Lanes

When executing in parallel, use these branches:
- `feat/frontend` -- React UI (incident form, screen recorder, status tracker, dashboard)
- `feat/agents` -- All 3 agents, KB, security, observability, tests, integration tools, orchestrator
- Main branch -- foundation (Phase 0), merge (Phase 2), docs (Phase 3)

## File Organization

```
frontend/src/components/  -- React components
frontend/src/types/       -- TypeScript type definitions
frontend/src/lib/         -- API client, utilities
backend/src/agents/       -- Agent implementations
backend/src/agents/tools/ -- Agent tool functions
backend/src/api/          -- FastAPI route handlers
backend/src/models/       -- SQLAlchemy + Pydantic models
backend/src/security/     -- Validation, guardrails
backend/src/observability/ -- Langfuse, structured logging
backend/src/db/           -- Database connection, init SQL
backend/knowledge-base/   -- Generated Medusa KB (committed)
backend/medusa-subset/    -- Curated Medusa source files (committed)
backend/tests/            -- Pytest tests
docs/evidence/            -- Screenshots/logs for AGENTS_USE.md
```
