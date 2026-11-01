import uuid
from datetime import date, datetime

from pydantic import BaseModel


class ApplicationListItem(BaseModel):
    id: uuid.UUID
    app_no: str
    institution_id: uuid.UUID
    institution_name: str
    institution_state: str
    region_id: uuid.UUID
    region_name: str
    type: str
    route: list[str]
    current_stage: str
    status: str
    submitted_at: datetime | None
    owner_name: str | None
    stage_due_at: datetime | None
    total_age_days: int | None
    stage_age_days: int | None
    stage_target_days: int | None
    sla_state: str | None


class ApplicationPage(BaseModel):
    items: list[ApplicationListItem]
    total: int
    page: int
    page_size: int


class HistoryItem(BaseModel):
    id: uuid.UUID
    from_stage: str | None
    to_stage: str
    reason: str
    actor_name: str | None
    created_at: datetime


class StageInfo(BaseModel):
    stage: str
    entered_at: datetime
    due_at: datetime
    owner_name: str | None


class RevertInfo(BaseModel):
    id: uuid.UUID
    category: str
    required_evidence: str
    aph_reference: str
    due_at: datetime
    status: str
    issued_by_name: str | None


class EvcInfo(BaseModel):
    status: str
    priority: int
    queued_at: datetime
    scheduled_for: datetime | None
    completed_at: datetime | None
    panel: list[str]


class CaseDocument(BaseModel):
    id: uuid.UUID
    type: str
    version: int
    file_name: str
    issue_date: date | None
    expiry_date: date | None
    dates_confirmed: bool
    verification_state: str
    created_at: datetime


class CaseObligation(BaseModel):
    id: uuid.UUID
    type: str
    title: str
    state: str
    due_at: datetime
    evidence_required: str
    source_ref: str


class CaseAction(BaseModel):
    event: str
    label: str
    signed: bool


class CaseAuditItem(BaseModel):
    id: int
    action: str
    at: datetime
    actor_name: str | None
    role: str | None
    hash: str
    prev_hash: str


class ApplicationDetail(ApplicationListItem):
    academic_year: str
    locked_fields: list[str]
    rule_version: str | None
    history: list[HistoryItem]
    open_stage: StageInfo | None
    reverts: list[RevertInfo]
    evc: EvcInfo | None
    documents: list[CaseDocument]
    obligations: list[CaseObligation]
    permitted_actions: list[CaseAction]
    audit: list[CaseAuditItem]
    audit_chain_valid: bool
    deadline_days_left: int | None
    summary: str


class ApplicationMeta(BaseModel):
    application_types: dict[str, list[str]]
    required_documents: dict[str, list[str]]
    academic_year: str
    academic_years: list[str]
    rule_version: str | None
