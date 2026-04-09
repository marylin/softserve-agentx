from datetime import datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class IncidentStatus(str, Enum):
    RECEIVED = "received"
    TRIAGING = "triaging"
    TRIAGED = "triaged"
    ROUTED = "routed"
    RESOLVED = "resolved"
    FAILED = "failed"


class SeverityLevel(str, Enum):
    P1 = "P1"
    P2 = "P2"
    P3 = "P3"
    P4 = "P4"


class AttachmentType(str, Enum):
    IMAGE = "image"
    LOG = "log"
    VIDEO = "video"


class IncidentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(..., min_length=1, max_length=5000)
    reporter_email: EmailStr
    reporter_name: str = Field(..., min_length=1, max_length=100)


class AttachmentResponse(BaseModel):
    id: UUID
    type: AttachmentType
    file_size: int
    mime_type: str
    original_filename: str
    created_at: datetime


class TriageResponse(BaseModel):
    severity: SeverityLevel
    confidence: float
    summary: str
    affected_modules: list[str]
    code_references: list[dict]
    runbook_steps: list[str]
    duplicate_of: UUID | None = None
    created_at: datetime


class RoutingResponse(BaseModel):
    linear_ticket_id: str | None = None
    linear_ticket_url: str | None = None
    slack_message_ts: str | None = None
    email_sent: bool
    resolved_at: datetime | None = None
    resolution_notified: bool
    created_at: datetime


class IncidentResponse(BaseModel):
    id: UUID
    status: IncidentStatus
    title: str
    description: str
    reporter_name: str
    attachments: list[AttachmentResponse] = []
    triage: TriageResponse | None = None
    routing: RoutingResponse | None = None
    created_at: datetime
    updated_at: datetime


class IncidentListItem(BaseModel):
    id: UUID
    status: IncidentStatus
    title: str
    reporter_name: str
    severity: SeverityLevel | None = None
    created_at: datetime
    updated_at: datetime


class IntakeResult(BaseModel):
    title: str
    description: str
    extracted_details: dict
    visual_summary: str | None = None
    log_analysis: str | None = None
    video_timeline: str | None = None
    duplicate_of: UUID | None = None


class TriageResult(BaseModel):
    severity: SeverityLevel
    confidence: float
    summary: str
    affected_modules: list[str]
    code_references: list[dict]
    runbook_steps: list[str]


class RoutingResult(BaseModel):
    linear_ticket_id: str | None = None
    linear_ticket_url: str | None = None
    slack_message_ts: str | None = None
    email_sent: bool = False
