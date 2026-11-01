"""Module 1 — Intelligent application intake gateway.

Real, deterministic intake processing for an AICTE application bundle:

  upload -> validate (signature, structure, limits) -> safe ZIP extraction ->
  private storage (SHA-256, generated names) -> normalization/derivatives ->
  page text + OCR extraction -> rule-based document classification ->
  page quality / duplicate analysis -> versioned checklist reconciliation ->
  human classification correction -> intake manifest -> downloadable report.

Nothing here issues a regulatory decision and nothing calls an application verified:
Module 1 determines intake readiness only.
"""
from __future__ import annotations

import hashlib
import io
import json
import logging
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any

import fitz
from PIL import Image, ImageOps
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import (
    Application,
    Document,
    DocumentCategory,
    DocumentClassification,
    DocumentCorrection,
    DocumentDerivative,
    DocumentPage,
    DocumentVersion,
    IntakeChecklist,
    IntakeManifest,
    Profile,
)
from app.services import anomaly
from app.services import matching
from app.services import processing as processing_mod
from app.services import storage as storage_mod

logger = logging.getLogger("resilient.intake")

FORMAT_MIME = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpeg": "image/jpeg",
    "zip": "application/zip",
}
ALLOWED_FORMATS = ("pdf", "png", "jpeg", "zip")
EXT_FOR_FORMAT = {"pdf": "pdf", "png": "png", "jpeg": "jpg", "zip": "zip"}
EXT_FORMAT_MAP = {
    "pdf": "pdf",
    "png": "png",
    "jpg": "jpeg",
    "jpeg": "jpeg",
    "zip": "zip",
}

STATUS_PROCESSED = "processed"
FAILED_STATUSES = ("failed", "unreadable")
UNCERTAIN_CLASSIFICATION = ("needs_review", "uncertain", "unclassified")

MANIFEST_LIMITATIONS = [
    "Module 1 assesses intake readiness only. It does not verify authenticity, " "legality or regulatory compliance.",
    "Document classification is a rule-based intake aid; corrections are recorded with reviewer and timestamp.",
    "Duplicate and page-quality signals are investigative aids, not proof of tampering or fraud.",
    "Checklist requirements are provisional until verified against the applicable AICTE handbook.",
]


class IntakeError(Exception):
    """A user-correctable intake validation failure with a stable machine code."""

    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


# ---------------------------------------------------------------------
# Format detection & validation
# ---------------------------------------------------------------------


