"""Workflow action endpoints and the sign endpoint."""

import uuid

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import get_current_user
from app.core.security import verify_password
from app.core.signing import create_sign_token, verify_sign_token
from app.engines import workflow
from app.engines.workflow import WorkflowError
from app.models import Application, User

router = APIRouter(tags=["workflow"])


class SignRequest(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class SignResponse(BaseModel):
    sign_token: str
    expires_in: int


class CreateApplicationRequest(BaseModel):
    type: str
    academic_year: str = "2026-27"


class RevertRequest(BaseModel):
    category: str = Field(min_length=3, max_length=60)
    required_evidence: str = Field(min_length=3, max_length=2000)
    due_days: int = Field(default=7, ge=1, le=60)
    aph_reference: str = Field(default="To be mapped from APH 2024-27", max_length=160)


class Condition(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    evidence_required: str = Field(default="Supporting document", max_length=500)
    source_ref: str = Field(default="To be mapped from APH 2024-27", max_length=160)
    due_days: int = Field(default=90, ge=1, le=730)


class ApproveRequest(BaseModel):
    conditions: list[Condition] = Field(min_length=1, max_length=10)


def _signed(x_sign_token: str | None, user: User) -> None:
    if not x_sign_token or not verify_sign_token(x_sign_token, str(user.id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign this decision with your password before recording it.",
        )


def _application(session: Session, application_id: uuid.UUID, user: User) -> Application:
    application = session.get(Application, application_id)
    if application is None:
        raise HTTPException(status_code=404, detail="Application not found.")
    institution = workflow._institution(session, application)
    if not workflow.region_scope_ok(session, user, institution):
        raise HTTPException(status_code=404, detail="Application not found.")
    return application


def _run(session: Session, action) -> dict:
    try:
        result = action()
        session.commit()
    except WorkflowError as error:
        session.rollback()
        raise HTTPException(status_code=error.status_code, detail=error.detail)
    return result


@router.post("/sign", response_model=SignResponse)
def sign(
    payload: SignRequest, user: User = Depends(get_current_user)
) -> SignResponse:
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The password is not correct. The decision was not recorded.",
        )
    token, ttl = create_sign_token(user)
    return SignResponse(sign_token=token, expires_in=ttl)


@router.post("/applications", status_code=status.HTTP_201_CREATED)
def create_application(
    payload: CreateApplicationRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    def action():
        application = workflow.create_application(session, user, payload.type, payload.academic_year)
        return {"id": str(application.id), "app_no": application.app_no, "route": application.route}

    return _run(session, action)


@router.post("/applications/{application_id}/submit")
def submit_application(
    application_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    application = _application(session, application_id, user)
    return _run(
        session,
        lambda: (
            workflow.submit_application(session, user, application),
            {"status": application.status, "stage": application.current_stage},
        )[1],
    )


@router.post("/applications/{application_id}/revert")
def revert_application(
    application_id: uuid.UUID,
    payload: RevertRequest,
    x_sign_token: str | None = Header(default=None, alias="X-Sign-Token"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    _signed(x_sign_token, user)
    application = _application(session, application_id, user)

    def action():
        revert = workflow.revert_application(
            session,
            user,
            application,
            category=payload.category,
            required_evidence=payload.required_evidence,
            due_days=payload.due_days,
            aph_reference=payload.aph_reference,
        )
        return {"revert_id": str(revert.id), "stage": application.current_stage}

    return _run(session, action)


@router.post("/applications/{application_id}/resubmit")
def resubmit_application(
    application_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    application = _application(session, application_id, user)

    def action():
        workflow.resubmit_application(session, user, application)
        return {"status": application.status, "stage": application.current_stage}

    return _run(session, action)


@router.post("/applications/{application_id}/clear")
def clear_application(
    application_id: uuid.UUID,
    x_sign_token: str | None = Header(default=None, alias="X-Sign-Token"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    _signed(x_sign_token, user)
    application = _application(session, application_id, user)

    def action():
        workflow.clear_application(session, user, application)
        return {"status": application.status, "stage": application.current_stage}

    return _run(session, action)


@router.post("/applications/{application_id}/approve")
def approve_application(
    application_id: uuid.UUID,
    payload: ApproveRequest,
    x_sign_token: str | None = Header(default=None, alias="X-Sign-Token"),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    _signed(x_sign_token, user)
    application = _application(session, application_id, user)

    def action():
        workflow.approve_application(
            session, user, application, [condition.model_dump() for condition in payload.conditions]
        )
        return {
            "status": application.status,
            "stage": application.current_stage,
            "conditions": len(payload.conditions),
        }

    return _run(session, action)
