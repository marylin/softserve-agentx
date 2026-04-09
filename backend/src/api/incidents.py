import asyncio
import uuid
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
            reporter_name=inc.reporter_name,
            severity=inc.triage_result.severity if inc.triage_result else None,
            created_at=inc.created_at,
            updated_at=inc.updated_at,
        )
        for inc in incidents
    ]


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


def _classify_file(content_type: str, ext: str) -> str:
    if content_type.startswith("image/") or ext in ("png", "jpg", "jpeg", "webp"):
        return "image"
    if content_type.startswith("video/") or ext in ("webm", "mp4"):
        return "video"
    return "log"
