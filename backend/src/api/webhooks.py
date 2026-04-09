import asyncio
import hashlib
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Request
from sqlalchemy import select

from src.config import settings
from src.db.database import async_session
from src.models.incident import Incident, RoutingResultModel, validate_transition
from src.observability.logging import get_logger

log = get_logger("api.webhooks")
router = APIRouter()


@router.post("/linear")
async def linear_webhook(
    request: Request,
    x_linear_signature: str | None = Header(default=None),
):
    body = await request.body()

    if settings.linear_webhook_secret and x_linear_signature:
        expected = hmac.new(
            settings.linear_webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, x_linear_signature):
            raise HTTPException(status_code=401, detail="Invalid signature")

    payload = await request.json()

    action = payload.get("action")
    data = payload.get("data", {})
    state = data.get("state", {})
    state_name = state.get("name", "").lower() if isinstance(state, dict) else ""

    if action != "update" or state_name not in ("done", "completed"):
        return {"status": "ignored"}

    issue_id = data.get("identifier") or data.get("id", "")
    log.info("linear_webhook_resolution", issue_id=issue_id, state=state_name)

    async with async_session() as db:
        result = await db.execute(
            select(RoutingResultModel).where(
                RoutingResultModel.linear_ticket_id == issue_id
            )
        )
        routing = result.scalar_one_or_none()
        if not routing:
            log.warning("webhook_no_routing_found", issue_id=issue_id)
            return {"status": "not_found"}

        if routing.resolution_notified:
            return {"status": "already_notified"}

        inc_result = await db.execute(
            select(Incident).where(Incident.id == routing.incident_id)
        )
        incident = inc_result.scalar_one_or_none()
        if not incident:
            return {"status": "incident_not_found"}

        if validate_transition(incident.status, "resolved"):
            incident.status = "resolved"
            incident.updated_at = datetime.now(timezone.utc)

        routing.resolved_at = datetime.now(timezone.utc)
        routing.resolution_notified = True

        # Commit DB state FIRST, then attempt email (email failure should not lose state)
        await db.commit()
        log.info("resolution_complete", incident_id=str(incident.id), ticket_id=issue_id)

        # Send resolution email in thread to avoid blocking event loop
        from src.agents.tools.email_tool import send_email
        try:
            await asyncio.to_thread(
                send_email,
                to=incident.reporter_email,
                subject=f"[Resolved] {incident.title}",
                html_body=f"""
                <h2>Your incident has been resolved</h2>
                <p><strong>{incident.title}</strong> has been marked as resolved.</p>
                <p>Ticket: <a href="{routing.linear_ticket_url}">{routing.linear_ticket_id}</a></p>
                <p>Thank you for reporting this issue.</p>
                <hr>
                <p><small>AgentX SRE Triage System</small></p>
                """,
            )
        except Exception as e:
            log.error("resolution_email_failed", error=str(e), incident_id=str(incident.id))

    return {"status": "resolved"}
