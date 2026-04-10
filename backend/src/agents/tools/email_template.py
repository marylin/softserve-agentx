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


def _footer() -> str:
    return f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:32px;border-top:1px solid {BORDER};">
        <tr><td style="padding:16px 0;color:{TEXT_DIM};font-size:12px;font-family:{FONT_STACK};">
            Thank you for reporting this issue. If the problem persists, please open a new incident.
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
                {_footer()}
            </td></tr>
        </table>
    </div>"""


def build_routing_email(
    title: str,
    severity: str,
    summary: str,
    ticket_id: str | None = None,
    ticket_url: str | None = None,
) -> str:
    """Build the initial routing notification email sent to the reporter."""
    sev_color = SEVERITY_COLORS.get(severity, TEXT_DIM)
    ticket_html = ""
    if ticket_url and ticket_id:
        ticket_html = f'<p style="color:{TEXT_MUTED};font-size:14px;margin:0 0 8px;font-family:{FONT_STACK};">Ticket: <a href="{ticket_url}" style="color:{TEAL};text-decoration:none;">{ticket_id}</a></p>'

    content = f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0c1425;border:1px solid #1e3a5f;border-radius:8px;">
        <tr><td style="padding:16px;text-align:center;">
            <span style="color:{TEAL};font-size:16px;font-weight:600;font-family:{FONT_STACK};">Incident received and triaged</span>
        </td></tr>
    </table>

    <h2 style="color:{TEXT};font-size:18px;margin:24px 0 8px;font-family:{FONT_STACK};">{title}</h2>

    <div style="margin:16px 0;">
        <span style="display:inline-block;background:{sev_color};color:#fff;font-size:11px;font-weight:700;border-radius:4px;padding:2px 10px;font-family:{FONT_STACK};">{severity}</span>
    </div>

    {ticket_html}

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border:1px solid {BORDER};border-radius:8px;overflow:hidden;">
        <tr><td style="background:{CARD};padding:16px;">
            <p style="color:{TEXT_MUTED};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;font-family:{FONT_STACK};">Triage Summary</p>
            <p style="color:#d1d5db;font-size:14px;line-height:1.5;margin:0;font-family:{FONT_STACK};">{summary}</p>
        </td></tr>
    </table>

    <p style="color:{TEXT_MUTED};font-size:13px;margin:24px 0 0;font-family:{FONT_STACK};">
        Our SRE agent has automatically triaged this incident. An engineer will review and work on a fix.
        You will receive another email when this incident is resolved.
    </p>"""

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
    ticket_link = ""
    if ticket_url and ticket_id:
        ticket_link = f'<a href="{ticket_url}" style="color:{TEAL};text-decoration:none;">{ticket_id}</a>'
    else:
        ticket_link = ticket_id or "N/A"

    triage_section = ""
    if severity and summary:
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

        triage_section = f"""
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

    content = f"""
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#052e16;border:1px solid #166534;border-radius:8px;">
        <tr><td style="padding:16px;text-align:center;">
            <span style="color:#4ade80;font-size:16px;font-weight:600;font-family:{FONT_STACK};">&#10003; Incident Resolved</span>
        </td></tr>
    </table>

    <h2 style="color:{TEXT};font-size:18px;margin:24px 0 8px;font-family:{FONT_STACK};">{title}</h2>

    <p style="color:{TEXT_MUTED};font-size:14px;margin:0 0 8px;font-family:{FONT_STACK};">
        Ticket: {ticket_link}
    </p>

    {triage_section}"""

    return _wrap(content)
