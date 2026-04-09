import json

import httpx

from src.config import settings
from src.observability.logging import get_logger

log = get_logger("tools.linear")

SEVERITY_PRIORITY = {"P1": 1, "P2": 2, "P3": 3, "P4": 4}


def create_linear_ticket(title: str, description: str, severity: str) -> str:
    """Create a Linear issue via GraphQL API."""
    if not settings.linear_api_key:
        log.info("linear_skipped", reason="API key not configured")
        return json.dumps({"status": "skipped", "reason": "Linear API key not configured"})

    priority = SEVERITY_PRIORITY.get(severity, 3)

    mutation = """
    mutation CreateIssue($title: String!, $description: String!, $teamId: String!, $priority: Int) {
        issueCreate(input: {
            title: $title,
            description: $description,
            teamId: $teamId,
            priority: $priority
        }) {
            success
            issue {
                id
                identifier
                url
            }
        }
    }
    """

    variables = {
        "title": f"[{severity}] {title}",
        "description": description,
        "teamId": settings.linear_team_id,
        "priority": priority,
    }

    try:
        resp = httpx.post(
            "https://api.linear.app/graphql",
            json={"query": mutation, "variables": variables},
            headers={
                "Authorization": settings.linear_api_key,
                "Content-Type": "application/json",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()

        issue = data.get("data", {}).get("issueCreate", {}).get("issue", {})
        result = {
            "status": "created",
            "ticket_id": issue.get("identifier", ""),
            "ticket_url": issue.get("url", ""),
            "linear_id": issue.get("id", ""),
        }
        log.info("linear_ticket_created", **result)
        return json.dumps(result)

    except Exception as exc:
        log.error("linear_create_failed", error=str(exc))
        return json.dumps({"status": "error", "error": str(exc)})


LINEAR_TOOLS = [
    {
        "name": "create_linear_ticket",
        "description": "Create a Linear issue for tracking an incident. Returns ticket ID and URL.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Ticket title"},
                "description": {"type": "string", "description": "Ticket description (markdown)"},
                "severity": {"type": "string", "enum": ["P1", "P2", "P3", "P4"], "description": "Severity level"},
            },
            "required": ["title", "description", "severity"],
        },
    },
]

LINEAR_TOOL_HANDLERS = {
    "create_linear_ticket": lambda **kw: create_linear_ticket(
        kw["title"], kw["description"], kw["severity"]
    ),
}
