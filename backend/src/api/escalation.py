import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from src.agent_config import get_agent_config
from src.db.database import async_session
from src.models.incident import Incident, TriageResultModel
from src.observability.logging import get_logger

log = get_logger("escalation")

ESCALATION_MAP = {"P4": "P3", "P3": "P2", "P2": "P1"}


async def check_escalations():
    """Check for SLA breaches and escalate severity."""
    config = get_agent_config()
    sla_config = config.get("sla_minutes", {})
    SLA_MINUTES = {k: int(v) for k, v in sla_config.items()} if sla_config else {"P1": 15, "P2": 60, "P3": 240, "P4": 1440}
    async with async_session() as db:
        result = await db.execute(
            select(Incident, TriageResultModel)
            .join(TriageResultModel, TriageResultModel.incident_id == Incident.id)
            .where(Incident.status.in_(["triaged", "routed"]))
        )

        now = datetime.now(timezone.utc)
        for incident, triage in result.all():
            sla_minutes = SLA_MINUTES.get(triage.severity, 60)
            elapsed = (now - incident.created_at).total_seconds() / 60

            if elapsed > sla_minutes and triage.severity in ESCALATION_MAP:
                new_severity = ESCALATION_MAP[triage.severity]
                old_severity = triage.severity
                triage.severity = new_severity

                log.info(
                    "incident_escalated",
                    incident_id=str(incident.id),
                    old_severity=old_severity,
                    new_severity=new_severity,
                    elapsed_minutes=round(elapsed, 1),
                    sla_minutes=sla_minutes,
                )

                try:
                    from src.agents.tools.slack_tool import send_slack_notification

                    send_slack_notification(
                        severity=new_severity,
                        title=f"[ESCALATED] {incident.title}",
                        summary=(
                            f"SLA breach: was {old_severity}, escalated to {new_severity}. "
                            f"Original SLA was {sla_minutes}min, elapsed {round(elapsed)}min."
                        ),
                        ticket_url="",
                        reporter="System Auto-Escalation",
                    )
                except Exception as e:
                    log.error("escalation_slack_failed", error=str(e))

        await db.commit()


async def escalation_loop():
    """Run escalation checks every 60 seconds."""
    while True:
        try:
            await check_escalations()
        except Exception as e:
            log.error("escalation_check_failed", error=str(e))
        await asyncio.sleep(60)
