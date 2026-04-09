import json

import httpx

from src.config import settings
from src.observability.logging import get_logger

log = get_logger("tools.linear")

SEVERITY_PRIORITY = {"P1": 1, "P2": 2, "P3": 3, "P4": 4}

STATE_MAP = {
    "P1": "180cf62c-9e37-47ff-b331-4dd6625b587b",  # In Progress
    "P2": "f23bfb9b-728f-4118-a1b9-009cfa01d07e",  # Todo
    "P3": "792d17bc-02d9-4c6e-9f7e-26310882ac26",  # Backlog
    "P4": "792d17bc-02d9-4c6e-9f7e-26310882ac26",  # Backlog
}

SEVERITY_LABELS = {"P1": "P1-Critical", "P2": "P2-High", "P3": "P3-Medium", "P4": "P4-Low"}

BUG_LABEL_ID = "ac2b5fa3-5bc7-4e43-b3b1-aff80b78f1b2"


def _ensure_label(name: str) -> str | None:
    """Create a label if it doesn't exist, return its ID."""
    query = """
    mutation CreateLabel($teamId: String!, $name: String!, $color: String!) {
        issueLabelCreate(input: { teamId: $teamId, name: $name, color: $color }) {
            success
            issueLabel { id name }
        }
    }
    """
    colors = {"P1-Critical": "#dc2626", "P2-High": "#ea580c", "P3-Medium": "#ca8a04", "P4-Low": "#6b7280"}
    color = colors.get(name, "#6b7280")
    try:
        resp = httpx.post(
            "https://api.linear.app/graphql",
            json={"query": query, "variables": {"teamId": settings.linear_team_id, "name": name, "color": color}},
            headers={"Authorization": settings.linear_api_key, "Content-Type": "application/json"},
            timeout=10,
        )
        data = resp.json()
        label = data.get("data", {}).get("issueLabelCreate", {}).get("issueLabel", {})
        return label.get("id")
    except Exception:
        return None


def create_linear_ticket(title: str, description: str, severity: str) -> str:
    """Create a Linear issue via GraphQL API."""
    if not settings.linear_api_key or not settings.linear_team_id:
        log.info("linear_skipped", reason="Linear API key or team ID not configured")
        return json.dumps({"status": "skipped", "reason": "Linear API key or team ID not configured"})

    priority = SEVERITY_PRIORITY.get(severity, 3)

    mutation = """
    mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
            success
            issue {
                id
                identifier
                url
                assignee { name }
            }
        }
    }
    """

    issue_input = {
        "title": f"[{severity}] {title}",
        "description": description,
        "teamId": settings.linear_team_id,
        "priority": priority,
        "stateId": STATE_MAP.get(severity, STATE_MAP["P3"]),
    }

    # Build label list: Bug + severity label
    sev_label_id = _ensure_label(SEVERITY_LABELS.get(severity, "P3-Medium"))
    label_ids = [BUG_LABEL_ID]
    if sev_label_id:
        label_ids.append(sev_label_id)
    issue_input["labelIds"] = label_ids

    # Auto-assign P1/P2 incidents to the default assignee
    if settings.linear_default_assignee_id and severity in ("P1", "P2"):
        issue_input["assigneeId"] = settings.linear_default_assignee_id

    variables = {"input": issue_input}

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