def detect_format(data: bytes) -> str:
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data[:4] in (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08"):
        return "zip"
    return "unknown"


def declared_extension(filename: str) -> str:
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def inspect_pdf_structure(data: bytes) -> dict[str, Any]:
    """Open the PDF for real; reject malformed and password-protected files."""
    try:
        doc = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001
        raise IntakeError("malformed_pdf", f"The PDF could not be opened: {exc}", 422) from exc
    try:
        if doc.needs_pass:
            raise IntakeError(
                "encrypted_pdf",
                "This PDF is password protected. Upload an unlocked copy or mark the file for manual review.",
                422,
            )
        if doc.page_count == 0:
            raise IntakeError("empty_pdf", "The PDF contains no pages.", 422)
        meta = doc.metadata or {}
        return {
            "page_count": int(doc.page_count),
            "is_encrypted": bool(doc.is_encrypted),
            "producer": (meta.get("producer") or "")[:200] or None,
            "creator": (meta.get("creator") or "")[:200] or None,
            "format": (meta.get("format") or "")[:80] or None,
        }
    finally:
        doc.close()


def validate_image(data: bytes) -> dict[str, Any]:
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            return {"width": im.width, "height": im.height, "mode": im.mode}
    except Exception as exc:  # noqa: BLE001
        raise IntakeError("corrupted_image", f"The image could not be decoded: {exc}", 422) from exc


def validate_upload(filename: str, data: bytes) -> dict[str, Any]:
    """Validate real bytes, never the declared extension or browser MIME type."""
    settings = get_settings()
    if not data:
        raise IntakeError("empty_file", "The uploaded file is empty.")
    if len(data) > settings.max_upload_bytes:
        raise IntakeError(
            "file_too_large",
            f"File exceeds the {settings.MAX_UPLOAD_SIZE_MB} MB per-file limit.",
            413,
        )
    fmt = detect_format(data)
    if fmt == "unknown":
        raise IntakeError(
            "unsupported_signature",
            "File content is not a supported PDF, JPG, PNG or ZIP archive (signature check failed).",
            415,
        )
    declared = declared_extension(filename)
    declared_fmt = EXT_FORMAT_MAP.get(declared)
    info: dict[str, Any] = {
        "format": fmt,
        "mime_type": FORMAT_MIME[fmt],
        "file_ext": "jpeg" if fmt == "jpeg" else fmt,
        "size_bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
        "declared_extension": declared or None,
        "extension_mismatch": bool(declared_fmt and declared_fmt != fmt),
    }
    if fmt == "pdf":
        info["structure"] = inspect_pdf_structure(data)
    elif fmt in ("png", "jpeg"):
        info["structure"] = validate_image(data)
    return info


# ---------------------------------------------------------------------
# Safe ZIP extraction
# ---------------------------------------------------------------------


def unsafe_archive_name(name: str) -> bool:
    normalized = name.replace("\\", "/")
    if "\x00" in normalized:
        return True
    if normalized.startswith("/") or re.match(r"^[A-Za-z]:", normalized):
        return True
    return ".." in [part for part in normalized.split("/") if part not in ("", ".")]


def read_archive(data: bytes) -> dict[str, Any]:
    """Extract allowed documents from a ZIP while rejecting traversal, symlinks,
    encrypted entries, nested archives, excessive counts and decompression bombs."""
    settings = get_settings()
    entries: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise IntakeError("malformed_archive", "The ZIP archive is corrupted or unsupported.", 422) from exc

    with archive:
        infos = archive.infolist()
        file_infos = [i for i in infos if not i.is_dir()]
        if len(file_infos) == 0:
            raise IntakeError("empty_archive", "The ZIP archive contains no files.", 422)
        if len(file_infos) > settings.MAX_ARCHIVE_ENTRIES:
            raise IntakeError(
                "archive_too_many_entries",
                f"Archive contains {len(file_infos)} files; the limit is {settings.MAX_ARCHIVE_ENTRIES}.",
                413,
            )
        total_uncompressed = 0
        for info in file_infos:
            raw_name = info.filename
            name = raw_name.replace("\\", "/")
            if unsafe_archive_name(name):
                errors.append(
                    {"filename": raw_name[:200], "code": "unsafe_archive_path",
                     "message": "Entry path would escape the extraction root; skipped."}
                )
                continue
            if name.startswith("__MACOSX/") or PurePosixPath(name).name.startswith("."):
                warnings.append({"filename": raw_name[:200], "code": "archive_metadata_skipped",
                                 "message": "Archive metadata entry skipped."})
                continue
            mode = (info.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                errors.append({"filename": raw_name[:200], "code": "archive_symlink",
                               "message": "Symbolic links inside archives are rejected."})
                continue
            if info.flag_bits & 0x1:
                errors.append({"filename": raw_name[:200], "code": "encrypted_archive_entry",
                               "message": "Encrypted archive entries cannot be processed."})
                continue
            if name.lower().endswith(".zip"):
                errors.append({"filename": raw_name[:200], "code": "nested_archive",
                               "message": "Nested archives are not extracted."})
                continue
            total_uncompressed += info.file_size
            if total_uncompressed > settings.max_archive_bytes:
                raise IntakeError(
                    "archive_too_large",
                    f"Archive expands beyond the {settings.MAX_ARCHIVE_UNCOMPRESSED_MB} MB limit.",
                    413,
                )
            if info.file_size > 1_048_576 and info.compress_size > 0:
                ratio = info.file_size / info.compress_size
                if ratio > settings.MAX_ARCHIVE_RATIO:
                    raise IntakeError(
                        "archive_bomb_suspected",
                        "Archive compression ratio is implausible; the archive was rejected.",
                        413,
                    )
            limit = min(settings.max_upload_bytes, settings.max_archive_bytes)
            with archive.open(info) as handle:
                payload = handle.read(limit + 1)
            if len(payload) > limit:
                errors.append({"filename": raw_name[:200], "code": "archive_entry_too_large",
                               "message": "Entry exceeds the per-file size limit."})
                continue
            if len(payload) != info.file_size:
                errors.append({"filename": raw_name[:200], "code": "archive_entry_truncated",
                               "message": "Entry did not decompress to its declared size."})
                continue
            if detect_format(payload) not in ALLOWED_FORMATS:
                errors.append({"filename": raw_name[:200], "code": "unsupported_entry",
                               "message": "Entry is not a supported document type."})
                continue
            entries.append({"filename": name, "data": payload})
    return {"entries": entries, "errors": errors, "warnings": warnings}


# ---------------------------------------------------------------------
# Storage & upload
# ---------------------------------------------------------------------


def _archive_root(filename: str) -> str:
    return PurePosixPath(filename.replace("\\", "/")).name[:200]


def store_document(
    db: Session,
    application: Application,
    actor: Any,
    filename: str,
    data: bytes,
    ingest_meta: dict[str, Any] | None = None,
    declared_category_code: str | None = None,
    expected_category_code: str | None = None,
) -> Document:
    info = validate_upload(filename, data)
    safe_name = PurePosixPath(filename.replace("\\", "/")).name or "upload"
    stored = storage_mod.save_application_file(application.reference_no, data, safe_name)
    ingest = dict(ingest_meta or {})
    ingest.update(
        {
            "declared_filename": safe_name[:200],
            "detected_format": info["format"],
            "declared_extension": info["declared_extension"],
            "extension_mismatch": info["extension_mismatch"],
            "uploaded_at": now_iso(),
        }
    )
    if info.get("structure"):
        ingest["structure"] = info["structure"]
    if expected_category_code:
        ingest["expected_category"] = expected_category_code
    document = Document(
        application_id=application.id,
        institution_id=application.institution_id,
        title=PurePosixPath(safe_name).stem[:180] or "Untitled document",
        declared_category_code=declared_category_code,
        created_by=getattr(actor, "id", None),
        status="uploaded",
    )
    db.add(document)
    db.flush()
    version = DocumentVersion(
        document_id=document.id,
        application_id=application.id,
        version_no=1,
        original_filename=safe_name[:200],
        mime_type=info["mime_type"],
        file_ext=info["file_ext"],
        size_bytes=stored["size_bytes"],
        sha256=stored["sha256"],
        storage_backend=stored["backend"],
        storage_path=stored["path"],
        ingest_meta=ingest,
        uploaded_by=getattr(actor, "id", None),
    )
    db.add(version)
    db.flush()
    document.current_version_id = version.id
    document.current_version_no = 1
    if info.get("structure") and info["format"] == "pdf":
        version.page_count = info["structure"].get("page_count")
    db.flush()
    return document


def upload_bundle(
    db: Session,
    application: Application,
    actor: Any,
    files: list[tuple[str, bytes]],
    expected_category_code: str | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    if not files:
        raise IntakeError("no_files", "Select at least one file to upload.")
    if len(files) > settings.MAX_BUNDLE_FILES:
        raise IntakeError(
            "too_many_files",
            f"At most {settings.MAX_BUNDLE_FILES} files can be uploaded in one bundle.",
            413,
        )
    total = sum(len(data) for _, data in files)
    if total > settings.max_bundle_bytes:
        raise IntakeError(
            "bundle_too_large",
            f"Bundle exceeds the {settings.MAX_BUNDLE_SIZE_MB} MB total limit.",
            413,
        )

    results: list[dict[str, Any]] = []
    for filename, data in files:
        try:
            fmt = detect_format(data)
            if fmt == "zip":
                if len(data) > settings.max_upload_bytes:
                    raise IntakeError("file_too_large", "Archive exceeds the per-file size limit.", 413)
                archive = read_archive(data)
                for entry in archive["errors"]:
                    results.append({**entry, "status": "rejected", "source_archive": _archive_root(filename)})
                for entry in archive["warnings"]:
                    results.append({**entry, "status": "skipped", "source_archive": _archive_root(filename)})
                for entry in archive["entries"]:
                    try:
                        document = store_document(
                            db,
                            application,
                            actor,
                            entry["filename"],
                            entry["data"],
                            ingest_meta={
                                "source_archive": _archive_root(filename),
                                "archive_total_entries": len(archive["entries"]) + len(archive["errors"]),
                                "archive_entry_name": entry["filename"][:200],
                            },
                            expected_category_code=expected_category_code,
                        )
                        results.append(
                            {
                                "status": "stored",
                                "filename": PurePosixPath(entry["filename"]).name,
                                "document_id": str(document.id),
                                "source_archive": _archive_root(filename),
                            }
                        )
                    except IntakeError as exc:
                        results.append(
                            {
                                "status": "rejected",
                                "filename": PurePosixPath(entry["filename"]).name,
                                "code": exc.code,
                                "message": exc.message,
                                "source_archive": _archive_root(filename),
                            }
                        )
                continue

            document = store_document(
                db, application, actor, filename, data, expected_category_code=expected_category_code
            )
            results.append(
                {
                    "status": "stored",
                    "filename": PurePosixPath(filename.replace("\\", "/")).name,
                    "document_id": str(document.id),
                }
            )
        except IntakeError as exc:
            results.append(
                {
                    "status": "rejected",
                    "filename": PurePosixPath(filename.replace("\\", "/")).name,
                    "code": exc.code,
                    "message": exc.message,
                }
            )
            logger.info("rejected upload %s: %s", filename, exc.code)
    return {
        "results": results,
        "stored": sum(1 for r in results if r["status"] == "stored"),
        "rejected": sum(1 for r in results if r["status"] == "rejected"),
        "skipped": sum(1 for r in results if r["status"] == "skipped"),
    }


# ---------------------------------------------------------------------
# Normalization, processing, page analysis
# ---------------------------------------------------------------------


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_image_bytes(data: bytes) -> tuple[bytes, dict[str, Any]]:
    with Image.open(io.BytesIO(data)) as im:
        oriented = ImageOps.exif_transpose(im)
        if oriented.mode not in ("RGB", "L"):
            oriented = oriented.convert("RGB")
        width, height = oriented.size
        scale = min(1.0, 2400 / max(width, height)) if max(width, height) else 1.0
        if scale < 1.0:
            oriented = oriented.resize((max(1, int(width * scale)), max(1, int(height * scale))))
        out = io.BytesIO()
        oriented.save(out, format="PNG", optimize=True)
        return out.getvalue(), {
            "width": oriented.width,
            "height": oriented.height,
            "mode": oriented.mode,
            "source_mode": im.mode,
            "resized": scale < 1.0,
        }


def normalize_document(
    db: Session, application: Application, document: Document, version: DocumentVersion, raw: bytes
) -> dict[str, Any]:
    """Produce a normalized derivative only when one is needed. Originals are untouched."""
    existing = db.scalars(
        select(DocumentDerivative).where(
            DocumentDerivative.document_version_id == version.id,
            DocumentDerivative.kind == "normalized_image",
        )
    ).first()
    if version.file_ext in ("jpeg", "png"):
        if existing is not None:
            return {
                "applied": True,
                "kind": "normalized_image",
                "storage_path": existing.storage_path,
                "sha256": existing.sha256,
                "note": "Reused previously generated normalized copy.",
            }
        try:
            normalized, notes = normalize_image_bytes(raw)
        except Exception as exc:  # noqa: BLE001
            return {"applied": False, "note": f"Normalization skipped: {exc}"}
        stored = storage_mod.save_derivative(application.reference_no, normalized, "normalized", "png")
        db.add(
            DocumentDerivative(
                document_version_id=version.id,
                kind="normalized_image",
                storage_backend=stored["backend"],
                storage_path=stored["path"],
                sha256=stored["sha256"],
                size_bytes=stored["size_bytes"],
                note="EXIF-oriented, RGB, max 2400px copy used for analysis and preview.",
            )
        )
        db.flush()
        return {
            "applied": True,
            "kind": "normalized_image",
            "storage_path": stored["path"],
            "sha256": stored["sha256"],
            **notes,
        }
    return {
        "applied": False,
        "note": "PDF opened natively; original bytes preserved and pages rendered on demand.",
    }


def _ensure_phashes_and_flags(db: Session, version: DocumentVersion, raw: bytes) -> None:
    settings = get_settings()
    pages = db.scalars(
        select(DocumentPage).where(DocumentPage.document_version_id == version.id).order_by(DocumentPage.page_no)
    ).all()
    if not pages:
        return
    rotations: dict[int, int] = {}
    try:
        doc = fitz.open(stream=raw, filetype=version.file_ext if version.file_ext in ("pdf", "png", "jpeg") else "pdf")
        rotations = {i + 1: int(doc.load_page(i).rotation or 0) for i in range(doc.page_count)}
        doc.close()
    except Exception:  # noqa: BLE001
        rotations = {}

    for page in pages:
        quality = dict(page.quality or {})
        if not page.phash:
            rendered = processing_mod.render_page(raw, page.page_no, version.file_ext)
            if rendered is not None:
                page.phash = anomaly.phash_of_image(rendered)
        flags: list[str] = []
        text = (page.page_text or "").strip()
        if not text:
            flags.append("blank")
        if page.ocr_confidence is not None and float(page.ocr_confidence) < settings.OCR_LOW_CONFIDENCE:
            flags.append("low_confidence_text")
        if quality.get("suspiciously_sparse"):
            flags.append("sparse_content")
        if rotations.get(page.page_no, 0) % 360 != 0:
            flags.append(f"rotated_{rotations[page.page_no]}deg")
        page.quality = {**quality, "flags": flags}
        page.render_hint = {
            "rotation": rotations.get(page.page_no, 0),
            "renderable_pdf": version.file_ext == "pdf",
        }
    db.flush()


def process_intake_document(db: Session, document: Document, actor_id: uuid.UUID | None = None) -> dict[str, Any]:
    """Run the full per-document intake pipeline. Idempotent: derived rows are replaced."""
    version = db.get(DocumentVersion, document.current_version_id)
    if version is None:
        raise IntakeError("missing_version", "The document has no stored file version.", 409)
    raw = storage_mod.read_file(version.storage_backend, version.storage_path)
    application = db.get(Application, document.application_id)
    if application is None:
        raise IntakeError("missing_application", "The application no longer exists.", 404)

    processing_mod.process_document(db, document.id, actor_id)
    db.refresh(document)
    version = db.get(DocumentVersion, document.current_version_id)

    if document.status not in FAILED_STATUSES:
        normalization = normalize_document(db, application, document, version, raw)
        quality = dict(version.quality or {})
        quality["normalization"] = normalization
        version.quality = quality
        _ensure_phashes_and_flags(db, version, raw)
    db.flush()
    return document_payload(db, document)


# ---------------------------------------------------------------------
# Payload helpers
# ---------------------------------------------------------------------


def category_map(db: Session) -> dict[str, DocumentCategory]:
    return {c.code: c for c in db.scalars(select(DocumentCategory)).all()}


def _corrections_for(db: Session, document_ids: list[uuid.UUID]) -> dict[uuid.UUID, DocumentCorrection]:
    if not document_ids:
        return {}
    rows = db.scalars(
        select(DocumentCorrection)
        .where(DocumentCorrection.document_id.in_(document_ids))
        .order_by(DocumentCorrection.created_at)
    ).all()
    latest: dict[uuid.UUID, DocumentCorrection] = {}
    for row in rows:
        latest[row.document_id] = row
    return latest


def confidence_band(confidence: float | None, corrected: bool = False) -> str:
    settings = get_settings()
    if corrected:
        return "confirmed"
    if confidence is None:
        return "unclassified"
    if confidence >= settings.CLASSIFICATION_AUTO_CONFIDENCE:
        return "auto_classified"
    if confidence >= settings.CLASSIFICATION_REVIEW_CONFIDENCE:
        return "needs_review"
    return "uncertain"


def document_payloads(db: Session, documents: list[Document]) -> list[dict[str, Any]]:
    """Build document payloads in bulk: one query per related table, not per document."""
    if not documents:
        return []
    version_ids = [doc.current_version_id for doc in documents if doc.current_version_id]
    versions = {
        version.id: version
        for version in (
            db.scalars(select(DocumentVersion).where(DocumentVersion.id.in_(version_ids))).all()
            if version_ids
            else []
        )
    }
    corrections = _corrections_for(db, [doc.id for doc in documents])
    categories = category_map(db)
    pages_by_version: dict[uuid.UUID, list[DocumentPage]] = {}
    derivatives_by_version: dict[uuid.UUID, list[DocumentDerivative]] = {}
    classifications: dict[uuid.UUID, DocumentClassification] = {}
    if version_ids:
        for page in db.scalars(
            select(DocumentPage)
            .where(DocumentPage.document_version_id.in_(version_ids))
            .order_by(DocumentPage.page_no)
        ).all():
            pages_by_version.setdefault(page.document_version_id, []).append(page)
        for derivative in db.scalars(
            select(DocumentDerivative).where(DocumentDerivative.document_version_id.in_(version_ids))
        ).all():
            derivatives_by_version.setdefault(derivative.document_version_id, []).append(derivative)
        for row in db.scalars(
            select(DocumentClassification)
            .where(DocumentClassification.document_version_id.in_(version_ids))
            .order_by(DocumentClassification.created_at)
        ).all():
            classifications[row.document_version_id] = row
    return [
        _document_payload(
            document,
            versions.get(document.current_version_id),
            categories,
            corrections.get(document.id),
            classifications.get(document.current_version_id),
            pages_by_version.get(document.current_version_id, []),
            derivatives_by_version.get(document.current_version_id, []),
        )
        for document in documents
    ]


def document_payload(db: Session, document: Document) -> dict[str, Any]:
    return document_payloads(db, [document])[0]


def _document_payload(
    document: Document,
    version: DocumentVersion | None,
    categories: dict[str, DocumentCategory],
    correction: DocumentCorrection | None,
    classification_row: DocumentClassification | None,
    page_rows: list[DocumentPage],
    derivative_rows: list[DocumentDerivative],
) -> dict[str, Any]:
    predicted = document.detected_category_code
    # The checklist slot the file was uploaded into (kept with the stored version so no
    # schema change is needed and reprocessing keeps the original expectation).
    expected = (version.ingest_meta or {}).get("expected_category") if version else None
    effective = (
        correction.corrected_category
        if correction
        else (predicted or document.declared_category_code)
    )
    confidence = float(document.classification_confidence) if document.classification_confidence is not None else None
    band = confidence_band(confidence, corrected=correction is not None)
    match = matching.match_document(
        expected,
        predicted,
        confidence,
        corrected_code=correction.corrected_category if correction else None,
    )
    pages: list[dict[str, Any]] = []
    for p in page_rows:
        flags = list((p.quality or {}).get("flags") or [])
        text = p.page_text or ""
        pages.append(
            {
                "page_no": p.page_no,
                "text_source": p.text_source,
                "text_chars": len(text.strip()),
                "preview": text.strip()[:280],
                "ocr_confidence": float(p.ocr_confidence) if p.ocr_confidence is not None else None,
                "width": float(p.width) if p.width is not None else None,
                "height": float(p.height) if p.height is not None else None,
                "flags": flags,
                "phash": p.phash,
                "quality": p.quality or {},
            }
        )
    derivatives = [
        {
            "id": str(d.id),
            "kind": d.kind,
            "storage_path": d.storage_path,
            "sha256": d.sha256,
            "size_bytes": d.size_bytes,
            "note": d.note,
            "created_at": str(d.created_at),
        }
        for d in derivative_rows
    ]
    payload = {
        "id": str(document.id),
        "title": document.title,
        "filename": version.original_filename if version else document.title,
        "format": (version.file_ext if version else None),
        "mime_type": version.mime_type if version else None,
        "size_bytes": version.size_bytes if version else None,
        "sha256": version.sha256 if version else None,
        "page_count": version.page_count if version else None,
        "text_layer_chars": version.text_layer_chars if version else None,
        "ocr_used": bool(version.ocr_used) if version else False,
        "mean_ocr_confidence": float(version.mean_ocr_confidence) if version and version.mean_ocr_confidence is not None else None,
        "status": document.status,
        "status_detail": document.status_detail,
        "processing_status": version.processing_status if version else "pending",
        "processing_error": version.processing_error if version else None,
        "processed_at": str(version.processed_at) if version and version.processed_at else None,
        "created_at": str(document.created_at),
        "declared_category_code": document.declared_category_code,
        "expected_category_code": expected,
        "expected_category_label": categories[expected].name if expected in categories else None,
        "detected_category_code": predicted,
        "predicted_category_code": predicted,
        "effective_category_code": effective,
        "effective_category_label": categories[effective].name if effective in categories else None,
        "match": match,
        "source_type": "image" if (version and version.file_ext in ("png", "jpeg")) else "pdf",
        "classification": {
            "predicted_code": predicted,
            "label": categories[predicted].name if predicted in categories else None,
            "confidence": confidence,
            "confidence_band": band,
            "method": document.classification_method,
            "model_id": classification_row.model_id if classification_row else None,
            "scores": (classification_row.scores if classification_row else {}) or {},
            "evidence": (classification_row.rationale if classification_row else None),
            "thresholds": {
                "auto": get_settings().CLASSIFICATION_AUTO_CONFIDENCE,
                "review": get_settings().CLASSIFICATION_REVIEW_CONFIDENCE,
            },
            "status": band,
            "needs_review": band in UNCERTAIN_CLASSIFICATION,
        },
        "correction": (
            {
                "corrected_category": correction.corrected_category,
                "label": categories[correction.corrected_category].name
                if correction.corrected_category in categories
                else correction.corrected_category,
                "original_category": correction.original_category,
                "original_confidence": float(correction.original_confidence)
                if correction.original_confidence is not None
                else None,
                "reason": correction.reason,
                "at": str(correction.created_at),
                "reviewer_id": str(correction.reviewer_id) if correction.reviewer_id else None,
            }
            if correction
            else None
        ),
        "pages": pages,
        "derivatives": derivatives,
        "ingest_meta": (version.ingest_meta if version else {}) or {},
        "warnings": document_warnings(document, version, pages, correction is not None),
        "duplicate_of": [],
        "duplicate_kind": None,
    }
    return payload


def document_warnings(
    document: Document,
    version: DocumentVersion | None,
    pages: list[dict[str, Any]],
    corrected: bool,
) -> list[dict[str, Any]]:
    warnings: list[dict[str, Any]] = []
    if document.status in FAILED_STATUSES:
        warnings.append(
            {
                "code": "processing_failed",
                "severity": "high",
                "message": document.status_detail or "Processing failed for this document.",
            }
        )
    band = confidence_band(
        float(document.classification_confidence) if document.classification_confidence is not None else None,
        corrected=corrected,
    )
    if band in UNCERTAIN_CLASSIFICATION:
        warnings.append(
            {
                "code": "classification_needs_review",
                "severity": "medium",
                "message": "Classification confidence is below the auto-accept threshold; confirm the document type.",
            }
        )
    blank = [p["page_no"] for p in pages if "blank" in (p.get("flags") or [])]
    if blank:
        warnings.append(
            {
                "code": "blank_pages",
                "severity": "medium",
                "message": f"{len(blank)} page(s) have no extractable text: page {', '.join(map(str, blank[:8]))}.",
            }
        )
    low = [p["page_no"] for p in pages if "low_confidence_text" in (p.get("flags") or [])]
    if low:
        warnings.append(
            {
                "code": "low_quality_pages",
                "severity": "medium",
                "message": f"Low OCR confidence on page {', '.join(map(str, low[:8]))}.",
            }
        )
    if version is not None and (version.ingest_meta or {}).get("extension_mismatch"):
        warnings.append(
            {
                "code": "extension_mismatch",
                "severity": "low",
                "message": (
                    f"Declared extension .{version.ingest_meta.get('declared_extension')} does not match the "
                    f"detected {version.ingest_meta.get('detected_format')} content. The detected format was used."
                ),
            }
        )
    return warnings


def missing_page_evidence(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Only raise a missing-page signal when page text itself asserts a larger total."""
    findings: list[dict[str, Any]] = []
    for page in pages:
        match = re.search(r"(?i)\bpage\s+(\d{1,3})\s+of\s+(\d{1,3})\b", page.get("preview") or "")
        if not match:
            continue
        found_page, declared_total = int(match.group(1)), int(match.group(2))
        if declared_total > len(pages):
            findings.append(
                {
                    "declared_total": declared_total,
                    "observed_pages": len(pages),
                    "evidence": f"Page {found_page} of {declared_total} printed on page {page['page_no']}",
                    "message": (
                        f"Page text references '{declared_total}' total pages but only {len(pages)} "
                        "were received. Confirm internal pages with the institution."
                    ),
                }
            )
            break
    return findings


# ---------------------------------------------------------------------
# Bundle analysis
# ---------------------------------------------------------------------


def _phash_distance(a: str, b: str) -> int:
    try:
        import imagehash

        return int(imagehash.hex_to_hash(a) - imagehash.hex_to_hash(b))
    except Exception:  # noqa: BLE001
        return 64


def bundle_analysis(db: Session, application: Application, documents: list[dict[str, Any]]) -> dict[str, Any]:
    exact_groups: dict[str, list[dict[str, Any]]] = {}
    for doc in documents:
        if doc["sha256"]:
            exact_groups.setdefault(doc["sha256"], []).append(doc)
    exact_duplicates = [
        {
            "sha256": sha,
            "documents": [{"id": d["id"], "filename": d["filename"]} for d in group],
        }
        for sha, group in exact_groups.items()
        if len(group) > 1
    ]
    exact_ids = {
        doc["id"]: [d["id"] for d in group if d["id"] != doc["id"]]
        for group in exact_groups.values()
        if len(group) > 1
        for doc in group
    }

    visual_duplicates: list[dict[str, Any]] = []
    for index, left in enumerate(documents):
        for right in documents[index + 1 :]:
            left_hashes = [p["phash"] for p in left["pages"] if p.get("phash")][:3]
            right_hashes = [p["phash"] for p in right["pages"] if p.get("phash")][:3]
            best = None
            for lh in left_hashes:
                for rh in right_hashes:
                    distance = _phash_distance(lh, rh)
                    best = distance if best is None else min(best, distance)
            if best is not None and best <= 8:
                visual_duplicates.append(
                    {
                        "distance": best,
                        "documents": [
                            {"id": left["id"], "filename": left["filename"]},
                            {"id": right["id"], "filename": right["filename"]},
                        ],
                        "message": "Page images are visually near-identical; confirm this is intentional.",
                    }
                )

    blank_pages: list[dict[str, Any]] = []
    low_quality_pages: list[dict[str, Any]] = []
    rotated_pages: list[dict[str, Any]] = []
    missing_pages: list[dict[str, Any]] = []
    unreadable: list[dict[str, Any]] = []
    for doc in documents:
        if doc["status"] in FAILED_STATUSES:
            unreadable.append({"id": doc["id"], "filename": doc["filename"], "reason": doc["status_detail"]})
            continue
        for page in doc["pages"]:
            flags = page.get("flags") or []
            if "blank" in flags:
                blank_pages.append({"document_id": doc["id"], "filename": doc["filename"], "page_no": page["page_no"]})
            if "low_confidence_text" in flags:
                low_quality_pages.append(
                    {
                        "document_id": doc["id"],
                        "filename": doc["filename"],
                        "page_no": page["page_no"],
                        "ocr_confidence": page["ocr_confidence"],
                    }
                )
            rotated = [f for f in flags if f.startswith("rotated_")]
            if rotated:
                rotated_pages.append(
                    {"document_id": doc["id"], "filename": doc["filename"], "page_no": page["page_no"], "flags": rotated}
                )
        for finding in missing_page_evidence(doc["pages"]):
            missing_pages.append({"document_id": doc["id"], "filename": doc["filename"], **finding})
        doc["duplicate_of"] = exact_ids.get(doc["id"], [])
        if doc["duplicate_of"]:
            doc["duplicate_kind"] = "exact"

    # Same institution, other applications: count only. Never expose another
    # application's documents or existence details across tenants.
    shas = [doc["sha256"] for doc in documents if doc["sha256"]]
    cross_application = 0
    if shas:
        rows = db.execute(
            select(DocumentVersion.sha256, Application.reference_no)
            .join(Document, DocumentVersion.id == Document.current_version_id)
            .join(Application, Document.application_id == Application.id)
            .where(
                Document.institution_id == application.institution_id,
                Document.application_id != application.id,
                Document.is_deleted.is_(False),
                DocumentVersion.sha256.in_(shas),
            )
        ).all()
        cross_application = len({(sha, ref) for sha, ref in rows})

    uncertain = [
        {"id": doc["id"], "filename": doc["filename"], "confidence": doc["classification"]["confidence"]}
        for doc in documents
        if doc["classification"]["needs_review"] and not doc["correction"]
    ]
    return {
        "exact_duplicates": exact_duplicates,
        "visual_duplicates": visual_duplicates,
        "blank_pages": blank_pages,
        "low_quality_pages": low_quality_pages,
        "rotated_pages": rotated_pages,
        "missing_page_warnings": missing_pages,
        "unreadable_documents": unreadable,
        "classification_review": uncertain,
        "same_institution_other_applications": cross_application,
        "checks": [
            "exact_duplicate_sha256",
            "perceptual_duplicate_phash",
            "blank_unreadable_pages",
            "declared_page_numbering",
            "classification_review_queue",
        ],
    }


# ---------------------------------------------------------------------
# Checklist reconciliation
# ---------------------------------------------------------------------


def resolve_checklist(db: Session, application: Application) -> IntakeChecklist | None:
    rows = db.scalars(
        select(IntakeChecklist)
        .where(
            IntakeChecklist.category_code == application.category_code,
            IntakeChecklist.academic_year == application.academic_year,
        )
        .order_by(IntakeChecklist.version.desc())
    ).all()
    if not rows:
        rows = db.scalars(
            select(IntakeChecklist)
            .where(IntakeChecklist.category_code == application.category_code)
            .order_by(IntakeChecklist.version.desc(), IntakeChecklist.effective_from.desc())
        ).all()
    return rows[0] if rows else None


def _match_role(document: dict[str, Any], required_code: str) -> str:
    """How a document relates to one checklist requirement: confirmed, probable or wrong."""
    match = document.get("match") or {}
    status = match.get("status")
    if document.get("correction") is not None:
        return "confirmed" if document.get("effective_category_code") == required_code else "wrong"
    if status in ("matches", "confirmed"):
        return "confirmed"
    if status in ("possible_match", "uncertain", "unclassified"):
        return "probable"
    if status == "wrong_type":
        return "wrong"
    if document.get("detected_category_code") == required_code:
        return "probable" if (document.get("classification") or {}).get("needs_review") else "confirmed"
    return "wrong"


def reconcile_checklist(
    db: Session, application: Application, documents: list[dict[str, Any]]
) -> dict[str, Any]:
    checklist = resolve_checklist(db, application)
    if checklist is None:
        return {
            "available": False,
            "reason": "No checklist is configured for this application category and academic year.",
            "items": [],
            "counts": {},
        }
    categories = category_map(db)
    items: list[dict[str, Any]] = []
    for item in checklist.items:
        code = item.document_category_code
        # Files uploaded into this checklist slot carry the slot's type; sources that did not
        # come from a slot fall back to their detected type so nothing is silently dropped.
        candidates = [
            d
            for d in documents
            if d.get("expected_category_code") == code
            or (d.get("expected_category_code") is None and d.get("effective_category_code") == code)
        ]
        usable = [d for d in candidates if d["status"] not in FAILED_STATUSES]
        failed = [d for d in candidates if d["status"] in FAILED_STATUSES]
        duplicates = [d for d in usable if d["duplicate_of"]]
        confirmed = [d for d in usable if _match_role(d, code) == "confirmed"]
        probable = [d for d in usable if _match_role(d, code) == "probable"]
        wrong = [d for d in usable if _match_role(d, code) == "wrong"]
        considered = next((d for d in (probable + wrong) if d.get("match")), None)
        status: str
        explanation: str
        if len(confirmed) >= item.expected_count:
            if duplicates:
                status = "duplicate"
                explanation = (
                    f"{len(confirmed)} document(s) filed but {len(duplicates)} appear byte-identical to another "
                    "document in this bundle."
                )
            else:
                status = "satisfied"
                explanation = f"{len(confirmed)} document(s) processed and confirmed for this requirement."
        elif confirmed:
            status = "partial"
            explanation = f"{len(confirmed)} of {item.expected_count} expected document(s) filed."
        elif probable:
            status = "needs_review"
            match = probable[0].get("match") or {}
            explanation = match.get("message") or "Possible match — confirmation required."
        elif failed:
            status = "unreadable"
            explanation = (
                f"{len(failed)} document(s) filed but could not be read: "
                f"{failed[0].get('status_detail') or 'processing failed'}."
            )
        elif wrong:
            status = "wrong_type"
            match = wrong[0].get("match") or {}
            explanation = match.get("message") or "Wrong document type — upload the required document."
        elif candidates:
            status = "needs_review"
            explanation = "A document was filed but is not yet processed."
        elif item.requirement == "required":
            status = "missing"
            explanation = "Required document not uploaded."
        else:
            status = "optional_missing"
            explanation = "Optional document not supplied."
        detected_code = (considered or {}).get("detected_category_code") if considered else None
        items.append(
            {
                "category_code": code,
                "label": item.label,
                "requirement": item.requirement,
                "expected_count": item.expected_count,
                "guidance": item.guidance,
                "status": status,
                "explanation": explanation,
                "match": (
                    {
                        "status": (considered.get("match") or {}).get("status"),
                        "message": (considered.get("match") or {}).get("message"),
                        "expected_code": code,
                        "detected_code": detected_code,
                        "detected_label": categories[detected_code].name if detected_code in categories else None,
                    }
                    if considered
                    else None
                ),
                "documents": [
                    {
                        "id": d["id"],
                        "filename": d["filename"],
                        "status": d["status"],
                        "classification_status": d.get("classification", {}).get("status", "unknown"),
                        "match_status": (d.get("match") or {}).get("status"),
                    }
                    for d in candidates
                ],
            }
        )
    counts: dict[str, int] = {}
    for item in items:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    return {
        "available": True,
        "checklist": {
            "id": str(checklist.id),
            "code": checklist.code,
            "name": checklist.name,
            "version": checklist.version,
            "academic_year": checklist.academic_year,
            "category_code": checklist.category_code,
            "is_provisional": checklist.is_provisional,
            "source_reference": checklist.source_reference,
            "effective_from": str(checklist.effective_from),
            "notes": checklist.notes,
        },
        "items": items,
        "counts": counts,
        "categories": {
            code: category.name for code, category in categories.items()
        },
    }


# ---------------------------------------------------------------------
# Application state / readiness
# ---------------------------------------------------------------------


def application_summary(db: Session, application: Application, documents: list[dict[str, Any]], analysis: dict[str, Any], checklist: dict[str, Any]) -> dict[str, Any]:
    pages_total = sum(len(d["pages"]) for d in documents)
    processed = sum(1 for d in documents if d["status"] == "processed")
    failed = sum(1 for d in documents if d["status"] in FAILED_STATUSES)
    pending = sum(1 for d in documents if d["status"] not in ("processed", *FAILED_STATUSES))
    review = sum(
        1 for d in documents if d["classification"]["needs_review"] and not d["correction"]
    )
    warnings = sum(len(d["warnings"]) for d in documents)
    return {
        "documents": len(documents),
        "documents_processed": processed,
        "documents_failed": failed,
        "documents_pending": pending,
        "documents_needs_review": review,
        "pages_total": pages_total,
        "warnings": warnings,
        "exact_duplicates": len(analysis.get("exact_duplicates") or []),
        "visual_duplicates": len(analysis.get("visual_duplicates") or []),
        "checklist_satisfied": (checklist.get("counts") or {}).get("satisfied", 0),
        "checklist_required_missing": (checklist.get("counts") or {}).get("missing", 0),
    }


def compute_readiness(
    application: Application, documents: list[dict[str, Any]], checklist: dict[str, Any]
) -> dict[str, Any]:
    items = checklist.get("items") or []
    blocking = [
        item
        for item in items
        if item["requirement"] == "required"
        and item["status"] in ("missing", "unreadable", "partial", "wrong_type")
    ]
    failed_docs = [d for d in documents if d["status"] in FAILED_STATUSES]
    review: list[str] = []
    if blocking:
        review.append(f"{len(blocking)} required checklist item(s) are not satisfied.")
    if failed_docs:
        review.append(f"{len(failed_docs)} document(s) failed processing.")
    uncertain = [d for d in documents if d["classification"]["needs_review"] and not d["correction"]]
    if uncertain:
        review.append(f"{len(uncertain)} document(s) need classification confirmation.")
    needs_review_items = [i for i in items if i["status"] == "needs_review"]
    if needs_review_items:
        review.append(f"{len(needs_review_items)} checklist item(s) require manual confirmation.")
    duplicates = [i for i in items if i["status"] == "duplicate"]
    if duplicates:
        review.append(f"{len(duplicates)} checklist item(s) contain duplicate uploads.")
    if checklist.get("available") is False:
        review.append("No checklist is configured; readiness cannot be fully determined.")
    pending = [d for d in documents if d["status"] not in ("processed", *FAILED_STATUSES)]
    if pending:
        review.append(f"{len(pending)} document(s) have not been processed yet.")

    if not documents:
        state = "empty"
    elif blocking or failed_docs:
        state = "blocked"
    elif review:
        state = "needs_review"
    else:
        state = "ready"
    return {
        "state": state,
        "reasons": review,
        "blocking_required": [i["label"] for i in blocking],
        "documents_failed": [d["filename"] for d in failed_docs],
        "documents_needing_review": [d["filename"] for d in uncertain],
        "statement": {
            "ready": "Intake complete. The bundle is validated and ready for Module 2 (extraction and fraud detection).",
            "needs_review": "Intake complete with items that need human review before downstream modules.",
            "blocked": "Intake incomplete. Resolve the blocking items before downstream modules.",
            "empty": "No documents uploaded yet.",
        }[state],
    }


def completion_check(
    documents: list[dict[str, Any]], checklist: dict[str, Any]
) -> dict[str, Any]:
    """Rules that decide whether the intake stage may be signed off.

    Accepted: everything processed and every *required* checklist slot satisfied,
    even if individual documents still carry review flags (those are recorded, not ignored).
    Blocked: no documents, unprocessed/failed documents, or missing/unreadable required evidence.
    """
    blockers: list[str] = []
    if not documents:
        blockers.append("Upload at least one document before completing intake.")
    pending = [d for d in documents if d["status"] not in ("processed", *FAILED_STATUSES)]
    if pending:
        blockers.append(f"{len(pending)} document(s) still need processing.")
    failed = [d for d in documents if d["status"] in FAILED_STATUSES]
    if failed:
        blockers.append(f"{len(failed)} document(s) failed processing; retry or replace them.")
    missing = [
        item["label"]
        for item in (checklist.get("items") or [])
        if item.get("requirement") == "required"
        and item.get("status") in ("missing", "unreadable", "partial", "wrong_type")
    ]
    if missing:
        blockers.append("Required evidence is missing or unreadable: " + ", ".join(missing))
    return {"can_complete": not blockers, "blockers": blockers}


def application_state(db: Session, application: Application) -> dict[str, Any]:
    docs = db.scalars(
        select(Document)
        .where(Document.application_id == application.id, Document.is_deleted.is_(False))
        .order_by(Document.created_at)
    ).all()
    documents = document_payloads(db, list(docs))
    analysis = bundle_analysis(db, application, documents)
    checklist = reconcile_checklist(db, application, documents)
    summary = application_summary(db, application, documents, analysis, checklist)
    readiness = compute_readiness(application, documents, checklist)
    completion = completion_check(documents, checklist)
    latest_manifest = db.scalars(
        select(IntakeManifest)
        .where(IntakeManifest.application_id == application.id)
        .order_by(IntakeManifest.version.desc())
        .limit(1)
    ).first()
    return {
        "application": {
            "id": str(application.id),
            "reference_no": application.reference_no,
            "title": application.title,
            "description": application.description,
            "status": application.status,
            "category_code": application.category_code,
            "academic_year": application.academic_year,
            "institution": {
                "id": str(application.institution.id),
                "name": application.institution.name,
                "aicte_pid": application.institution.aicte_pid,
            },
            "declared_data": application.declared_data or {},
            "created_at": str(application.created_at),
            "last_processed_at": str(application.last_processed_at) if application.last_processed_at else None,
        },
        "summary": summary,
        "documents": documents,
        "analysis": analysis,
        "checklist": checklist,
        "readiness": readiness,
        "completion": completion,
        "manifest": (
            {
                "id": str(latest_manifest.id),
                "version": latest_manifest.version,
                "sha256": latest_manifest.sha256,
                "generated_at": str(latest_manifest.generated_at),
            }
            if latest_manifest
            else None
        ),
        "module": {
            "name": "Module 1 — Intelligent Application Intake Gateway",
            "processor_version": get_settings().INTAKE_PROCESSOR_VERSION,
            "rule_version": get_settings().INTAKE_RULE_VERSION,
            "limits": {
                "max_file_mb": get_settings().MAX_UPLOAD_SIZE_MB,
                "max_bundle_mb": get_settings().MAX_BUNDLE_SIZE_MB,
                "max_files": get_settings().MAX_BUNDLE_FILES,
            },
        },
    }


# ---------------------------------------------------------------------
# Lightweight overview (list screens)
# ---------------------------------------------------------------------


def overview_state(db: Session, application: Application) -> dict[str, Any]:
    """Summary for list screens: no page payloads and no perceptual-hash analysis."""
    docs = db.scalars(
        select(Document)
        .where(Document.application_id == application.id, Document.is_deleted.is_(False))
        .order_by(Document.created_at)
    ).all()
    version_ids = [doc.current_version_id for doc in docs if doc.current_version_id]
    versions = {
        version.id: version
        for version in (
            db.scalars(select(DocumentVersion).where(DocumentVersion.id.in_(version_ids))).all()
            if version_ids
            else []
        )
    }
    corrections = _corrections_for(db, [doc.id for doc in docs])
    categories = category_map(db)

    documents: list[dict[str, Any]] = []
    for document in docs:
        version = versions.get(document.current_version_id)
        correction = corrections.get(document.id)
        confidence = (
            float(document.classification_confidence)
            if document.classification_confidence is not None
            else None
        )
        band = confidence_band(confidence, corrected=correction is not None)
        effective = (
            correction.corrected_category
            if correction
            else (document.declared_category_code or document.detected_category_code)
        )
        documents.append(
            {
                "id": str(document.id),
                "filename": version.original_filename if version else document.title,
                "status": document.status,
                "status_detail": document.status_detail,
                "effective_category_code": effective,
                "classification": {
                    "status": band,
                    "needs_review": band in UNCERTAIN_CLASSIFICATION,
                    "confidence": confidence,
                },
                "correction": {"corrected_category": correction.corrected_category} if correction else None,
                "duplicate_of": [],
                "warnings": [],
                "sha256": version.sha256 if version else None,
            }
        )

    groups: dict[str, list[int]] = {}
    for index, document in enumerate(documents):
        if document["sha256"]:
            groups.setdefault(document["sha256"], []).append(index)
    for indexes in groups.values():
        if len(indexes) < 2:
            continue
        for index in indexes:
            documents[index]["duplicate_of"] = [documents[i]["id"] for i in indexes if i != index]

    checklist = reconcile_checklist(db, application, documents)
    readiness = compute_readiness(application, documents, checklist)
    latest_manifest = db.scalars(
        select(IntakeManifest)
        .where(IntakeManifest.application_id == application.id)
        .order_by(IntakeManifest.version.desc())
        .limit(1)
    ).first()
    pages_total = sum(int(version.page_count or 0) for version in versions.values())
    return {
        "application": {
            "id": str(application.id),
            "reference_no": application.reference_no,
            "title": application.title,
            "description": application.description,
            "status": application.status,
            "category_code": application.category_code,
            "academic_year": application.academic_year,
            "institution": {
                "id": str(application.institution.id),
                "name": application.institution.name,
                "aicte_pid": application.institution.aicte_pid,
            },
            "declared_data": application.declared_data or {},
            "created_at": str(application.created_at),
            "last_processed_at": str(application.last_processed_at) if application.last_processed_at else None,
        },
        "summary": {
            "documents": len(documents),
            "documents_processed": sum(1 for d in documents if d["status"] == "processed"),
            "documents_failed": sum(1 for d in documents if d["status"] in FAILED_STATUSES),
            "documents_pending": sum(
                1 for d in documents if d["status"] not in ("processed", *FAILED_STATUSES)
            ),
            "documents_needs_review": sum(
                1 for d in documents if d["classification"]["needs_review"] and not d["correction"]
            ),
            "pages_total": pages_total,
            "warnings": 0,
            "exact_duplicates": sum(1 for group in groups.values() if len(group) > 1),
            "visual_duplicates": 0,
            "checklist_satisfied": (checklist.get("counts") or {}).get("satisfied", 0),
            "checklist_required_missing": (checklist.get("counts") or {}).get("missing", 0),
        },
        "readiness": readiness,
        "checklist": {"available": checklist["available"], "counts": checklist.get("counts", {})},
        "manifest": (
            {
                "id": str(latest_manifest.id),
                "version": latest_manifest.version,
                "sha256": latest_manifest.sha256,
                "generated_at": str(latest_manifest.generated_at),
            }
            if latest_manifest
            else None
        ),
    }


# ---------------------------------------------------------------------
# Human correction
# ---------------------------------------------------------------------


def correct_classification(
    db: Session,
    document: Document,
    corrected_category: str,
    reason: str | None,
    reviewer: Profile,
) -> dict[str, Any]:
    category = db.get(DocumentCategory, corrected_category)
    if category is None:
        raise IntakeError("unknown_category", "Unknown document type.", 422)
    if document.status == "processing":
        raise IntakeError("processing_in_progress", "Wait for processing to finish before correcting.", 409)
    version = db.get(DocumentVersion, document.current_version_id)
    correction = DocumentCorrection(
        document_id=document.id,
        document_version_id=version.id if version else None,
        original_category=document.detected_category_code,
        original_confidence=document.classification_confidence,
        corrected_category=corrected_category,
        reviewer_id=reviewer.id,
        reason=(reason or "").strip()[:500] or None,
    )
    db.add(correction)
    document.declared_category_code = corrected_category
    db.flush()
    return document_payload(db, document)


# ---------------------------------------------------------------------
# Manifest & report
# ---------------------------------------------------------------------


def canonical_json(payload: Any) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)


def manifest_payload(db: Session, application: Application) -> dict[str, Any]:
    state = application_state(db, application)
    return {
        "schema_version": "intake-manifest/1",
        "module": "module_1_intake_gateway",
        "generated_at": now_iso(),
        "processor_version": get_settings().INTAKE_PROCESSOR_VERSION,
        "rule_version": get_settings().INTAKE_RULE_VERSION,
        "application": state["application"],
        "summary": state["summary"],
        "documents": [
            {
                **{k: v for k, v in doc.items() if k not in ("pages", "derivatives")},
                "pages": doc["pages"],
                "derivatives": doc["derivatives"],
            }
            for doc in state["documents"]
        ],
        "analysis": state["analysis"],
        "checklist": state["checklist"],
        "readiness": state["readiness"],
        "limitations": MANIFEST_LIMITATIONS,
    }


def manifest_digest(payload: dict[str, Any]) -> str:
    """Content digest that ignores the generation timestamp so retries are idempotent."""
    stable = {key: value for key, value in payload.items() if key != "generated_at"}
    return hashlib.sha256(canonical_json(stable).encode("utf-8")).hexdigest()


def build_manifest(db: Session, application: Application, actor: Any) -> IntakeManifest:
    payload = manifest_payload(db, application)
    digest = manifest_digest(payload)
    latest = db.scalars(
        select(IntakeManifest)
        .where(IntakeManifest.application_id == application.id)
        .order_by(IntakeManifest.version.desc())
        .limit(1)
    ).first()
    if latest is not None and latest.sha256 == digest:
        return latest
    manifest = IntakeManifest(
        application_id=application.id,
        version=(latest.version + 1) if latest else 1,
        payload=payload,
        sha256=digest,
        generated_by=getattr(actor, "id", None),
    )
    db.add(manifest)
    db.flush()
    return manifest


def report_json(db: Session, application: Application, actor: Any) -> tuple[bytes, str]:
    manifest = build_manifest(db, application, actor)
    payload = manifest.payload
    readiness = payload.get("readiness") or {}
    report = {
        "report": "Module 1 intake processing report",
        "reference_no": application.reference_no,
        "manifest_version": manifest.version,
        "manifest_sha256": manifest.sha256,
        "generated_at": now_iso(),
        "overall_status": readiness.get("state"),
        "overall_statement": readiness.get("statement"),
        "document_statuses": _document_status_counts(payload.get("documents") or []),
        "unresolved_issues": _unresolved_issues(payload),
        "data": payload,
        "limitations": MANIFEST_LIMITATIONS,
    }
    filename = f"intake-report-{application.reference_no}-v{manifest.version}.json"
    return json.dumps(report, indent=2, default=str).encode("utf-8"), filename


def _document_status_counts(documents: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"processed_ok": 0, "processed_with_warnings": 0, "needs_review": 0, "failed": 0}
    for doc in documents:
        if doc.get("status") in FAILED_STATUSES:
            counts["failed"] += 1
            continue
        needs_review = (doc.get("classification") or {}).get("needs_review") and not doc.get("correction")
        if needs_review:
            counts["needs_review"] += 1
        elif doc.get("warnings"):
            counts["processed_with_warnings"] += 1
        else:
            counts["processed_ok"] += 1
    return counts


def _unresolved_issues(payload: dict[str, Any]) -> list[dict[str, str]]:
    issues: list[dict[str, str]] = []
    for item in (payload.get("checklist") or {}).get("items") or []:
        if item["requirement"] == "required" and item["status"] in ("missing", "unreadable", "partial", "needs_review"):
            issues.append({"type": "checklist", "label": item["label"], "detail": item["explanation"]})
    for doc in payload.get("documents") or []:
        if doc.get("classification", {}).get("needs_review") and not doc.get("correction"):
            issues.append(
                {"type": "classification", "label": doc.get("filename", ""), "detail": "Classification needs confirmation."}
            )
    for group in (payload.get("analysis") or {}).get("exact_duplicates") or []:
        issues.append(
            {
                "type": "duplicate",
                "label": ", ".join(d["filename"] for d in group["documents"]),
                "detail": "Byte-identical documents detected (SHA-256).",
            }
        )
    return issues


def report_pdf(db: Session, application: Application, actor: Any) -> tuple[bytes, str]:
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    manifest = build_manifest(db, application, actor)
    payload = manifest.payload
    styles = getSampleStyleSheet()
    navy = colors.HexColor("#0F1B3D")
    accent = colors.HexColor("#2F6BFF")
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=8.5, leading=11)
    small = ParagraphStyle("small", parent=body, fontSize=7.5, leading=9.5, textColor=colors.HexColor("#5b6675"))
    title = ParagraphStyle("title", parent=styles["Title"], fontSize=16, textColor=navy, spaceAfter=4)

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=14 * mm,
                            title=f"Intake report {application.reference_no}")
    story: list[Any] = []
    story.append(Paragraph("Resilient AI X ShadeX — Intake Processing Report", title))
    story.append(
        Paragraph(
            f"Application <b>{application.reference_no}</b> · {application.title}<br/>"
            f"Category {application.category_code} · Academic year {application.academic_year} · "
            f"Manifest v{manifest.version} · SHA-256 {manifest.sha256[:16]}…",
            body,
        )
    )
    story.append(Spacer(1, 6))
    readiness = payload.get("readiness") or {}
    story.append(
        Paragraph(
            f"<b>Overall intake status:</b> {str(readiness.get('state', 'unknown')).replace('_', ' ').upper()}<br/>"
            f"{readiness.get('statement', '')}",
            body,
        )
    )
    story.append(Spacer(1, 8))

    counts = _document_status_counts(payload.get("documents") or [])
    summary_rows = [["Documents", "Processed", "With warnings", "Needs review", "Failed", "Pages"]]
    summary = payload.get("summary") or {}
    summary_rows.append(
        [
            str(summary.get("documents", 0)),
            str(counts["processed_ok"]),
            str(counts["processed_with_warnings"]),
            str(counts["needs_review"]),
            str(counts["failed"]),
            str(summary.get("pages_total", 0)),
        ]
    )
    story.append(_pdf_table(summary_rows, Table, TableStyle, colors, accent, navy, header=True))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Document inventory", styles["Heading2"]))
    rows = [["Document", "Format", "Pages", "Classification", "Conf.", "Status"]]
    for item in payload.get("documents") or []:
        classification = item.get("classification") or {}
        rows.append(
            [
                Paragraph(str(item.get("filename", ""))[:80], small),
                str(item.get("format") or ""),
                str(item.get("page_count") or 0),
                Paragraph(str(item.get("effective_category_label") or "Unclassified"), small),
                f"{round((classification.get('confidence') or 0) * 100)}%",
                Paragraph(str(item.get("status") or ""), small),
            ]
        )
    story.append(_pdf_table(rows, Table, TableStyle, colors, accent, navy, header=True, widths=[58, 18, 14, 44, 12, 20]))
    story.append(Spacer(1, 8))

    checklist = payload.get("checklist") or {}
    if checklist.get("available"):
        meta = checklist["checklist"]
        story.append(Paragraph("Checklist reconciliation", styles["Heading2"]))
        story.append(
            Paragraph(
                f"{meta['name']} · version {meta['version']} · {meta['academic_year']}"
                f"{' · PROVISIONAL' if meta.get('is_provisional') else ''}<br/>"
                f"Source: {meta.get('source_reference') or 'not recorded'}",
                small,
            )
        )
        story.append(Spacer(1, 4))
        rows = [["Requirement", "Type", "Status", "Explanation"]]
        for item in checklist.get("items") or []:
            rows.append(
                [
                    Paragraph(item["label"], small),
                    item["requirement"],
                    item["status"].replace("_", " "),
                    Paragraph(item["explanation"], small),
                ]
            )
        story.append(_pdf_table(rows, Table, TableStyle, colors, accent, navy, header=True, widths=[42, 16, 24, 84]))
        story.append(Spacer(1, 8))

    issues = _unresolved_issues(payload)
    story.append(Paragraph("Unresolved issues", styles["Heading2"]))
    if issues:
        rows = [["Type", "Item", "Detail"]]
        for issue in issues:
            rows.append([issue["type"], Paragraph(issue["label"], small), Paragraph(issue["detail"], small)])
        story.append(_pdf_table(rows, Table, TableStyle, colors, accent, navy, header=True, widths=[22, 60, 84]))
    else:
        story.append(Paragraph("No unresolved intake issues.", body))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Limitations", styles["Heading2"]))
    for limitation in MANIFEST_LIMITATIONS:
        story.append(Paragraph(f"• {limitation}", small))
    story.append(Spacer(1, 10))
    story.append(
        Paragraph(
            "This report records intake readiness only. It is not a finding of authenticity, fraud or regulatory compliance.",
            small,
        )
    )
    doc.build(story)
    filename = f"intake-report-{application.reference_no}-v{manifest.version}.pdf"
    return buffer.getvalue(), filename


def _pdf_table(rows, Table, TableStyle, colors, accent, navy, header: bool = True, widths=None):  # noqa: ANN001
    from reportlab.lib.units import mm

    table = Table(rows, colWidths=[w * mm for w in widths] if widths else None, repeatRows=1 if header else 0)
    style = [
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#d5dbe6")),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    if header:
        style += [
            ("BACKGROUND", (0, 0), (-1, 0), navy),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    table.setStyle(TableStyle(style))
    return table


# ---------------------------------------------------------------------
# Page rendering (authorized preview)
# ---------------------------------------------------------------------


def render_page_png(db: Session, document: Document, page_no: int) -> bytes:
    version = db.get(DocumentVersion, document.current_version_id)
    if version is None:
        raise IntakeError("missing_version", "The document has no stored version.", 404)
    raw = storage_mod.read_file(version.storage_backend, version.storage_path)
    try:
        doc = fitz.open(stream=raw, filetype=version.file_ext if version.file_ext in ("pdf", "png", "jpeg") else "pdf")
    except Exception as exc:  # noqa: BLE001
        raise IntakeError("render_failed", f"Could not open the document for rendering: {exc}", 422) from exc
    try:
        if page_no < 1 or page_no > doc.page_count:
            raise IntakeError("page_out_of_range", "Requested page does not exist.", 404)
        page = doc.load_page(page_no - 1)
        pix = page.get_pixmap(dpi=130, colorspace=fitz.csRGB)
        return pix.tobytes("png")
    finally:
        doc.close()
