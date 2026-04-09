import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db.database import async_session, get_db
from src.config import settings
from src.models.incident import Incident, IncidentAttachment
from src.security.validation import validate_text_input, validate_file
from src.models.schemas import (
    AttachmentResponse,
    IncidentListItem,
    IncidentResponse,
    IncidentStatus,
    RoutingResponse,
    TriageResponse,
)

router = APIRouter()


def _handle_task_error(task: asyncio.Task):
    if task.cancelled():
        return
    exc = task.exception()
    if exc:
        import traceback
        traceback.print_exception(type(exc), exc, exc.__traceback__)


@router.post("/", status_code=201)
async def create_incident(
    background_tasks: BackgroundTasks,
    title: str = Form(...),
    description: str = Form(...),
    reporter_email: str = Form(...),
    reporter_name: str = Form(...),
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
):
    # Validate text inputs
    valid, err = validate_text_input(title)
    if not valid:
        raise HTTPException(status_code=400, detail=f"Invalid title: {err}")
    valid, err = validate_text_input(description)
    if not valid:
        raise HTTPException(status_code=400, detail=f"Invalid description: {err}")

    # Validate uploaded files
    for f in files:
        if f.filename and f.size:
            valid, err = validate_file(f.filename, f.content_type or "", f.size)
            if not valid:
                raise HTTPException(status_code=400, detail=f"Invalid file '{f.filename}': {err}")

    incident = Incident(
        title=title,
        description=description,
        reporter_email=reporter_email,
        reporter_name=reporter_name,
        status="received",
    )
    db.add(incident)
    await db.flush()

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    for f in files:
        if f.size and f.size > 0:
            file_ext = f.filename.split(".")[-1] if f.filename else "bin"
            file_path = str(upload_dir / f"{incident.id}_{uuid.uuid4().hex[:8]}.{file_ext}")
            content = await f.read()
            with open(file_path, "wb") as fp:
                fp.write(content)

            att_type = _classify_file(f.content_type or "", file_ext)
            attachment = IncidentAttachment(
                incident_id=incident.id,
                type=att_type,
                file_path=file_path,
                file_size=len(content),
                mime_type=f.content_type or "application/octet-stream",
                original_filename=f.filename or "unknown",
            )
            db.add(attachment)

    await db.commit()
    await db.refresh(incident)

    async def _run_pipeline():
        from src.agents.orchestrator import run_pipeline
        try:
            async with async_session() as bg_db:
                await run_pipeline(incident.id, bg_db)
        except Exception as exc:
            import traceback
            traceback.print_exception(type(exc), exc, exc.__traceback__)

    background_tasks.add_task(_run_pipeline)

    return {"id": str(incident.id), "status": incident.status}


@router.post("/suggest")
async def suggest_description(title: str = Form(""), affected_area: str = Form("")):
    """Use Claude to suggest a structured incident description."""
    if not title:
        raise HTTPException(status_code=400, detail="Title is required")

    import anthropic

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

    area_context = f" in the {affected_area} area" if affected_area else ""

    response = client.messages.create(
        model=settings.llm_model,
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": f"Generate a concise, structured incident report for an e-commerce platform issue. Title: '{title}'{area_context}.\n\nUse this format exactly:\n\n**What happened:**\n[1-2 sentences]\n\n**Steps to reproduce:**\n1. [step]\n2. [step]\n3. [step]\n\n**Expected behavior:**\n[1 sentence]\n\n**Actual behavior:**\n[1 sentence]\n\n**Error messages (if any):**\n[any error text or 'None observed']\n\nBe specific and technical. Do not add any other sections."
        }]
    )

    return {"suggestion": response.content[0].text}


@router.get("/config/areas")
async def get_affected_areas():
    from src.agent_config import get_agent_config
    config = get_agent_config()
    areas = config.get("affected_areas", [
        "Cart & Checkout", "Payment Processing", "Product Catalog & Search",
        "Order Management", "Customer Accounts & Auth", "Inventory & Stock",
        "Fulfillment & Shipping", "Promotions & Discounts", "Admin Dashboard",
        "Storefront (General)", "API / Integrations", "Other"
    ])
    return {"areas": areas}


@router.get("/", response_model=list[IncidentListItem])
async def list_incidents(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Incident)
        .options(selectinload(Incident.triage_result))
        .order_by(Incident.created_at.desc())
        .limit(50)
    )
    incidents = result.scalars().all()
    return [
        IncidentListItem(
            id=inc.id,
            status=IncidentStatus(inc.status),
            title=inc.title,
            description=inc.description,
            reporter_name=inc.reporter_name,
            severity=inc.triage_result.severity if inc.triage_result else None,
            created_at=inc.created_at,
            updated_at=inc.updated_at,
        )
        for inc in incidents
    ]


