"""Unit tests for Module 1 intake logic (no database, no network)."""
import io
import zipfile
from types import SimpleNamespace

import fitz
import pytest
from PIL import Image

from app.models import DocumentCategory
from app.services import classification as classify_mod
from app.services import intake


# --------------------------------------------------------------------- helpers


def make_pdf(text: str = "Sample document") -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((60, 80), text, fontsize=14)
    data = doc.tobytes()
    doc.close()
    return data


def make_png(color=(200, 120, 60), size=(240, 160)) -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", size, color).save(buffer, format="PNG")
    return buffer.getvalue()


def make_zip(entries: dict[str, bytes], symlink: str | None = None) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in entries.items():
            archive.writestr(name, payload)
        if symlink:
            info = zipfile.ZipInfo(symlink)
            info.external_attr = (0o120777 << 16)
            archive.writestr(info, "/etc/passwd")
    return buffer.getvalue()


class FakeSettings:
    MAX_UPLOAD_SIZE_MB = 1
    MAX_BUNDLE_SIZE_MB = 2
    MAX_BUNDLE_FILES = 3
    MAX_ARCHIVE_ENTRIES = 4
    MAX_ARCHIVE_UNCOMPRESSED_MB = 1
    MAX_ARCHIVE_RATIO = 50
    CLASSIFICATION_AUTO_CONFIDENCE = 0.75
    CLASSIFICATION_REVIEW_CONFIDENCE = 0.45
    OCR_LOW_CONFIDENCE = 0.55
    INTAKE_PROCESSOR_VERSION = "intake-test"
    INTAKE_RULE_VERSION = "rules-test"

    @property
    def max_upload_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def max_bundle_bytes(self) -> int:
        return self.MAX_BUNDLE_SIZE_MB * 1024 * 1024

    @property
    def max_archive_bytes(self) -> int:
        return self.MAX_ARCHIVE_UNCOMPRESSED_MB * 1024 * 1024


@pytest.fixture()
def fake_settings(monkeypatch):
    monkeypatch.setattr(intake, "get_settings", lambda: FakeSettings())
    return FakeSettings()


# --------------------------------------------------------------------- completion rules


def _doc(status: str = "processed") -> dict:
    return {"status": status}


def _checklist(*items) -> dict:
    return {"items": list(items)}


def _item(label: str, status: str, requirement: str = "required") -> dict:
    return {"label": label, "status": status, "requirement": requirement}


def test_completion_allows_fully_processed_bundle_with_required_items():
    result = intake.completion_check(
        [_doc(), _doc()],
        _checklist(_item("Land", "satisfied"), _item("Lab photo", "optional_missing", "optional")),
    )
    assert result["can_complete"] is True
    assert result["blockers"] == []


def test_completion_blocks_missing_evidence_and_unprocessed_documents():
    result = intake.completion_check(
        [_doc("uploaded"), _doc("failed")],
        _checklist(_item("Land", "missing"), _item("Notes", "optional_missing", "optional")),
    )
    assert result["can_complete"] is False
    assert any("still need processing" in blocker for blocker in result["blockers"])
    assert any("failed processing" in blocker for blocker in result["blockers"])
    assert any("Land" in blocker for blocker in result["blockers"])


def test_completion_without_documents_is_blocked():
    result = intake.completion_check([], _checklist())
    assert result["can_complete"] is False
    assert result["blockers"]


# --------------------------------------------------------------------- signatures


def test_detect_format_uses_real_signatures():
    assert intake.detect_format(make_pdf()) == "pdf"
    assert intake.detect_format(make_png()) == "png"
    assert intake.detect_format(b"\xff\xd8\xff\xe0" + b"0" * 20) == "jpeg"
    assert intake.detect_format(make_zip({"a.pdf": make_pdf()})) == "zip"
    assert intake.detect_format(b"MZ\x90\x00 this is not a document") == "unknown"


def test_validate_upload_rejects_wrong_signature_and_empty():
    with pytest.raises(intake.IntakeError) as exc:
        intake.validate_upload("scan.pdf", b"not a pdf at all")
    assert exc.value.code == "unsupported_signature"

    with pytest.raises(intake.IntakeError) as exc:
        intake.validate_upload("scan.pdf", b"")
    assert exc.value.code == "empty_file"


def test_validate_upload_detects_extension_mismatch(fake_settings):
    info = intake.validate_upload("looks_like_image.jpg", make_pdf())
    assert info["format"] == "pdf"
    assert info["extension_mismatch"] is True
    assert info["structure"]["page_count"] == 1
    assert len(info["sha256"]) == 64


def test_validate_upload_rejects_oversized_file(fake_settings):
    with pytest.raises(intake.IntakeError) as exc:
        intake.validate_upload("large.pdf", make_pdf() + b"0" * (2 * 1024 * 1024))
    assert exc.value.code == "file_too_large"
    assert exc.value.status_code == 413


def test_validate_upload_rejects_corrupted_image(fake_settings):
    with pytest.raises(intake.IntakeError) as exc:
        intake.validate_upload("broken.png", b"\x89PNG\r\n\x1a\n" + b"broken")
    assert exc.value.code == "corrupted_image"


