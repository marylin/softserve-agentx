import json
import re

from src.agents.base import run_agent
from src.agents.tools.email_tool import EMAIL_TOOL_HANDLERS, EMAIL_TOOLS
from src.agents.tools.linear_tool import LINEAR_TOOL_HANDLERS, LINEAR_TOOLS
from src.agents.tools.slack_tool import SLACK_TOOL_HANDLERS, SLACK_TOOLS
from src.models.schemas import RoutingResult, TriageResult
from src.observability.logging import get_logger

log = get_logger("agents.router")

SYSTEM_PROMPT = """You are an SRE Routing Agent. After an incident has been triaged, you handle:
1. Creating a Linear ticket to track the issue
2. Sending Slack notifications to the appropriate channel

NOTE: Email notifications are handled automatically by the system after you finish. Do NOT call send_email.

EXECUTION ORDER (follow strictly):
1. Call create_linear_ticket with the full incident details and severity
2. Parse the ticket_id and ticket_url from the create_linear_ticket response
3. Call send_slack_notification -- you MUST pass the ticket_url from step 2 so the Slack message links to the ticket. Also pass the reporter name.

CRITICAL: The Slack notification MUST include the Linear ticket URL. Extract it from the create_linear_ticket response and pass it as the ticket_url parameter.

After completing the above, output a JSON summary:
{
    "linear_ticket_id": "TEAM-123",
    "linear_ticket_url": "https://linear.app/...",
    "slack_sent": true,
    "email_sent": false
}

If any tool returns a "skipped" status, note it but continue with other tools."""


def run_router_agent(
    triage_result: TriageResult,
    incident_title: str,
    incident_description: str,
    reporter_email: str,
    reporter_name: str,
    trace_span=None,
) -> RoutingResult:
    """Run the router agent to create tickets and send notifications."""
    # Combine all tools
    # Email is sent programmatically after the agent finishes (not via LLM tool)
    all_tools = LINEAR_TOOLS + SLACK_TOOLS
    all_handlers = {**LINEAR_TOOL_HANDLERS, **SLACK_TOOL_HANDLERS}

    severity = triage_result.severity.value
    runbook = "\n".join(f"- {step}" for step in triage_result.runbook_steps)
    modules = ", ".join(triage_result.affected_modules) if triage_result.affected_modules else "unknown"

    message = (
        f"Route this triaged incident:\n\n"
        f"Title: {incident_title}\n"
        f"Severity: {severity}\n"
        f"Summary: {triage_result.summary}\n"
        f"Affected Modules: {modules}\n"
        f"Confidence: {triage_result.confidence}\n\n"
        f"Runbook Steps:\n{runbook}\n\n"
        f"Reporter: {reporter_name} <{reporter_email}>\n\n"
        f"Description:\n{incident_description[:2000]}"
    )

    raw = run_agent(
        name="router",
        system_prompt=SYSTEM_PROMPT,
        user_message=message,
        tools=all_tools,
        tool_handlers=all_handlers,
        trace_span=trace_span,
    )

    result = _parse_router_response(raw)

    # Send styled confirmation email to reporter (outside LLM control for consistency)
    from src.agents.tools.email_template import build_routing_email
    from src.agents.tools.email_tool import send_email
    try:
        html = build_routing_email(
            title=incident_title,
            severity=severity,
            summary=triage_result.summary,
            ticket_id=result.linear_ticket_id,
            ticket_url=result.linear_ticket_url,
        )
        send_email(
            to=reporter_email,
            subject=f"[{severity}] {incident_title}",
            html_body=html,
        )
        result.email_sent = True
    except Exception as e:
        log.warning("routing_email_failed", error=str(e))

    return result


def _parse_router_response(raw: str) -> RoutingResult:
    """Parse routing agent response into RoutingResult."""
    json_match = re.search(r"\{[\s\S]*\}", raw)
    if json_match:
        try:
            data = json.loads(json_match.group())
            return RoutingResult(
                linear_ticket_id=data.get("linear_ticket_id", ""),
                linear_ticket_url=data.get("linear_ticket_url", ""),
                slack_message_ts=data.get("slack_message_ts") or data.get("message_ts"),
                email_sent=bool(data.get("email_sent", False)),
            )
        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            log.warning("router_json_parse_failed", error=str(exc))

    # Fallback
    log.warning("router_fallback", raw_length=len(raw))
    return RoutingResult(
        linear_ticket_id="",
        linear_ticket_url="",
        slack_message_ts=None,
        email_sent=False,
    )
