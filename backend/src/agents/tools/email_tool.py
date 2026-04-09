import json

from src.config import settings
from src.observability.logging import get_logger

log = get_logger("tools.email")


def send_email(to: str, subject: str, html_body: str) -> str:
    """Send an email via Resend API."""
    if not settings.resend_api_key:
        log.info("email_skipped", reason="Resend API key not configured")
        return json.dumps({"status": "skipped", "reason": "Resend API key not configured"})

    try:
        import resend

        resend.api_key = settings.resend_api_key

        result = resend.Emails.send(
            {
                "from": settings.resend_from_email,
                "to": [to],
                "subject": subject,
                "html": html_body,
            }
        )

        log.info("email_sent", to=to, subject=subject)
        return json.dumps({"status": "sent", "id": result.get("id", "") if isinstance(result, dict) else str(result)})

    except Exception as exc:
        log.error("email_send_failed", to=to, error=str(exc))
        return json.dumps({"status": "error", "error": str(exc)})


EMAIL_TOOLS = [
    {
        "name": "send_email",
        "description": "Send an email notification about an incident.",
        "input_schema": {
            "type": "object",
            "properties": {
                "to": {"type": "string", "description": "Recipient email address"},
                "subject": {"type": "string", "description": "Email subject"},
                "html_body": {"type": "string", "description": "HTML body content"},
            },
            "required": ["to", "subject", "html_body"],
        },
    },
]

EMAIL_TOOL_HANDLERS = {
    "send_email": lambda **kw: send_email(kw["to"], kw["subject"], kw["html_body"]),
}
