import json
import re

from src.agents.base import run_agent
from src.agents.tools.codebase import CODEBASE_TOOL_HANDLERS, CODEBASE_TOOLS
from src.models.schemas import IntakeResult, SeverityLevel, TriageResult
from src.observability.logging import get_logger
from src.security.guardrails import wrap_user_content

log = get_logger("agents.triage")

SYSTEM_PROMPT = """You are an SRE Triage Agent. You analyze incident reports and determine severity,
affected modules, and recommended actions.

SEVERITY CRITERIA:
- P1 (Critical): Production down, data loss, security breach, all users affected. Immediate response required.
- P2 (High): Major feature broken, significant performance degradation, partial outage. Response within 1 hour.
- P3 (Medium): Non-critical feature broken, workaround available, limited user impact. Response within 4 hours.
- P4 (Low): Minor issue, cosmetic, documentation, low-priority enhancement. Response within 24 hours.

ANALYSIS STRATEGY:
1. Search for relevant modules and documentation
2. Look up error patterns if error messages are present
3. Read source files if specific code paths are mentioned
4. Check API routes if endpoint issues are reported
5. Cross-reference with known error patterns

Use the provided tools to investigate the codebase before making your assessment.

Output a JSON object:
{
    "severity": "P1|P2|P3|P4",
    "confidence": 0.0-1.0,
    "summary": "Technical summary of the issue and likely root cause",
    "affected_modules": ["module1", "module2"],
    "code_references": [
        {"file": "path/to/file.ts", "line": 42, "description": "relevant code snippet"}
    ],
    "runbook_steps": [
        "Step 1: ...",
        "Step 2: ..."
    ]
}

Be thorough in your investigation but efficient with tool calls."""


def run_triage_agent(
    intake_result: IntakeResult,
    trace_span=None,
) -> TriageResult:
    """Run the triage agent to assess severity and identify affected modules."""
    # Build user message with wrapped content
    details_str = json.dumps(intake_result.extracted_details, indent=2)

    message = wrap_user_content(
        f"Incident Title: {intake_result.title}\n\n"
        f"Description: {intake_result.description}\n\n"
        f"Extracted Details:\n{details_str}"
    )

    if intake_result.visual_summary:
        message += f"\n\nVisual Analysis: {intake_result.visual_summary}"
    if intake_result.log_analysis:
        message += f"\n\nLog Analysis: {intake_result.log_analysis}"
    if intake_result.video_timeline:
        message += f"\n\nVideo Timeline: {intake_result.video_timeline}"

    raw = run_agent(
        name="triage",
        system_prompt=SYSTEM_PROMPT,
        user_message=message,
        tools=CODEBASE_TOOLS,
        tool_handlers=CODEBASE_TOOL_HANDLERS,
        trace_span=trace_span,
    )

    return _parse_triage_response(raw)


def _parse_triage_response(raw: str) -> TriageResult:
    """Parse triage agent response into TriageResult."""
    json_match = re.search(r"\{[\s\S]*\}", raw)
    if json_match:
        try:
            data = json.loads(json_match.group())
            severity = data.get("severity", "P3").upper()
            if severity not in ("P1", "P2", "P3", "P4"):
                severity = "P3"

            confidence = float(data.get("confidence", 0.5))
            confidence = max(0.0, min(1.0, confidence))

            return TriageResult(
                severity=SeverityLevel(severity),
                confidence=confidence,
                summary=data.get("summary", ""),
                affected_modules=data.get("affected_modules", []),
                code_references=data.get("code_references", []),
                runbook_steps=data.get("runbook_steps", []),
            )
        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            log.warning("triage_json_parse_failed", error=str(exc))

    # Fallback
    log.warning("triage_fallback", raw_length=len(raw))
    return TriageResult(
        severity=SeverityLevel.P3,
        confidence=0.3,
        summary=raw[:500],
        affected_modules=[],
        code_references=[],
        runbook_steps=["Manual investigation required"],
    )
