import json

import httpx

from src.config import settings
from src.observability.logging import get_logger

log = get_logger("tools.slack")

SEVERITY_COLORS = {
    "P1": "#dc2626",
    "P2": "#ea580c",
    "P3": "#ca8a04",
    "P4": "#6b7280",
}


def send_slack_notification(
    severity: str,
    title: str,
    summary: str,
    ticket_url: str = "",
    reporter: str = "",
) -> str:
    """Send a Slack notification via incoming webhook with Block Kit formatting."""
    is_critical = severity == "P1"

    webhook_url = (
        settings.slack_webhook_critical if is_critical else settings.slack_webhook_general
    )

    if not webhook_url:
        log.info("slack_skipped", reason="webhook not configured", severity=severity)
        return json.dumps({"status": "skipped", "reason": "Slack webhook not configured"})

    color = SEVERITY_COLORS.get(severity, "#6b7280")
    alert_prefix = "<!channel> " if is_critical else ""

    ticket_line = f"\n<{ticket_url}|View Ticket>" if ticket_url else ""
    reporter_line = f"\n*Reporter:* {reporter}" if reporter else ""

    payload = {
        "attachments": [
            {
                "color": color,
                "blocks": [
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"{alert_prefix}*[{severity}] {title}*",
                        },
                    },
                    {
                        "type": "section",
                        "text": {
                            "type": "mrkdwn",
                            "text": f"{summary}{reporter_line}{ticket_line}",
                        },
                    },
                ],
            }
        ]
    }

    try:
        resp = httpx.post(webhook_url, json=payload, timeout=10)
        resp.raise_for_status()
        log.info("slack_sent", severity=severity, title=title)
        return json.dumps({"status": "sent", "severity": severity})

    except Exception as exc:
        log.error("slack_send_failed", error=str(exc))
        return json.dumps({"status": "error", "error": str(exc)})


SLACK_TOOLS = [
    {
        "name": "send_slack_notification",
        "description": "Send an incident notification to Slack. P1 goes to the critical channel with @channel mention.",
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {"type": "string", "enum": ["P1", "P2", "P3", "P4"], "description": "Severity level"},
                "title": {"type": "string", "description": "Incident title"},
                "summary": {"type": "string", "description": "Brief summary"},
                "ticket_url": {"type": "string", "description": "URL to the Linear ticket"},
                "reporter": {"type": "string", "description": "Name of the reporter"},
            },
            "required": ["severity", "title", "summary"],
        },
    },
]

SLACK_TOOL_HANDLERS = {
    "send_slack_notification": lambda **kw: send_slack_notification(
        kw["severity"],
        kw["title"],
        kw["summary"],
        kw.get("ticket_url", ""),
        kw.get("reporter", ""),
    ),
}