def test_encrypted_pdf_is_rejected_explicitly(fake_settings):
    doc = fitz.open()
    doc.new_page(width=200, height=200).insert_text((20, 40), "secret")
    buffer = io.BytesIO()
    doc.save(buffer, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="pass", owner_pw="pass")
    doc.close()
    with pytest.raises(intake.IntakeError) as exc:
        intake.validate_upload("locked.pdf", buffer.getvalue())
    assert exc.value.code == "encrypted_pdf"
    assert exc.value.status_code == 422


def test_malformed_pdf_is_rejected():
    with pytest.raises(intake.IntakeError) as exc:
        intake.inspect_pdf_structure(b"%PDF-1.7 not really a pdf")
    assert exc.value.code in ("malformed_pdf", "empty_pdf")


# --------------------------------------------------------------------- ZIP safety


@pytest.mark.parametrize(
    "name",
    ["../escape.pdf", "nested/../../escape.pdf", "/etc/passwd", "C:/windows/system32/x.pdf", "a\x00b.pdf"],
)
def test_unsafe_archive_names_are_detected(name):
    assert intake.unsafe_archive_name(name) is True


@pytest.mark.parametrize("name", ["docs/land.pdf", "land.pdf", "./folder/fire.pdf"])
def test_safe_archive_names_pass(name):
    assert intake.unsafe_archive_name(name) is False


def test_read_archive_extracts_supported_entries_and_rejects_traversal(fake_settings):
    archive = make_zip({"bundle/land.pdf": make_pdf("land"), "../evil.pdf": make_pdf("evil")})
    result = intake.read_archive(archive)
    assert [entry["filename"] for entry in result["entries"]] == ["bundle/land.pdf"]
    assert any(error["code"] == "unsafe_archive_path" for error in result["errors"])


def test_read_archive_rejects_symlinks(fake_settings):
    archive = make_zip({"ok.pdf": make_pdf()}, symlink="link.pdf")
    result = intake.read_archive(archive)
    assert any(error["code"] == "archive_symlink" for error in result["errors"])


def test_read_archive_rejects_nested_archives(fake_settings):
    inner = make_zip({"a.pdf": make_pdf()})
    archive = make_zip({"inner.zip": inner, "ok.pdf": make_pdf()})
    result = intake.read_archive(archive)
    assert any(error["code"] == "nested_archive" for error in result["errors"])
    assert len(result["entries"]) == 1


def test_read_archive_rejects_too_many_entries(fake_settings):
    entries = {f"doc{i}.pdf": make_pdf() for i in range(6)}
    with pytest.raises(intake.IntakeError) as exc:
        intake.read_archive(make_zip(entries))
    assert exc.value.code == "archive_too_many_entries"
    assert exc.value.status_code == 413


def test_read_archive_rejects_decompression_bomb(fake_settings):
    bomb = b"A" * (3 * 1024 * 1024)  # compresses far beyond the ratio limit
    with pytest.raises(intake.IntakeError) as exc:
        intake.read_archive(make_zip({"bomb.pdf": bomb}))
    assert exc.value.code in ("archive_bomb_suspected", "archive_too_large")


def test_read_archive_rejects_malformed_zip(fake_settings):
    with pytest.raises(intake.IntakeError) as exc:
        intake.read_archive(b"PK\x03\x04 definitely not a zip archive")
    assert exc.value.code in ("malformed_archive", "empty_archive")


def test_bundle_limits_are_enforced_before_any_storage(fake_settings):
    with pytest.raises(intake.IntakeError) as exc:
        intake.upload_bundle(None, None, None, [])
    assert exc.value.code == "no_files"

    files = [("a.pdf", make_pdf())] * 4
    with pytest.raises(intake.IntakeError) as exc:
        intake.upload_bundle(None, None, None, files)
    assert exc.value.code == "too_many_files"

    big = [("big.pdf", make_pdf() + b"0" * (1024 * 1024))]
    big += [("big2.pdf", make_pdf() + b"0" * (1024 * 1024))]
    big += [("big3.pdf", make_pdf() + b"0" * (1024 * 1024))]
    with pytest.raises(intake.IntakeError) as exc:
        intake.upload_bundle(None, None, None, big)
    assert exc.value.code == "bundle_too_large"


# --------------------------------------------------------------------- normalization


def test_normalize_image_produces_derivative_bytes():
    data, notes = intake.normalize_image_bytes(make_png())
    assert data.startswith(b"\x89PNG\r\n\x1a\n")
    assert notes["width"] == 240
    assert notes["mode"] == "RGB"


# --------------------------------------------------------------------- classification


def test_keyword_confidence_prefers_clear_winner():
    strong = classify_mod.keyword_confidence(6, 0)
    ambiguous = classify_mod.keyword_confidence(4, 4)
    weak = classify_mod.keyword_confidence(0, 0)
    assert strong >= 0.9
    # A tie between two equally strong categories must stay below the review threshold.
    assert ambiguous < 0.45
    assert weak == 0.0


