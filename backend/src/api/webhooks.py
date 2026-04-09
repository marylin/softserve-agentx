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

        # Load triage data for the resolution email
        await db.refresh(incident, ["triage_result"])

        # Commit DB state FIRST, then attempt email (email failure should not lose state)
        await db.commit()
        log.info("resolution_complete", incident_id=str(incident.id), ticket_id=issue_id)

        # Build resolution email with triage details
        triage = incident.triage_result
        severity_colors = {
            "P1": "#ef4444", "P2": "#f97316", "P3": "#eab308", "P4": "#22c55e",
        }

        triage_section = ""
        if triage:
            sev_color = severity_colors.get(triage.severity, "#6b7280")
            modules_html = ""
            if triage.affected_modules:
                pills = "".join(
                    f'<span style="display:inline-block;background:#1f2937;border-radius:4px;'
                    f'padding:2px 8px;margin:2px 4px 2px 0;font-size:12px;color:#d1d5db;">{m}</span>'
                    for m in triage.affected_modules
                )
                modules_html = f"""
                <tr><td style="padding:12px 0 4px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">
                    Affected Modules</td></tr>
                <tr><td style="padding:0 0 12px;">{pills}</td></tr>"""

            runbook_html = ""
            if triage.runbook_steps:
                steps = "".join(
                    f'<li style="color:#d1d5db;padding:4px 0;">{step}</li>'
                    for step in triage.runbook_steps
                )
                runbook_html = f"""
                <tr><td style="padding:12px 0 4px;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">
                    Runbook Steps</td></tr>
                <tr><td><ol style="margin:0;padding-left:20px;">{steps}</ol></td></tr>"""

            triage_section = f"""
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid #1f2937;border-radius:8px;overflow:hidden;">
                <tr><td style="background:#111827;padding:16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                        <tr>
                            <td style="font-size:14px;font-weight:600;color:#e5e7eb;">Triage Summary</td>
                            <td style="text-align:right;">
                                <span style="display:inline-block;background:{sev_color};color:#fff;font-size:11px;font-weight:700;
                                    border-radius:4px;padding:2px 10px;">{triage.severity}</span>
                            </td>
                        </tr>
                        <tr><td colspan="2" style="padding:12px 0 0;color:#d1d5db;font-size:14px;line-height:1.5;">
                            {triage.summary}</td></tr>
                        {modules_html}
                        {runbook_html}
                    </table>
                </td></tr>
            </table>"""

        ticket_link = (
            f'<a href="{routing.linear_ticket_url}" style="color:#f97316;text-decoration:none;">'
            f'{routing.linear_ticket_id}</a>'
            if routing.linear_ticket_url
            else routing.linear_ticket_id or "N/A"
        )

        html_body = f"""
        <div style="background:#0a0a0f;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
            <table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:#0a0a0f;">
                <tr><td style="padding:0 24px;">
                    <!-- Header -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #f97316;padding-bottom:16px;margin-bottom:24px;">
                        <tr>
                            <td style="font-size:20px;font-weight:700;color:#f97316;padding-bottom:16px;">AgentX</td>
                        </tr>
                    </table>

                    <!-- Status banner -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:#052e16;border:1px solid #166534;border-radius:8px;">
                        <tr><td style="padding:16px;text-align:center;">
                            <span style="color:#4ade80;font-size:16px;font-weight:600;">&#10003; Incident Resolved</span>
                        </td></tr>
                    </table>

                    <!-- Title -->
                    <h2 style="color:#e5e7eb;font-size:18px;margin:24px 0 8px;">{incident.title}</h2>

                    <!-- Ticket -->
                    <p style="color:#9ca3af;font-size:14px;margin:0 0 8px;">
                        Ticket: {ticket_link}
                    </p>

                    {triage_section}

                    <!-- Footer -->
                    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid #1f2937;">
                        <tr><td style="padding:16px 0;color:#6b7280;font-size:12px;">
                            Thank you for reporting this issue. If the problem persists, please open a new incident.
                        </td></tr>
                        <tr><td style="color:#4b5563;font-size:11px;">AgentX SRE Triage System</td></tr>
                    </table>
                </td></tr>
            </table>
        </div>"""

        # Send resolution email in thread to avoid blocking event loop
        from src.agents.tools.email_tool import send_email
        try:
            await asyncio.to_thread(
                send_email,
                to=incident.reporter_email,
                subject=f"[Resolved] {incident.title}",
                html_body=html_body,
            )
        except Exception as e:
            log.error("resolution_email_failed", error=str(e), incident_id=str(incident.id))

    return {"status": "resolved"}
