"""Module 1 intake API: bundle upload, processing, analysis, checklist, manifest and reports."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audit import log_audit
from app.config import get_settings
from app.db import get_db
from app.models import (
    Application,
    ApplicationCategory,
    ApplicationStatusHistory,
    Document,
    DocumentCategory,
    IntakeChecklist,
    IntakeManifest,
)
from app.schemas import ClassificationCorrectionIn
from app.security import (
    CurrentUser,
    get_current_user,
    user_can_read_application,
    user_can_write_application,
)
from app.services import intake as intake_mod

logger = logging.getLogger("resilient.intake.api")

intake_router = APIRouter(tags=["intake"])


def _application(db: Session, application_id: uuid.UUID, user: CurrentUser, write: bool) -> Application:
    application = db.get(Application, application_id)
    if application is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Application not found")
    allowed = (
        user_can_write_application(db, user, application)
        if write
        else user_can_read_application(db, user, application)
    )
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this application")
    return application


def _document(db: Session, document_id: uuid.UUID, user: CurrentUser, write: bool) -> tuple[Document, Application]:
    document = db.get(Document, document_id)
    if document is None or document.is_deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    application = _application(db, document.application_id, user, write)
    return document, application


# ---------------------------------------------------------------------
# Configuration endpoints
# ---------------------------------------------------------------------


@intake_router.get("/intake/config")
def intake_config(user: CurrentUser = Depends(get_current_user)) -> dict[str, Any]:
    settings = get_settings()
    return {
        "module": "Module 1 — Intelligent Application Intake Gateway",
        "processor_version": settings.INTAKE_PROCESSOR_VERSION,
        "rule_version": settings.INTAKE_RULE_VERSION,
        "accepted_upload_types": ["pdf", "jpg", "jpeg", "png", "zip"],
        "limits": {
            "max_file_mb": settings.MAX_UPLOAD_SIZE_MB,
            "max_bundle_mb": settings.MAX_BUNDLE_SIZE_MB,
            "max_files": settings.MAX_BUNDLE_FILES,
            "max_archive_entries": settings.MAX_ARCHIVE_ENTRIES,
            "max_archive_uncompressed_mb": settings.MAX_ARCHIVE_UNCOMPRESSED_MB,
        },
        "classification_thresholds": {
            "auto_accept": settings.CLASSIFICATION_AUTO_CONFIDENCE,
            "manual_review": settings.CLASSIFICATION_REVIEW_CONFIDENCE,
        },
    }


@intake_router.get("/intake/document-categories")
def document_categories(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    rows = db.scalars(select(DocumentCategory).order_by(DocumentCategory.sort_order, DocumentCategory.name)).all()
    return {
        "categories": [
            {"code": c.code, "name": c.name, "has_expiry": c.has_expiry, "description": c.description}
            for c in rows
        ]
    }


@intake_router.get("/intake/application-categories")
def application_categories(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    rows = db.scalars(select(ApplicationCategory).order_by(ApplicationCategory.sort_order)).all()
    return {
        "categories": [
            {
                "code": c.code,
                "name": c.name,
                "description": c.description,
                "is_enabled": c.is_enabled,
                "source_reference": c.source_reference,
            }
            for c in rows
        ]
    }


@intake_router.get("/intake/checklists")
def checklists(db: Session = Depends(get_db), user: CurrentUser = Depends(get_current_user)):
    rows = db.scalars(
        select(IntakeChecklist).order_by(IntakeChecklist.category_code, IntakeChecklist.academic_year, IntakeChecklist.version)
    ).all()
    return {
        "checklists": [
            {
                "id": str(c.id),
                "code": c.code,
                "name": c.name,
                "category_code": c.category_code,
                "academic_year": c.academic_year,
                "version": c.version,
                "is_provisional": c.is_provisional,
                "source_reference": c.source_reference,
                "effective_from": str(c.effective_from),
                "items": [
                    {
                        "category_code": i.document_category_code,
                        "label": i.label,
                        "requirement": i.requirement,
                        "expected_count": i.expected_count,
                        "guidance": i.guidance,
                    }
                    for i in c.items
                ],
            }
            for c in rows
        ]
    }


# ---------------------------------------------------------------------
# Intake overview across visible applications
# ---------------------------------------------------------------------


@intake_router.get("/intake/applications")
def intake_applications(
    status: str | None = None,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    statement = select(Application).order_by(Application.updated_at.desc())
    if status:
        statement = statement.where(Application.status == status)
    rows = [a for a in db.scalars(statement).all() if user_can_read_application(db, user, a)]
    return {"applications": [intake_mod.overview_state(db, application) for application in rows]}


# ---------------------------------------------------------------------
# Upload + processing
# ---------------------------------------------------------------------


@intake_router.post("/applications/{application_id}/bundle", status_code=201)
async def upload_bundle(
    application_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    expected_category: str | None = Form(None),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    application = _application(db, application_id, user, write=True)
    settings = get_settings()
    if expected_category and db.get(DocumentCategory, expected_category) is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Unknown expected document type")
    payload: list[tuple[str, bytes]] = []
    for upload in files:
        raw = await upload.read(settings.max_upload_bytes + 1)
        if len(raw) > settings.max_upload_bytes:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"{upload.filename}: exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB per-file limit",
            )
        payload.append((upload.filename or "upload.bin", raw))
    if not payload:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No files were received")
    try:
        result = intake_mod.upload_bundle(
            db, application, user, payload, expected_category_code=expected_category
        )
    except intake_mod.IntakeError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc
    log_audit(
        db,
        action="intake.bundle_upload",
        entity_type="application",
        entity_id=str(application.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={
            "files": len(payload),
            "stored": result["stored"],
            "rejected": result["rejected"],
            "skipped": result["skipped"],
            "filenames": [p[0][:120] for p in payload],
            "expected_category": expected_category,
        },
        actor=user,
    )
    return {**result, "application_id": str(application.id)}


@intake_router.post("/applications/{application_id}/intake/process")
def process_application_bundle(
    application_id: uuid.UUID,
    retry_failed: bool = Query(True),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    application = _application(db, application_id, user, write=True)
    wanted = ["uploaded", "queued"]
    if retry_failed:
        wanted += list(intake_mod.FAILED_STATUSES)
    documents = db.scalars(
        select(Document)
        .where(Document.application_id == application.id, Document.is_deleted.is_(False), Document.status.in_(wanted))
        .order_by(Document.created_at)
    ).all()
    results = []
    for document in documents:
        try:
            payload = intake_mod.process_intake_document(db, document, user.id)
            db.commit()
            results.append({"document_id": payload["id"], "status": payload["status"], "filename": payload["filename"]})
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            logger.exception("intake processing failed for %s", document.id)
            results.append({"document_id": str(document.id), "status": "failed", "error": str(exc)[:300]})
    log_audit(
        db,
        action="intake.process_bundle",
        entity_type="application",
        entity_id=str(application.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={"processed": len(results)},
        actor=user,
    )
    return {"processed": len(results), "results": results}


@intake_router.post("/documents/{document_id}/intake/process")
def process_single_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    document, application = _document(db, document_id, user, write=True)
    try:
        payload = intake_mod.process_intake_document(db, document, user.id)
    except intake_mod.IntakeError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc
    log_audit(
        db,
        action="intake.document_processed",
        entity_type="document",
        entity_id=str(document.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={"status": payload["status"], "pages": payload["page_count"]},
        actor=user,
    )
    return {"document": payload}


# ---------------------------------------------------------------------
# State, inventory, status
# ---------------------------------------------------------------------


@intake_router.get("/applications/{application_id}/intake")
def application_intake(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    application = _application(db, application_id, user, write=False)
    return intake_mod.application_state(db, application)


@intake_router.get("/applications/{application_id}/intake/status")
def application_status(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    application = _application(db, application_id, user, write=False)
    documents = db.scalars(
        select(Document)
        .where(Document.application_id == application.id, Document.is_deleted.is_(False))
        .order_by(Document.created_at)
    ).all()
    return {
        "application_id": str(application.id),
        "documents": [
            {
                "id": str(d.id),
                "filename": d.title,
                "status": d.status,
                "status_detail": d.status_detail,
                "pages": d.current_version_no,
            }
            for d in documents
        ],
        "pending": sum(1 for d in documents if d.status in ("uploaded", "queued", "processing")),
        "failed": sum(1 for d in documents if d.status in intake_mod.FAILED_STATUSES),
        "processed": sum(1 for d in documents if d.status == "processed"),
    }


@intake_router.get("/documents/{document_id}/intake")
def document_intake(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    document, _ = _document(db, document_id, user, write=False)
    return intake_mod.document_payload(db, document)


# ---------------------------------------------------------------------
# Classification correction
# ---------------------------------------------------------------------


@intake_router.post("/documents/{document_id}/classification")
def correct_classification(
    document_id: uuid.UUID,
    payload: ClassificationCorrectionIn,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    document, application = _document(db, document_id, user, write=True)
    if user.role == "auditor":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Auditors cannot change classifications")
    try:
        result = intake_mod.correct_classification(
            db, document, payload.corrected_category, payload.reason, user.profile
        )
    except intake_mod.IntakeError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc
    log_audit(
        db,
        action="intake.classification_corrected",
        entity_type="document",
        entity_id=str(document.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={
            "original": result["correction"]["original_category"] if result["correction"] else None,
            "corrected": payload.corrected_category,
            "reason": payload.reason,
        },
        actor=user,
    )
    return {"document": result}


# ---------------------------------------------------------------------
# Preview rendering
# ---------------------------------------------------------------------


@intake_router.get("/documents/{document_id}/pages/{page_no}/render")
def render_document_page(
    document_id: uuid.UUID,
    page_no: int,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    document, application = _document(db, document_id, user, write=False)
    try:
        image = intake_mod.render_page_png(db, document, page_no)
    except intake_mod.IntakeError as exc:
        raise HTTPException(exc.status_code, exc.message) from exc
    log_audit(
        db,
        action="intake.page_viewed",
        entity_type="document",
        entity_id=str(document.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={"page": page_no},
        actor=user,
    )
    return Response(content=image, media_type="image/png", headers={"Cache-Control": "private, no-store"})


# ---------------------------------------------------------------------
# Completion
# ---------------------------------------------------------------------


@intake_router.post("/applications/{application_id}/intake/complete")
def complete_intake(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    """Sign off the intake stage: enforce the completion rules, freeze a manifest and submit."""
    application = _application(db, application_id, user, write=True)
    state = intake_mod.application_state(db, application)
    completion = state["completion"]
    if not completion["can_complete"]:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "message": "Intake cannot be completed yet.",
                "blockers": completion["blockers"],
            },
        )
    manifest = intake_mod.build_manifest(db, application, user)
    previous_status = application.status
    if previous_status == "draft":
        application.status = "submitted"
        application.submitted_at = datetime.now(timezone.utc)
        db.add(
            ApplicationStatusHistory(
                application_id=application.id,
                from_status=previous_status,
                to_status="submitted",
                actor_id=user.id,
                reason="Intake completed and manifest generated",
            )
        )
    db.commit()
    log_audit(
        db,
        action="intake.completed",
        entity_type="application",
        entity_id=str(application.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={"manifest_version": manifest.version, "sha256": manifest.sha256, "review_notes": state["readiness"]["reasons"]},
        actor=user,
    )
    return {
        "intake_state": "completed",
        "application": {
            "id": str(application.id),
            "reference_no": application.reference_no,
            "status": application.status,
        },
        "manifest": {
            "id": str(manifest.id),
            "version": manifest.version,
            "sha256": manifest.sha256,
            "generated_at": str(manifest.generated_at),
        },
        "readiness": state["readiness"],
    }


# ---------------------------------------------------------------------
# Manifest + reports
# ---------------------------------------------------------------------


@intake_router.delete("/documents/{document_id}", status_code=204)
def remove_document(
    document_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    document, application = _document(db, document_id, user, write=True)
    if document.status == "processing":
        raise HTTPException(status.HTTP_409_CONFLICT, "This document is being processed; try again shortly.")
    document.is_deleted = True
    document.status = "deleted"
    db.commit()
    log_audit(
        db,
        action="intake.document_removed",
        entity_type="document",
        entity_id=str(document.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={"filename": document.title},
        actor=user,
    )
    return Response(status_code=204)


@intake_router.get("/applications/{application_id}/manifest")
def get_manifest(
    application_id: uuid.UUID,
    generate: bool = Query(False),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    application = _application(db, application_id, user, write=False)
    if generate:
        manifest = intake_mod.build_manifest(db, application, user)
    else:
        manifest = db.scalars(
            select(IntakeManifest)
            .where(IntakeManifest.application_id == application.id)
            .order_by(IntakeManifest.version.desc())
            .limit(1)
        ).first()
        if manifest is None:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND,
                "No intake manifest has been generated for this application yet",
            )
    return {
        "id": str(manifest.id),
        "version": manifest.version,
        "sha256": manifest.sha256,
        "generated_at": str(manifest.generated_at),
        "payload": manifest.payload,
    }


@intake_router.post("/applications/{application_id}/manifest", status_code=201)
def create_manifest(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    application = _application(db, application_id, user, write=True)
    manifest = intake_mod.build_manifest(db, application, user)
    log_audit(
        db,
        action="intake.manifest_generated",
        entity_type="application",
        entity_id=str(application.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={"version": manifest.version, "sha256": manifest.sha256},
        actor=user,
    )
    return {
        "id": str(manifest.id),
        "version": manifest.version,
        "sha256": manifest.sha256,
        "generated_at": str(manifest.generated_at),
        "payload": manifest.payload,
    }


@intake_router.get("/applications/{application_id}/intake/report")
def download_intake_report(
    application_id: uuid.UUID,
    format: Literal["json", "pdf"] = Query("json"),
    db: Session = Depends(get_db),
    user: CurrentUser = Depends(get_current_user),
):
    application = _application(db, application_id, user, write=False)
    if format == "pdf":
        content, filename = intake_mod.report_pdf(db, application, user)
        media_type = "application/pdf"
    else:
        content, filename = intake_mod.report_json(db, application, user)
        media_type = "application/json"
    log_audit(
        db,
        action="intake.report_downloaded",
        entity_type="application",
        entity_id=str(application.id),
        application_id=application.id,
        institution_id=application.institution_id,
        meta={"format": format, "filename": filename},
        actor=user,
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
