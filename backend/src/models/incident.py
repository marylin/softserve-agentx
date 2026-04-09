import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, Float, ForeignKey, Integer, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    status: Mapped[str] = mapped_column(
        Enum("received", "triaging", "triaged", "routed", "resolved", "failed",
             name="incident_status", create_type=False),
        default="received",
    )
    reporter_email: Mapped[str] = mapped_column(Text)
    reporter_name: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    description: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    attachments: Mapped[list["IncidentAttachment"]] = relationship(back_populates="incident")
    triage_result: Mapped["TriageResultModel | None"] = relationship(
        back_populates="incident", uselist=False, foreign_keys="[TriageResultModel.incident_id]"
    )
    routing_result: Mapped["RoutingResultModel | None"] = relationship(back_populates="incident", uselist=False)


class IncidentAttachment(Base):
    __tablename__ = "incident_attachments"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(
        Enum("image", "log", "video", name="attachment_type", create_type=False)
    )
    file_path: Mapped[str] = mapped_column(Text)
    file_size: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(Text)
    original_filename: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    incident: Mapped["Incident"] = relationship(back_populates="attachments")


class TriageResultModel(Base):
    __tablename__ = "triage_results"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    severity: Mapped[str] = mapped_column(
        Enum("P1", "P2", "P3", "P4", name="severity_level", create_type=False)
    )
    confidence: Mapped[float] = mapped_column(Float)
    summary: Mapped[str] = mapped_column(Text)
    affected_modules: Mapped[dict] = mapped_column(JSONB, default=list)
    code_references: Mapped[dict] = mapped_column(JSONB, default=list)
    runbook_steps: Mapped[dict] = mapped_column(JSONB, default=list)
    duplicate_of: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("incidents.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    incident: Mapped["Incident"] = relationship(
        back_populates="triage_result", foreign_keys=[incident_id]
    )


class RoutingResultModel(Base):
    __tablename__ = "routing_results"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    incident_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("incidents.id", ondelete="CASCADE"))
    linear_ticket_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    linear_ticket_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    slack_message_ts: Mapped[str | None] = mapped_column(Text, nullable=True)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    incident: Mapped["Incident"] = relationship(back_populates="routing_result")


VALID_TRANSITIONS = {
    "received": {"triaging", "failed"},
    "triaging": {"triaged", "failed"},
    "triaged": {"routed", "failed"},
    "routed": {"resolved", "failed"},
    "resolved": set(),
    "failed": set(),
}


def validate_transition(current: str, target: str) -> bool:
    return target in VALID_TRANSITIONS.get(current, set())
