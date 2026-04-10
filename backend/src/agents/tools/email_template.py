"""Shared email HTML templates for AgentX notifications."""

FONT_STACK = "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
TEAL = "#2dd4bf"
BG = "#030712"
CARD = "#111827"
BORDER = "#1f2937"
TEXT = "#f3f4f6"
TEXT_MUTED = "#9ca3af"
TEXT_DIM = "#6b7280"

SEVERITY_COLORS = {
    "P1": "#f87171",
    "P2": "#fbbf24",
    "P3": "#facc15",
    "P4": "#9ca3af",
}


def _header() -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid {TEAL};padding-bottom:16px;margin-bottom:24px;">
        <tr>
            <td style="font-size:20px;font-weight:700;color:{TEXT};padding-bottom:16px;font-family:{FONT_STACK};">
                Agent<span style="color:{TEAL};">X</span>
                <span style="font-weight:400;font-size:14px;color:{TEXT_MUTED};margin-left:8px;">SRE Triage</span>
            </td>
        </tr>
    </table>"""


def _footer(message: str = "Thank you for reporting this issue. If the problem persists, please open a new incident.") -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid {BORDER};">
        <tr><td style="padding:16px 0;color:{TEXT_DIM};font-size:12px;font-family:{FONT_STACK};">
            {message}
        </td></tr>
        <tr><td style="color:#4b5563;font-size:11px;font-family:{FONT_STACK};">AgentX SRE Triage System</td></tr>
    </table>"""


def _wrap(content: str) -> str:
    return f"""
    <div style="background:{BG};padding:40px 0;font-family:{FONT_STACK};">
        <table width="600" cellpadding="0" cellspacing="0" style="margin:0 auto;background:{BG};">
            <tr><td style="padding:0 24px;">
                {_header()}
                {content}
            </td></tr>
        </table>
    </div>"""


def _status_banner(text: str, bg_color: str, border_color: str, text_color: str) -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="background:{bg_color};border:1px solid {border_color};border-radius:8px;">
        <tr><td style="padding:16px;text-align:center;">
            <span style="color:{text_color};font-size:16px;font-weight:600;font-family:{FONT_STACK};">{text}</span>
        </td></tr>
    </table>"""


def _ticket_line(ticket_id: str | None, ticket_url: str | None) -> str:
    if ticket_url and ticket_id:
        return f'<p style="color:{TEXT_MUTED};font-size:14px;margin:0 0 8px;font-family:{FONT_STACK};">Ticket: <a href="{ticket_url}" style="color:{TEAL};text-decoration:none;">{ticket_id}</a></p>'
    elif ticket_id:
        return f'<p style="color:{TEXT_MUTED};font-size:14px;margin:0 0 8px;font-family:{FONT_STACK};">Ticket: {ticket_id}</p>'
    return ""


def _triage_card(
    severity: str | None = None,
    summary: str | None = None,
    affected_modules: list | None = None,
    runbook_steps: list | None = None,
) -> str:
    if not severity or not summary:
        return ""

    sev_color = SEVERITY_COLORS.get(severity, TEXT_DIM)

    modules_html = ""
    if affected_modules:
        pills = "".join(
            f'<span style="display:inline-block;background:{BORDER};border-radius:4px;'
            f'padding:2px 8px;margin:2px 4px 2px 0;font-size:12px;color:#d1d5db;font-family:{FONT_STACK};">{m}</span>'
            for m in affected_modules
        )
        modules_html = f"""
        <tr><td style="padding:12px 0 4px;color:{TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-family:{FONT_STACK};">
            Affected Modules</td></tr>
        <tr><td style="padding:0 0 12px;">{pills}</td></tr>"""

    runbook_html = ""
    if runbook_steps:
        steps = "".join(
            f'<li style="color:#d1d5db;padding:4px 0;font-family:{FONT_STACK};">{step}</li>'
            for step in runbook_steps
        )
        runbook_html = f"""
        <tr><td style="padding:12px 0 4px;color:{TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;font-family:{FONT_STACK};">
            Runbook Steps</td></tr>
        <tr><td><ol style="margin:0;padding-left:20px;">{steps}</ol></td></tr>"""

    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;border:1px solid {BORDER};border-radius:8px;overflow:hidden;">
        <tr><td style="background:{CARD};padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                    <td style="font-size:14px;font-weight:600;color:{TEXT};font-family:{FONT_STACK};">Triage Summary</td>
                    <td style="text-align:right;">
                        <span style="display:inline-block;background:{sev_color};color:#fff;font-size:11px;font-weight:700;
                            border-radius:4px;padding:2px 10px;font-family:{FONT_STACK};">{severity}</span>
                    </td>
                </tr>
                <tr><td colspan="2" style="padding:12px 0 0;color:#d1d5db;font-size:14px;line-height:1.5;font-family:{FONT_STACK};">
                    {summary}</td></tr>
                {modules_html}
                {runbook_html}
            </table>
        </td></tr>
    </table>"""


def build_routing_email(
    title: str,
    severity: str,
    summary: str,
    affected_modules: list | None = None,
    runbook_steps: list | None = None,
    ticket_id: str | None = None,
    ticket_url: str | None = None,
) -> str:
    """Build the initial routing notification email sent to the reporter."""
    content = f"""
    {_status_banner("Incident received and triaged", "#0c1425", "#1e3a5f", TEAL)}

    <h2 style="color:{TEXT};font-size:18px;margin:24px 0 8px;font-family:{FONT_STACK};">{title}</h2>

    {_ticket_line(ticket_id, ticket_url)}

    {_triage_card(severity, summary, affected_modules, runbook_steps)}

    <p style="color:{TEXT_MUTED};font-size:13px;margin:24px 0 0;font-family:{FONT_STACK};">
        Our SRE agent has automatically triaged this incident. An engineer will review and work on a fix.
        You will receive another email when this incident is resolved.
    </p>

    {_footer()}"""

    return _wrap(content)


def build_resolution_email(
    title: str,
    severity: str | None = None,
    summary: str | None = None,
    affected_modules: list | None = None,
    runbook_steps: list | None = None,
    ticket_id: str | None = None,
    ticket_url: str | None = None,
) -> str:
    """Build the resolution notification email sent to the reporter."""
    content = f"""
    {_status_banner("&#10003; Incident Resolved", "#052e16", "#166534", "#4ade80")}

    <h2 style="color:{TEXT};font-size:18px;margin:24px 0 8px;font-family:{FONT_STACK};">{title}</h2>

    {_ticket_line(ticket_id, ticket_url)}

    {_triage_card(severity, summary, affected_modules, runbook_steps)}

    {_footer()}"""

    return _wrap(content)
