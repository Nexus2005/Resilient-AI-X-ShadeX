"""Post-approval undertakings: list, verify and mark deficient. Officers only verify."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import get_current_user
from app.core.signing import verify_sign_token
from app.engines.audit import append_audit
from app.engines.notify import notify
from app.models import Application, Document, Institution, Obligation, User

router = APIRouter(prefix="/obligations", tags=["obligations"])

REVIEW_ROLES = ("bureau_officer", "admin", "regional_officer")


class ObligationOut(BaseModel):
    id: uuid.UUID
    application_id: uuid.UUID | None
    app_no: str | None
    institution_name: str
    title: str
    type: str
    source_ref: str
    evidence_required: str
    due_at: datetime
    state: str
    evidence_count: int
    verified_at: datetime | None
    verified_by: str | None


class DeficientRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=1000)


def _statement(user: User):
    statement = (
        select(Obligation, Institution, Application)
        .join(Institution, Institution.id == Obligation.institution_id)
        .outerjoin(Application, Application.id == Obligation.application_id)
    )
    if user.role == "institution":
        statement = statement.where(Obligation.institution_id == user.institution_id)
    elif user.role in ("regional_officer", "evc_coordinator"):
        statement = statement.where(Institution.region_id == user.region_id)
    return statement


def _out(session: Session, obligation: Obligation, institution: Institution, application) -> ObligationOut:
    evidence = session.scalar(
        select(Document.id).where(Document.obligation_id == obligation.id).limit(1)
    )
    verifier = session.get(User, obligation.verified_by) if obligation.verified_by else None
    return ObligationOut(
        id=obligation.id,
        application_id=obligation.application_id,
        app_no=application.app_no if application is not None else None,
        institution_name=institution.name,
        title=obligation.title,
        type=obligation.type,
        source_ref=obligation.source_ref,
        evidence_required=obligation.evidence_required,
        due_at=obligation.due_at,
        state=obligation.state,
        evidence_count=1 if evidence else 0,
        verified_at=obligation.verified_at,
        verified_by=verifier.name if verifier else None,
    )


@router.get("", response_model=list[ObligationOut])
def list_obligations(
    state: str | None = None,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ObligationOut]:
    statement = _statement(user)
    if state:
        statement = statement.where(Obligation.state == state)
    rows = session.execute(statement.order_by(Obligation.due_at).limit(200)).all()
    return [_out(session, obligation, institution, application) for obligation, institution, application in rows]


def _obligation(session: Session, obligation_id: uuid.UUID, user: User) -> tuple[Obligation, Institution, Application | None]:
    row = session.execute(_statement(user).where(Obligation.id == obligation_id)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Undertaking not found.")
    obligation, institution, application = row
    return obligation, institution, application


@router.post("/{obligation_id}/verify", response_model=ObligationOut)
def verify_obligation(
    obligation_id: uuid.UUID,
    x_sign_token: str | None = Header(default=None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ObligationOut:
    if user.role not in REVIEW_ROLES:
        raise HTTPException(status_code=403, detail="Only an officer can verify an undertaking.")
    if not x_sign_token or not verify_sign_token(x_sign_token, str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign this verification with your password before recording it.",
        )

    obligation, institution, application = _obligation(session, obligation_id, user)
    if obligation.state == "verified":
        raise HTTPException(status_code=400, detail="This undertaking is already verified.")
    if obligation.state != "submitted":
        raise HTTPException(
            status_code=400,
            detail="The institution has not submitted evidence for this undertaking yet.",
        )

    from app.core.clock import now_utc

    obligation.state = "verified"
    obligation.verified_by = user.id
    obligation.verified_at = now_utc()
    session.add(obligation)
    append_audit(
        session,
        actor=user,
        action="obligation.verified",
        entity_type="obligation",
        entity_id=obligation.id,
        payload={"title": obligation.title, "institution": institution.name, "signed": True},
    )
    notify(
        session,
        user=_institution_user(session, institution),
        template_key="obligation_verified",
        context={"title": obligation.title, "institution": institution.name},
        entity_type="obligation",
        entity_id=obligation.id,
        trigger_key=f"obligation_verified:{obligation.id}",
        trigger="workflow",
    )
    session.commit()
    return _out(session, obligation, institution, application)


@router.post("/{obligation_id}/deficient", response_model=ObligationOut)
def mark_deficient(
    obligation_id: uuid.UUID,
    payload: DeficientRequest,
    x_sign_token: str | None = Header(default=None),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ObligationOut:
    if user.role not in REVIEW_ROLES:
        raise HTTPException(status_code=403, detail="Only an officer can record a deficiency.")
    if not x_sign_token or not verify_sign_token(x_sign_token, str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign this decision with your password before recording it.",
        )

    obligation, institution, application = _obligation(session, obligation_id, user)
    if obligation.state == "verified":
        raise HTTPException(
            status_code=400,
            detail="A verified undertaking cannot be marked deficient without a new decision.",
        )

    obligation.state = "deficient"
    obligation.verified_by = user.id
    session.add(obligation)
    append_audit(
        session,
        actor=user,
        action="obligation.deficient",
        entity_type="obligation",
        entity_id=obligation.id,
        payload={"title": obligation.title, "reason": payload.reason, "signed": True},
    )
    notify(
        session,
        user=_institution_user(session, institution),
        template_key="obligation_deficient",
        context={
            "title": obligation.title,
            "institution": institution.name,
            "reason": payload.reason,
        },
        entity_type="obligation",
        entity_id=obligation.id,
        trigger_key=f"obligation_deficient:{obligation.id}:{obligation.updated_at or obligation.due_at}",
        trigger="workflow",
    )
    session.commit()
    return _out(session, obligation, institution, application)


def _institution_user(session: Session, institution: Institution) -> User | None:
    return session.scalar(
        select(User).where(
            User.role == "institution", User.institution_id == institution.id, User.active.is_(True)
        )
    )
