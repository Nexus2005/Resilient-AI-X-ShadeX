"""Database models for the whole schema described in docs/02_ARCHITECTURE.md.

Phase 2 defines every table so migrations and seed data are stable; later phases
add workflow and scheduler behaviour on top of these rows.
"""

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.core.clock import now_utc


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Region(Base, TimestampMixin):
    __tablename__ = "regions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    office_city: Mapped[str] = mapped_column(String(80))
    states: Mapped[list[str]] = mapped_column(JSONB, default=list)


class Institution(Base, TimestampMixin):
    __tablename__ = "institutions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    pid: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(160), index=True)
    state: Mapped[str] = mapped_column(String(80), index=True)
    district: Mapped[str] = mapped_column(String(80))
    lat: Mapped[float] = mapped_column()
    lng: Mapped[float] = mapped_column()
    region_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("regions.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="approved")


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), index=True)
    region_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("regions.id"), nullable=True)
    institution_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("institutions.id"), nullable=True
    )
    prefs: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class RuleVersion(Base, TimestampMixin):
    __tablename__ = "rule_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(80))
    version: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    effective_from: Mapped[date] = mapped_column(Date)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    __table_args__ = (UniqueConstraint("name", "version", name="uq_rule_version"),)


class Application(Base, TimestampMixin):
    __tablename__ = "applications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    app_no: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    academic_year: Mapped[str] = mapped_column(String(12))
    route: Mapped[list[str]] = mapped_column(JSONB, default=list)
    current_stage: Mapped[str] = mapped_column(String(40), index=True)
    rule_version_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("rule_versions.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), index=True, default="draft")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    locked_fields: Mapped[list[str]] = mapped_column(JSONB, default=list)


class StageInstance(Base):
    __tablename__ = "stage_instances"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id"), index=True)
    stage: Mapped[str] = mapped_column(String(40))
    entered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    paused_seconds: Mapped[int] = mapped_column(Integer, default=0)
    outcome: Mapped[str | None] = mapped_column(String(40), nullable=True)


class StageHistory(Base):
    __tablename__ = "stage_history"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id"), index=True)
    from_stage: Mapped[str | None] = mapped_column(String(40), nullable=True)
    to_stage: Mapped[str] = mapped_column(String(40))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Revert(Base):
    __tablename__ = "reverts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id"), index=True)
    issued_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    category: Mapped[str] = mapped_column(String(60))
    aph_reference: Mapped[str] = mapped_column(String(160), default="To be mapped from APH 2024-27")
    required_evidence: Mapped[str] = mapped_column(Text)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="open")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EvcCase(Base):
    __tablename__ = "evc_cases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id"), index=True)
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    priority: Mapped[int] = mapped_column(Integer, default=3)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    panel: Mapped[list[str]] = mapped_column(JSONB, default=list)
    report_doc_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), default="queued")


class Expert(Base, TimestampMixin):
    __tablename__ = "experts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    region_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("regions.id"))
    home_district: Mapped[str] = mapped_column(String(80))
    home_institution: Mapped[str] = mapped_column(String(160))
    past_employers: Mapped[list[str]] = mapped_column(JSONB, default=list)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Obligation(Base, TimestampMixin):
    __tablename__ = "obligations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id"), index=True)
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(200))
    source_ref: Mapped[str] = mapped_column(String(160))
    evidence_required: Mapped[str] = mapped_column(Text)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    state: Mapped[str] = mapped_column(String(30), index=True, default="not_due")
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    institution_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("institutions.id"), index=True)
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id"), nullable=True
    )
    obligation_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("obligations.id"), nullable=True
    )
    type: Mapped[str] = mapped_column(String(40))
    version: Mapped[int] = mapped_column(Integer, default=1)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("documents.id"), nullable=True
    )
    file_path: Mapped[str] = mapped_column(String(400))
    original_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sha256: Mapped[str] = mapped_column(String(64))
    issue_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    dates_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    ocr_suggestion: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    verification_state: Mapped[str] = mapped_column(String(30), default="unverified")


class Notification(Base, TimestampMixin):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    channel: Mapped[str] = mapped_column(String(20))
    template_key: Mapped[str] = mapped_column(String(60))
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    trigger: Mapped[str] = mapped_column(String(80))
    trigger_key: Mapped[str] = mapped_column(String(160))
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "entity_type", "entity_id", "trigger_key", "channel", name="uq_notification_dedupe"
        ),
    )


class Escalation(Base):
    __tablename__ = "escalations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    entity_type: Mapped[str] = mapped_column(String(40), index=True)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), index=True)
    level: Mapped[int] = mapped_column(Integer)
    to_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "level", name="uq_escalation_dedupe"),
    )


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    date: Mapped[date] = mapped_column(Date, unique=True)
    label: Mapped[str] = mapped_column(String(120))
    region_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("regions.id"), nullable=True)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64))
    hash: Mapped[str] = mapped_column(String(64), unique=True)


class SystemClock(Base):
    __tablename__ = "system_clock"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    offset_seconds: Mapped[int] = mapped_column(Integer, default=0)


class Summary(Base):
    __tablename__ = "summaries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id"), index=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    method: Mapped[str] = mapped_column(String(20), default="template")
    content: Mapped[str] = mapped_column(Text)
