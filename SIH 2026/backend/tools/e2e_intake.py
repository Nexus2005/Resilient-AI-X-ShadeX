"""End-to-end Module 1 test against a running API.

Runs a synthetic bundle (PDF, PNG, ZIP with a traversal entry, encrypted PDF, a
renamed executable) through upload -> validation -> processing -> checklist ->
correction -> manifest -> reports, plus an authorization boundary check.

Usage (backend running on :8000):

    .venv/Scripts/python tools/e2e_intake.py
"""
from __future__ import annotations

import io
import json
import os
import sys
import uuid
import zipfile
from pathlib import Path

import fitz
import httpx
from PIL import Image
from sqlalchemy import text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.db import SessionFactory  # noqa: E402

API_ROOT = os.environ.get("RAI_API_ROOT", "http://127.0.0.1:8000")
BASE = f"{API_ROOT}/api/v1"
PASSWORD = "Password123!"


def make_pdf(title: str, lines: list[str]) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((60, 80), title, fontsize=16, fontname="Times-Bold")
    y = 120
    for line in lines:
        page.insert_text((60, y), line, fontsize=11, fontname="Times-Roman")
        y += 22
    data = doc.tobytes()
    doc.close()
    return data


def make_png() -> bytes:
    buffer = io.BytesIO()
    Image.new("RGB", (600, 400), (210, 225, 245)).save(buffer, format="PNG")
    return buffer.getvalue()