@router.post("/{incident_id}/retry")
async def retry_incident(
    incident_id: uuid.UUID,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Retry triage for a failed incident."""
    result = await db.execute(select(Incident).where(Incident.id == incident_id))
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    if incident.status != "failed":
        raise HTTPException(status_code=400, detail="Only failed incidents can be retried")

    incident.status = "received"
    incident.updated_at = datetime.now(timezone.utc)
    await db.commit()

    async def _run():
        from src.agents.orchestrator import run_pipeline
        try:
            async with async_session() as bg_db:
                await run_pipeline(incident.id, bg_db)
        except Exception as exc:
            import traceback
            traceback.print_exception(type(exc), exc, exc.__traceback__)

    background_tasks.add_task(_run)
    return {"status": "retrying"}


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Incident)
        .where(Incident.id == incident_id)
        .options(
            selectinload(Incident.attachments),
            selectinload(Incident.triage_result),
            selectinload(Incident.routing_result),
        )
    )
    incident = result.scalar_one_or_none()
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    return IncidentResponse(
        id=incident.id,
        status=IncidentStatus(incident.status),
        title=incident.title,
        description=incident.description,
        reporter_name=incident.reporter_name,
        attachments=[
            AttachmentResponse(
                id=a.id, type=a.type, file_size=a.file_size,
                mime_type=a.mime_type, original_filename=a.original_filename,
                created_at=a.created_at,
            )
            for a in incident.attachments
        ],
        triage=(
            TriageResponse(
                severity=incident.triage_result.severity,
                confidence=incident.triage_result.confidence,
                summary=incident.triage_result.summary,
                affected_modules=incident.triage_result.affected_modules,
                code_references=incident.triage_result.code_references,
                runbook_steps=incident.triage_result.runbook_steps,
                duplicate_of=incident.triage_result.duplicate_of,
                created_at=incident.triage_result.created_at,
            )
            if incident.triage_result else None
        ),
        routing=(
            RoutingResponse(
                linear_ticket_id=incident.routing_result.linear_ticket_id,
                linear_ticket_url=incident.routing_result.linear_ticket_url,
                slack_message_ts=incident.routing_result.slack_message_ts,
                email_sent=incident.routing_result.email_sent,
                resolved_at=incident.routing_result.resolved_at,
                resolution_notified=incident.routing_result.resolution_notified,
                created_at=incident.routing_result.created_at,
            )
            if incident.routing_result else None
        ),
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


@router.get("/{incident_id}/attachments/{attachment_id}")
async def get_attachment(
    incident_id: uuid.UUID,
    attachment_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(IncidentAttachment).where(
            IncidentAttachment.id == attachment_id,
            IncidentAttachment.incident_id == incident_id,
        )
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    from fastapi.responses import FileResponse

    return FileResponse(
        attachment.file_path,
        media_type=attachment.mime_type,
        filename=attachment.original_filename,
    )


@router.get("/{incident_id}/similar")
async def get_similar_incidents(incident_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Find incidents with overlapping affected modules."""
    from src.models.incident import TriageResultModel

    # Get this incident's triage
    result = await db.execute(
        select(TriageResultModel).where(TriageResultModel.incident_id == incident_id)
    )
    triage = result.scalar_one_or_none()
    if not triage or not triage.affected_modules:
        return []

    # Find other incidents with same modules
    all_triages = await db.execute(
        select(TriageResultModel, Incident)
        .join(Incident)
        .where(TriageResultModel.incident_id != incident_id)
        .order_by(Incident.created_at.desc())
        .limit(20)
    )

    similar = []
    my_modules = set(triage.affected_modules)
    for t, inc in all_triages.all():
        overlap = my_modules & set(t.affected_modules or [])
        if overlap:
            similar.append({
                "id": str(inc.id),
                "title": inc.title,
                "severity": t.severity,
                "status": inc.status,
                "shared_modules": list(overlap),
                "created_at": inc.created_at.isoformat(),
            })

    return similar[:5]


def _classify_file(content_type: str, ext: str) -> str:
    if content_type.startswith("image/") or ext in ("png", "jpg", "jpeg", "webp"):
        return "image"
    if content_type.startswith("video/") or ext in ("webm", "mp4"):
        return "video"
    return "log"
