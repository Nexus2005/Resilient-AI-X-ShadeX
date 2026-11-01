import hashlib
import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_session
from app.core.deps import get_current_user
from app.core.signing import verify_sign_token
from app.engines.audit import append_audit
from app.engines.notify import notify
from app.engines.workflow import region_scope_ok
from app.models import Application, Document, Institution, Obligation, Region, User

router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_TYPES = {"application/pdf", "image/jpeg", "image/png"}
MAX_BYTES = 10 * 1024 * 1024
SIGNATURES = {
    "application/pdf": b"%PDF",
    "image/jpeg": b"\xff\xd8\xff",
    "image/png": b"\x89PNG",
}


class DocumentOut(BaseModel):
    id: uuid.UUID
    type: str
    version: int
    application_id: uuid.UUID | None
    obligation_id: uuid.UUID | None
    parent_id: uuid.UUID | None
    institution_id: uuid.UUID
    institution_name: str
    file_name: str
    issue_date: date | None
    expiry_date: date | None
    dates_confirmed: bool
    verification_state: str
    created_at: str


class ConfirmDatesRequest(BaseModel):
    issue_date: date | None = None
    expiry_date: date | None = None


def _to_out(document: Document, institution: Institution | None = None) -> DocumentOut:
    return DocumentOut(
        id=document.id,
        type=document.type,
        version=document.version,
        application_id=document.application_id,
        obligation_id=document.obligation_id,
        parent_id=document.parent_id,
        institution_id=document.institution_id,
        institution_name=institution.name if institution else "",
        file_name=document.original_name or Path(document.file_path).name,
        issue_date=document.issue_date,
        expiry_date=document.expiry_date,
        dates_confirmed=document.dates_confirmed,
        verification_state=document.verification_state,
        created_at=document.created_at.isoformat(),
    )