def make_zip(entries: dict[str, bytes]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, payload in entries.items():
            archive.writestr(name, payload)
    return buffer.getvalue()


def login(client: httpx.Client, email: str) -> dict[str, str]:
    response = client.post(f"{BASE}/auth/login", json={"email": email, "password": PASSWORD})
    response.raise_for_status()
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def cleanup_previous_runs() -> None:
    db = SessionFactory()
    try:
        db.execute(text("delete from public.applications where title like 'E2E %'"))
        db.execute(text("delete from public.institutions where name like 'E2E %'"))
        db.commit()
    finally:
        db.close()


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  PASS  {label}")
        return
    raise AssertionError(f"{label} failed {detail}")


def main() -> None:
    cleanup_previous_runs()

    with httpx.Client(timeout=180.0) as client:
        health = client.get(f"{API_ROOT}/api/health")
        health.raise_for_status()
        print("health:", health.json())

        institution_headers = login(client, "institution@resilient-ai.local")
        admin_headers = login(client, "admin@resilient-ai.local")

        institutions = client.get(f"{BASE}/institutions", headers=institution_headers).json()["institutions"]
        check("institution visible", len(institutions) > 0)
        institution_id = institutions[0]["id"]

        created = client.post(
            f"{BASE}/applications",
            headers=institution_headers,
            json={
                "institution_id": institution_id,
                "category_code": "EOA",
                "academic_year": "2026-27",
                "title": f"E2E intake bundle {uuid.uuid4().hex[:6]}",
                "description": "Synthetic end-to-end Module 1 bundle",
                "priority": "normal",
                "declared_data": {"proposed_intake": "180", "source": "e2e"},
            },
        )
        created.raise_for_status()
        application = created.json()
        application_id = application["id"]
        print("created application:", application["reference_no"])

        land = make_pdf(
            "Registered Sale Deed",
            [
                "Survey number: 118/2B",
                "Owner / lessee name: Valley Education Trust",
                "Area (sq. m): 12450",
                "Document date: 18/06/2011",
                "This sale deed transfers the plot to the trust.",
            ],
        )
        fire = make_pdf(
            "Fire Safety No Objection Certificate",
            [
                "NOC number: FSN-2026-77120",
                "Issuing authority: Directorate of Fire Services",
                "Institution name: Demo Valley Institute of Technology",
                "Issued on: 12/03/2026",
                "Valid until: 31/12/2027",
            ],
        )
        faculty = make_pdf(
            "Faculty Teaching Staff List",
            [
                "Institution name: Demo Valley Institute of Technology",
                "Academic year: 2026-27",
                "Faculty count: 46",
                "Professor A, Assistant Professor B, Associate Professor C",
            ],
        )
        bank = make_pdf(
            "Bank Statement",
            [
                "Statement of account",
                "Bank name: State Demo Bank",
                "Account number: 000111222333",
                "IFSC: SDBK0000123",
                "Closing balance: 8125000.00",
            ],
        )
        passport = make_pdf(
            "Republic of India Passport",
            [
                "Passport number: P1234567",
                "Holder name: Asha Demo",
                "Nationality: Indian",
                "Place of birth: Pune",
                "Date of expiry: 12/08/2031",
            ],
        )
        signatory = make_pdf(
            "Board Resolution - Authorized Signatory",
            [
                "Authorized signatory: Asha Demo",
                "This board resolution authorizes the signatory to file the application.",
                "Issued on: 02/04/2026",
            ],
        )
        duplicate_bytes = make_pdf("Supporting Document", ["Supporting document annexure for the trust."])
        mismatch = make_pdf("Identity Card", ["Aadhaar identity card reference 1234-5678-9012"])

        encrypted_doc = fitz.open()
        encrypted_doc.new_page(width=300, height=300).insert_text((30, 50), "locked")
        encrypted_buffer = io.BytesIO()
        encrypted_doc.save(encrypted_buffer, encryption=fitz.PDF_ENCRYPT_AES_256, user_pw="x", owner_pw="x")
        encrypted_doc.close()

        archive = make_zip(
            {
                "bundle/Land_Annexure.pdf": make_pdf("Annexure", ["Annexure to the land record survey number 118/2B."]),
                "../escape.pdf": make_pdf("Escape", ["attempted path traversal"]),
            }
        )

        files = [
            ("files", ("Land_Ownership.pdf", land, "application/pdf")),
            ("files", ("Fire_Safety_NOC.pdf", fire, "application/pdf")),
            ("files", ("Faculty_List.pdf", faculty, "application/pdf")),
            ("files", ("Bank_Statement.pdf", bank, "application/pdf")),
            ("files", ("Passport.pdf", passport, "application/pdf")),
            ("files", ("Authorized_Signatory.pdf", signatory, "application/pdf")),
            ("files", ("duplicate_a.pdf", duplicate_bytes, "application/pdf")),
            ("files", ("duplicate_b.pdf", duplicate_bytes, "application/pdf")),
            ("files", ("scan.png", make_png(), "image/png")),
            ("files", ("mismatch.jpg", mismatch, "image/jpeg")),
            ("files", ("broken.pdf", b"MZ\x90\x00 this is an executable, not a pdf", "application/pdf")),
            ("files", ("encrypted.pdf", encrypted_buffer.getvalue(), "application/pdf")),
            ("files", ("bundle.zip", archive, "application/zip")),
        ]
        upload = client.post(f"{BASE}/applications/{application_id}/bundle", headers=institution_headers, files=files)
        upload.raise_for_status()
        upload_body = upload.json()
        print("upload:", {k: upload_body[k] for k in ("stored", "rejected", "skipped")})
        check("stored documents", upload_body["stored"] >= 9, str(upload_body))
        rejected_codes = {r.get("code") for r in upload_body["results"] if r["status"] == "rejected"}
        check("renamed executable rejected", "unsupported_signature" in rejected_codes, str(rejected_codes))
        check("encrypted PDF rejected", "encrypted_pdf" in rejected_codes, str(rejected_codes))
        check("zip traversal rejected", "unsafe_archive_path" in rejected_codes, str(rejected_codes))

        state = client.get(f"{BASE}/applications/{application_id}/intake", headers=institution_headers).json()
        check("documents persisted", state["summary"]["documents"] >= 9, json.dumps(state["summary"]))

        processed = 0
        for document in state["documents"]:
            if document["status"] in ("processed", "failed", "unreadable"):
                continue
            response = client.post(f"{BASE}/documents/{document['id']}/intake/process", headers=institution_headers)
            response.raise_for_status()
            processed += 1
        print("processed documents:", processed)

        state = client.get(f"{BASE}/applications/{application_id}/intake", headers=institution_headers).json()
        summary = state["summary"]
        check("all documents processed", summary["documents_pending"] == 0, json.dumps(summary))
        check("page results persisted", summary["pages_total"] >= summary["documents"], json.dumps(summary))
        check("extension mismatch detected", any(
            doc["ingest_meta"].get("extension_mismatch") for doc in state["documents"]
        ))
        check("exact duplicate detected", len(state["analysis"]["exact_duplicates"]) >= 1, json.dumps(state["analysis"]["exact_duplicates"]))
        text_documents = [
            doc for doc in state["documents"]
            if doc["status"] == "processed" and (doc["text_layer_chars"] or 0) > 20
        ]
        check("classification produced for text documents", all(doc["detected_category_code"] for doc in text_documents))
        scan = next(doc for doc in state["documents"] if doc["filename"] == "scan.png")
        check("blank scan routed to review, not silently accepted", scan["classification"]["needs_review"] is True)
        check("checklist available", state["checklist"]["available"] is True)
        check("checklist has provisional flag", state["checklist"]["checklist"]["is_provisional"] is True)
        check("readiness computed", state["readiness"]["state"] in ("ready", "needs_review", "blocked"), state["readiness"]["state"])

        categories = client.get(f"{BASE}/intake/document-categories", headers=institution_headers).json()["categories"]
        camera = next(doc for doc in state["documents"] if doc["filename"] == "scan.png")
        correction = client.post(
            f"{BASE}/documents/{camera['id']}/classification",
            headers=institution_headers,
            json={"corrected_category": "other_supporting", "reason": "E2E: photo bundle belongs under supporting documents"},
        )
        correction.raise_for_status()
        corrected = correction.json()["document"]
        check("correction applied", corrected["correction"]["corrected_category"] == "other_supporting")
        check("original prediction preserved", corrected["correction"]["original_category"] == corrected["predicted_category_code"])

        refreshed = client.get(f"{BASE}/applications/{application_id}/intake", headers=institution_headers).json()
        persisted = next(doc for doc in refreshed["documents"] if doc["id"] == camera["id"])
        check("correction persisted after reload", persisted["correction"] is not None)
        check("effective category follows correction", persisted["effective_category_code"] == "other_supporting")

        # Idempotent reprocessing must not duplicate pages.
        before_pages = persisted["page_count"]
        again = client.post(f"{BASE}/documents/{camera['id']}/intake/process", headers=institution_headers)
        again.raise_for_status()
        after = client.get(f"{BASE}/documents/{camera['id']}/intake", headers=institution_headers).json()
        check("reprocessing is idempotent", len(after["pages"]) == (before_pages or len(after["pages"])), f"{len(after['pages'])} pages")

        manifest = client.post(f"{BASE}/applications/{application_id}/manifest", headers=institution_headers)
        manifest.raise_for_status()
        manifest_body = manifest.json()
        check("manifest versioned", manifest_body["version"] >= 1)
        check("manifest hashed", len(manifest_body["sha256"]) == 64)
        check("manifest includes checklist", manifest_body["payload"]["checklist"]["available"] is True)
        check("manifest states limitations", "does not verify authenticity" in " ".join(manifest_body["payload"]["limitations"]))

        manifest_again = client.post(f"{BASE}/applications/{application_id}/manifest", headers=institution_headers).json()
        check("manifest idempotent for unchanged data", manifest_again["sha256"] == manifest_body["sha256"])

        report_json = client.get(f"{BASE}/applications/{application_id}/intake/report?format=json", headers=institution_headers)
        report_json.raise_for_status()
        report = report_json.json()
        check("json report has statuses", "document_statuses" in report and "unresolved_issues" in report)
        check(
            "json report is readiness-only",
            report["overall_status"] in ("ready", "needs_review", "blocked")
            and any("does not verify authenticity" in line for line in report["limitations"]),
            str(report.get("overall_status")),
        )
        report_pdf = client.get(f"{BASE}/applications/{application_id}/intake/report?format=pdf", headers=institution_headers)
        report_pdf.raise_for_status()
        check("pdf report generated", report_pdf.content.startswith(b"%PDF"), f"{len(report_pdf.content)} bytes")

        # ---------------------------------------------------------- authorization
        institution = client.post(
            f"{BASE}/institutions",
            headers=admin_headers,
            json={"name": f"E2E Cross Tenant Institute {uuid.uuid4().hex[:4]}", "aicte_pid": f"E2E{uuid.uuid4().hex[:8].upper()}"},
        )
        institution.raise_for_status()
        other_institution_id = institution.json()["id"]
        other_application = client.post(
            f"{BASE}/applications",
            headers=admin_headers,
            json={
                "institution_id": other_institution_id,
                "category_code": "EOA",
                "academic_year": "2026-27",
                "title": "E2E cross tenant application",
                "priority": "normal",
                "declared_data": {},
            },
        )
        other_application.raise_for_status()
        other_id = other_application.json()["id"]
        forbidden = client.get(f"{BASE}/applications/{other_id}/intake", headers=institution_headers)
        check("cross-tenant access denied", forbidden.status_code == 403, str(forbidden.status_code))
        forbidden_docs = client.get(f"{BASE}/applications/{other_id}/intake/report?format=json", headers=institution_headers)
        check("cross-tenant report denied", forbidden_docs.status_code == 403, str(forbidden_docs.status_code))

        print("\nE2E summary")
        print("  application:", application["reference_no"])
        print("  documents:", summary["documents"], "processed:", summary["documents_processed"], "pages:", summary["pages_total"])
        print("  readiness:", refreshed["readiness"]["state"], "| required missing:", refreshed["summary"]["checklist_required_missing"])
        print("  checklist:", refreshed["checklist"]["counts"])
        print("  duplicates:", len(refreshed["analysis"]["exact_duplicates"]))
        print("  manifest:", manifest_body["version"], manifest_body["sha256"][:16])
        print("  categories available:", len(categories))
        print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print("\nFAILED:", exc, file=sys.stderr)
        raise SystemExit(1)
    except httpx.HTTPStatusError as exc:
        print("\nHTTP FAILED:", exc.response.status_code, exc.response.text[:500], file=sys.stderr)
        raise SystemExit(1)
    finally:
        # Keep the demo database tidy: only the seeded dataset survives a run.
        cleanup_previous_runs()
