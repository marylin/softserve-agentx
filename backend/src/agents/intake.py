import json
import re
from uuid import UUID

from src.agents.base import run_agent
from src.agents.tools.files import extract_video_frames, process_image, process_log
from src.models.schemas import IntakeResult
from src.observability.logging import get_logger
from src.security.guardrails import wrap_user_content

log = get_logger("agents.intake")

SYSTEM_PROMPT = """You are an SRE Incident Intake Agent. Your job is to analyze incoming incident reports
and extract structured information.

Your tasks:
1. Analyze the incident title and description
2. Extract key technical details (error messages, affected services, timestamps, URLs)
3. If images are provided, describe what you see (error screenshots, dashboards, etc.)
4. If logs are provided, identify the most relevant error patterns
5. If video frames are provided, describe the timeline of events
6. Check for potential duplicate incidents by comparing with open incidents

Output a JSON object with these fields:
{
    "title": "cleaned/improved incident title",
    "description": "enriched description with extracted details",
    "extracted_details": {
        "error_messages": [],
        "affected_services": [],
        "timestamps": [],
        "urls": [],
        "environment": ""
    },
    "visual_summary": "description of what images show (or null)",
    "log_analysis": "summary of log findings (or null)",
    "video_timeline": "timeline from video frames (or null)",
    "duplicate_of": "incident ID if duplicate detected (or null)"
}

Be precise and technical. Do not speculate beyond what the evidence shows."""


def run_intake_agent(
    title: str,
    description: str,
    attachments: list[dict],
    open_incidents: list[dict],
    trace_span=None,
) -> IntakeResult:
    """Run the intake agent to analyze an incident report.

    Args:
        title: Incident title
        description: Incident description
        attachments: List of {"type": ..., "file_path": ...} dicts
        open_incidents: List of {"id": ..., "title": ..., "description": ...} for duplicate detection
        trace_span: Optional Langfuse span
    """
    # Build the multimodal message content
    content_parts = []

    # Text portion with user input wrapped in XML tags
    incident_text = f"Title: {title}\n\nDescription: {description}"
    wrapped = wrap_user_content(incident_text)

    if open_incidents:
        open_list = "\n".join(
            f"- [{inc['id']}] {inc['title']}: {inc.get('description', '')[:200]}"
            for inc in open_incidents
        )
        wrapped += f"\n\n<open_incidents>\n{open_list}\n</open_incidents>"

    content_parts.append({"type": "text", "text": wrapped})

    # Process attachments
    for att in attachments:
        att_type = att.get("type", "")
        file_path = att.get("file_path", "")

        try:
            if att_type == "image":
                img = process_image(file_path)
                content_parts.append(
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": img["media_type"],
                            "data": img["data"],
                        },
                    }
                )
            elif att_type == "log":
                log_text = process_log(file_path)
                content_parts.append(
                    {
                        "type": "text",
                        "text": f"<log_file name=\"{att.get('original_filename', 'log')}\">\n{log_text}\n</log_file>",
                    }
                )
            elif att_type == "video":
                frames = extract_video_frames(file_path)
                for i, frame in enumerate(frames):
                    content_parts.append(
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": frame["media_type"],
                                "data": frame["data"],
                            },
                        }
                    )
                    content_parts.append(
                        {"type": "text", "text": f"(video frame {i + 1}/{len(frames)})"}
                    )
        except Exception as exc:
            log.warning("attachment_processing_failed", type=att_type, file=file_path, error=str(exc))

    # Run the agent (no tools -- pure vision/text analysis)
    raw = run_agent(
        name="intake",
        system_prompt=SYSTEM_PROMPT,
        user_message=content_parts,
        trace_span=trace_span,
    )

    # Parse JSON from response
    return _parse_intake_response(raw)


def _parse_intake_response(raw: str) -> IntakeResult:
    """Try to parse the agent response as JSON, falling back to raw extraction."""
    # Try to find JSON in the response
    json_match = re.search(r"\{[\s\S]*\}", raw)
    if json_match:
        try:
            data = json.loads(json_match.group())
            return IntakeResult(
                title=data.get("title", ""),
                description=data.get("description", ""),
                extracted_details=data.get("extracted_details", {}),
                visual_summary=data.get("visual_summary"),
                log_analysis=data.get("log_analysis"),
                video_timeline=data.get("video_timeline"),
                duplicate_of=UUID(data["duplicate_of"]) if data.get("duplicate_of") else None,
            )
        except (json.JSONDecodeError, ValueError, KeyError) as exc:
            log.warning("intake_json_parse_failed", error=str(exc))

    # Fallback: extract what we can from raw text
    log.warning("intake_fallback_extraction", raw_length=len(raw))
    return IntakeResult(
        title="",
        description=raw[:2000],
        extracted_details={"raw_response": raw[:1000]},
        visual_summary=None,
        log_analysis=None,
        video_timeline=None,
        duplicate_of=None,
    )