@router.get("", response_model=list[DocumentOut])
def list_documents(
    application_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[DocumentOut]:
    query = select(Document).join(Institution, Institution.id == Document.institution_id)
    if user.role == "institution":
        query = query.where(Document.institution_id == user.institution_id)
    elif user.role in ("regional_officer", "evc_coordinator"):
        query = query.where(Institution.region_id == user.region_id)
    if application_id is not None:
        query = query.where(Document.application_id == application_id)
    documents = session.scalars(query.order_by(Document.created_at.desc()).limit(200)).all()
    institutions = {
        institution.id: institution
        for institution in session.scalars(
            select(Institution).where(
                Institution.id.in_({document.institution_id for document in documents})
            )
        ).all()
    }
    return [_to_out(document, institutions.get(document.institution_id)) for document in documents]


@router.post("", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    type: str = Form(...),
    application_id: uuid.UUID | None = Form(None),
    obligation_id: uuid.UUID | None = Form(None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DocumentOut:
    if user.role != "institution" or user.institution_id is None:
        raise HTTPException(status_code=403, detail="Only an institution can upload evidence.")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400, detail="Upload a PDF, JPEG or PNG file."
        )

    payload = await file.read(MAX_BYTES + 1)
    if len(payload) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Files must be 10 MB or smaller.")
    if not payload.startswith(SIGNATURES[content_type]):
        raise HTTPException(
            status_code=400, detail="The file contents do not match its declared type."
        )

    institution = session.get(Institution, user.institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found.")

    if application_id is not None:
        application = session.get(Application, application_id)
        if application is None or not region_scope_ok(session, user, institution):
            raise HTTPException(status_code=404, detail="Application not found.")
        if application.institution_id != institution.id:
            raise HTTPException(status_code=403, detail="This application belongs to another institution.")

    if obligation_id is not None:
        obligation = session.get(Obligation, obligation_id)
        if obligation is None or obligation.institution_id != institution.id:
            raise HTTPException(status_code=404, detail="Undertaking not found.")

    storage = Path(settings.storage_dir)
    storage.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "upload").suffix.lower()
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    (storage / stored_name).write_bytes(payload)

    document = Document(
        institution_id=institution.id,
        application_id=application_id,
        obligation_id=obligation_id,
        type=type,
        version=1,
        file_path=stored_name,
        original_name=Path(file.filename or "upload").name[:255],
        sha256=hashlib.sha256(payload).hexdigest(),
        dates_confirmed=False,
        ocr_suggestion={},
        verification_state="unverified",
    )
    session.add(document)
    session.flush()

    append_audit(
        session,
        actor=user,
        action="document.uploaded",
        entity_type="document",
        entity_id=document.id,
        payload={"type": type, "sha256": document.sha256, "bytes": len(payload)},
    )
    if obligation_id is not None:
        obligation = session.get(Obligation, obligation_id)
        if obligation is not None and obligation.state in ("due_soon", "not_due", "overdue", "deficient"):
            obligation.state = "submitted"

    session.commit()
    return _to_out(document, institution)


def _read_upload(file: UploadFile, payload: bytes) -> None:
    if (file.content_type or "") not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Upload a PDF, JPEG or PNG file.")
    if len(payload) > MAX_BYTES:
        raise HTTPException(status_code=400, detail="Files must be 10 MB or smaller.")
    if not payload.startswith(SIGNATURES[file.content_type or ""]):
        raise HTTPException(
            status_code=400, detail="The file contents do not match its declared type."
        )


@router.post("/{document_id}/confirm-dates", response_model=DocumentOut)
def confirm_dates(
    document_id: uuid.UUID,
    payload: ConfirmDatesRequest,
    x_sign_token: str | None = Header(default=None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DocumentOut:
    """An officer confirms the issue and expiry dates; the expiry clock starts then."""
    if user.role not in ("regional_officer", "bureau_officer", "admin"):
        raise HTTPException(status_code=403, detail="Only an officer can confirm document dates.")
    if not x_sign_token or not verify_sign_token(x_sign_token, str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign this confirmation with your password before recording it.",
        )

    document = session.get(Document, document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    institution = session.get(Institution, document.institution_id)
    if institution is None or not region_scope_ok(session, user, institution):
        raise HTTPException(status_code=404, detail="Document not found.")
    if payload.expiry_date is not None and payload.issue_date is not None:
        if payload.expiry_date <= payload.issue_date:
            raise HTTPException(
                status_code=400, detail="The expiry date must fall after the issue date."
            )

    document.issue_date = payload.issue_date
    document.expiry_date = payload.expiry_date
    document.dates_confirmed = True
    document.verification_state = "verified"
    session.add(document)
    append_audit(
        session,
        actor=user,
        action="document.dates_confirmed",
        entity_type="document",
        entity_id=document.id,
        payload={
            "issue_date": payload.issue_date.isoformat() if payload.issue_date else None,
            "expiry_date": payload.expiry_date.isoformat() if payload.expiry_date else None,
            "type": document.type,
            "signed": True,
        },
    )
    applicant = session.scalar(
        select(User).where(
            User.role == "institution", User.institution_id == institution.id, User.active.is_(True)
        )
    )
    if applicant is not None:
        notify(
            session,
            user=applicant,
            template_key="document_dates_confirmed",
            context={"document_type": document.type.replace("_", " "), "institution": institution.name},
            entity_type="document",
            entity_id=document.id,
            trigger_key=f"document_confirmed:{document.id}",
            trigger="workflow",
        )
    session.commit()
    return _to_out(document, institution)


@router.post("/{document_id}/renew", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def renew_document(
    document_id: uuid.UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> DocumentOut:
    """Institution uploads the next version; the previous one stays in the chain."""
    if user.role != "institution" or user.institution_id is None:
        raise HTTPException(status_code=403, detail="Only the owning institution can renew a document.")

    parent = session.get(Document, document_id)
    if parent is None or parent.institution_id != user.institution_id:
        raise HTTPException(status_code=404, detail="Document not found.")

    payload = await file.read(MAX_BYTES + 1)
    _read_upload(file, payload)

    institution = session.get(Institution, user.institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found.")

    root = parent
    while root.parent_id is not None:
        earlier = session.get(Document, root.parent_id)
        if earlier is None:
            break
        root = earlier
    siblings = session.scalars(
        select(Document).where(
            Document.institution_id == parent.institution_id,
            Document.type == parent.type,
            Document.application_id == parent.application_id,
            Document.obligation_id == parent.obligation_id,
        )
    ).all()
    children: dict[uuid.UUID, list[Document]] = {}
    for item in siblings:
        if item.parent_id is not None:
            children.setdefault(item.parent_id, []).append(item)
    latest_version = root.version
    frontier = [root]
    while frontier:
        current = frontier.pop()
        for child in children.get(current.id, []):
            latest_version = max(latest_version, child.version)
            frontier.append(child)

    storage = Path(settings.storage_dir)
    storage.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "upload").suffix.lower()
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    (storage / stored_name).write_bytes(payload)

    document = Document(
        institution_id=institution.id,
        application_id=parent.application_id,
        obligation_id=parent.obligation_id,
        type=parent.type,
        version=latest_version + 1,
        parent_id=parent.id,
        file_path=stored_name,
        original_name=Path(file.filename or "upload").name[:255],
        sha256=hashlib.sha256(payload).hexdigest(),
        dates_confirmed=False,
        ocr_suggestion={},
        verification_state="unverified",
    )
    session.add(document)
    session.flush()

    append_audit(
        session,
        actor=user,
        action="document.renewed",
        entity_type="document",
        entity_id=document.id,
        payload={
            "type": parent.type,
            "version": document.version,
            "parent_id": str(parent.id),
        },
    )

    region = session.get(Region, institution.region_id)
    officer = session.scalar(
        select(User).where(
            User.role == "regional_officer", User.region_id == region.id, User.active.is_(True)
        )
    )
    if officer is not None:
        notify(
            session,
            user=officer,
            template_key="document_renewed",
            context={"document_type": parent.type.replace("_", " "), "institution": institution.name},
            entity_type="document",
            entity_id=document.id,
            trigger_key=f"document_renewed:{document.id}",
            trigger="workflow",
        )

    session.commit()
    return _to_out(document, institution)
