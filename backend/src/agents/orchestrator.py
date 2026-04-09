import asyncio
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.agents.intake import run_intake_agent
from src.agents.router import run_router_agent
from src.agents.triage import run_triage_agent
from src.models.incident import (
    Incident,
    IncidentAttachment,
    RoutingResultModel,
    TriageResultModel,
    validate_transition,
)
from src.observability.langfuse_client import create_span, create_trace
from src.observability.logging import get_logger

log = get_logger("agents.orchestrator")


async def run_pipeline(incident_id: UUID, db: AsyncSession):
    """Run the full intake -> triage -> route pipeline for an incident."""
    log.info("pipeline_start", incident_id=str(incident_id))

    # Load incident with attachments
    result = await db.execute(
        select(Incident)
        .where(Incident.id == incident_id)
        .options(selectinload(Incident.attachments))
    )
    incident = result.scalar_one_or_none()
    if not incident:
        log.error("incident_not_found", incident_id=str(incident_id))
        return

    # Create Langfuse trace
    trace = create_trace(str(incident_id))

    try:
        # ---- Stage 1: Intake ----
        if not validate_transition(incident.status, "triaging"):
            log.warning("invalid_transition", current=incident.status, target="triaging")
            return

        incident.status = "triaging"
        incident.updated_at = datetime.now(timezone.utc)
        await db.commit()

        intake_span = create_span(trace, "intake")

        # Prepare attachments
        attachments = [
            {
                "type": att.type,
                "file_path": att.file_path,
                "original_filename": att.original_filename,
            }
            for att in incident.attachments
        ]

        # Get open incidents for duplicate detection
        open_result = await db.execute(
            select(Incident)
            .where(Incident.status.in_(["received", "triaging", "triaged", "routed"]))
            .where(Incident.id != incident_id)
            .order_by(Incident.created_at.desc())
            .limit(20)
        )
        open_incidents = [
            {"id": str(inc.id), "title": inc.title, "description": inc.description[:300]}
            for inc in open_result.scalars().all()
        ]

        intake_result = await asyncio.to_thread(
            run_intake_agent,
            incident.title,
            incident.description,
            attachments,
            open_incidents,
            intake_span,
        )
        intake_span.end()
        log.info("intake_complete", incident_id=str(incident_id))

        # ---- Stage 2: Triage ----
        if not validate_transition(incident.status, "triaged"):
            log.warning("invalid_transition", current=incident.status, target="triaged")
            return

        triage_span = create_span(trace, "triage")
        triage_result = await asyncio.to_thread(
            run_triage_agent,
            intake_result,
            triage_span,
        )
        triage_span.end()

        # Save triage result
        triage_model = TriageResultModel(
            incident_id=incident_id,
            severity=triage_result.severity.value,
            confidence=triage_result.confidence,
            summary=triage_result.summary,
            affected_modules=triage_result.affected_modules,
            code_references=triage_result.code_references,
            runbook_steps=triage_result.runbook_steps,
            duplicate_of=intake_result.duplicate_of,
        )
        db.add(triage_model)

        incident.status = "triaged"
        incident.updated_at = datetime.now(timezone.utc)
        await db.commit()
        log.info("triage_complete", incident_id=str(incident_id), severity=triage_result.severity.value)

        # ---- Stage 3: Router ----
        if not validate_transition(incident.status, "routed"):
            log.warning("invalid_transition", current=incident.status, target="routed")
            return

        router_span = create_span(trace, "router")
        routing_result = await asyncio.to_thread(
            run_router_agent,
            triage_result,
            incident.title,
            incident.description,
            incident.reporter_email,
            incident.reporter_name,
            router_span,
        )
        router_span.end()

        # Save routing result
        routing_model = RoutingResultModel(
            incident_id=incident_id,
            linear_ticket_id=routing_result.linear_ticket_id or None,
            linear_ticket_url=routing_result.linear_ticket_url or None,
            slack_message_ts=routing_result.slack_message_ts,
            email_sent=routing_result.email_sent,
        )
        db.add(routing_model)

        incident.status = "routed"
        incident.updated_at = datetime.now(timezone.utc)
        await db.commit()
        log.info("pipeline_complete", incident_id=str(incident_id), status="routed")

    except Exception as exc:
        log.error("pipeline_failed", incident_id=str(incident_id), error=str(exc))
        try:
            trace.event(name="pipeline_error", metadata={"error": str(exc)})
        except Exception:
            pass

        if validate_transition(incident.status, "failed"):
            incident.status = "failed"
            incident.updated_at = datetime.now(timezone.utc)
            await db.commit()

        raise
    finally:
        try:
            trace.end()
        except Exception:
            pass