def test_classify_by_keywords_marks_ambiguous_documents_for_review():
    categories = [
        DocumentCategory(
            code="fire_noc",
            name="Fire NOC",
            classification_keywords=["fire safety", "no objection", "noc"],
            expected_fields=[],
        ),
        DocumentCategory(
            code="bank_statement",
            name="Bank statement",
            classification_keywords=["bank statement", "ifsc", "closing balance"],
            expected_fields=[],
        ),
    ]
    clear = classify_mod.classify_by_keywords(
        "Fire Safety No Objection Certificate. NOC number FSN-1", categories
    )
    assert clear["predicted_category"] == "fire_noc"
    assert clear["confidence"] >= 0.75
    assert "Evidence" in (clear["rationale"] or "") or clear["rationale"]

    ambiguous = classify_mod.classify_by_keywords("bank statement and fire safety document", categories)
    assert ambiguous["predicted_category"] is not None
    assert ambiguous["confidence"] < 0.75


def test_confidence_band_thresholds(fake_settings):
    assert intake.confidence_band(None) == "unclassified"
    assert intake.confidence_band(0.9) == "auto_classified"
    assert intake.confidence_band(0.6) == "needs_review"
    assert intake.confidence_band(0.2) == "uncertain"
    assert intake.confidence_band(0.1, corrected=True) == "confirmed"


# --------------------------------------------------------------------- page evidence


def test_missing_page_evidence_only_when_text_asserts_more_pages():
    pages = [
        {"page_no": 1, "preview": "Cover"},
        {"page_no": 2, "preview": "Page 2 of 5 continues"},
    ]
    findings = intake.missing_page_evidence(pages)
    assert len(findings) == 1
    assert findings[0]["declared_total"] == 5
    assert findings[0]["observed_pages"] == 2

    assert intake.missing_page_evidence([{"page_no": 1, "preview": "Cover"}]) == []


# --------------------------------------------------------------------- readiness


def make_document(status="processed", uncertain=False, corrected=False, warnings=0):
    return {
        "id": f"doc-{status}-{uncertain}",
        "filename": "sample.pdf",
        "status": status,
        "status_detail": None,
        "classification": {"needs_review": uncertain, "confidence": 0.2},
        "correction": {"corrected_category": "x"} if corrected else None,
        "warnings": [{"code": "w", "severity": "low", "message": "w"}] * warnings,
    }


def checklist(items):
    return {"available": True, "items": items, "counts": {}}


def required_item(status, requirement="required", label="Land record"):
    return {
        "category_code": "land_record",
        "label": label,
        "requirement": requirement,
        "status": status,
        "explanation": "test",
    }


def test_readiness_blocked_by_missing_required_document():
    readiness = intake.compute_readiness(
        None,
        [make_document()],
        checklist([required_item("missing")]),
    )
    assert readiness["state"] == "blocked"
    assert readiness["blocking_required"] == ["Land record"]


def test_readiness_needs_review_for_uncertain_classification():
    readiness = intake.compute_readiness(
        None,
        [make_document(uncertain=True)],
        checklist([required_item("satisfied")]),
    )
    assert readiness["state"] == "needs_review"


def test_readiness_ready_when_required_satisfied_and_nothing_pending():
    readiness = intake.compute_readiness(
        None,
        [make_document()],
        checklist([required_item("satisfied")]),
    )
    assert readiness["state"] == "ready"
    assert readiness["reasons"] == []


def test_readiness_empty_without_documents():
    assert intake.compute_readiness(None, [], checklist([]))["state"] == "empty"


def test_optional_missing_does_not_block():
    readiness = intake.compute_readiness(
        None,
        [make_document()],
        checklist([required_item("optional_missing", requirement="optional")]),
    )
    assert readiness["state"] == "ready"


# --------------------------------------------------------------------- reports


def test_report_helpers_distinguish_statuses():
    documents = [
        {"filename": "ok.pdf", "status": "processed", "warnings": [], "classification": {"needs_review": False}, "correction": None},
        {"filename": "warn.pdf", "status": "processed", "warnings": [{"code": "blank"}], "classification": {"needs_review": False}, "correction": None},
        {"filename": "review.pdf", "status": "processed", "warnings": [], "classification": {"needs_review": True}, "correction": None},
        {"filename": "failed.pdf", "status": "failed", "warnings": [], "classification": {"needs_review": True}, "correction": None},
    ]
    counts = intake._document_status_counts(documents)
    assert counts == {"processed_ok": 1, "processed_with_warnings": 1, "needs_review": 1, "failed": 1}

    issues = intake._unresolved_issues(
        {
            "checklist": {"items": [required_item("missing")]},
            "documents": documents,
            "analysis": {"exact_duplicates": [{"documents": [{"filename": "a.pdf", "id": "1"}]}]},
        }
    )
    types = {issue["type"] for issue in issues}
    assert types == {"checklist", "classification", "duplicate"}


def test_manifest_limitations_never_claim_verification():
    joined = " ".join(intake.MANIFEST_LIMITATIONS).lower()
    assert "does not verify authenticity" in joined
    assert "intake readiness only" in joined
