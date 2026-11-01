"""Synthetic seed data for the demo: catalog entries, rules, providers, users,
institutions, applications and generated sample documents.

Rerunnable: idempotent on keyed rows. Does not delete anything unless --reset is given.
Passwords are demo-only and written plainly in this file on purpose (hackathon demo).
"""
import io
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import fitz
import bcrypt
from sqlalchemy import select, text
from sqlalchemy.orm import Session

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.db import SessionFactory  # noqa: E402
from app.models import (  # noqa: E402
    Application,
    ApplicationCategory,
    ApplicationStatusHistory,
    AuthCredential,
    Document,
    DocumentCategory,
    DocumentPage,
    DocumentVersion,
    Institution,
    InstitutionMembership,
    IntakeChecklist,
    IntakeChecklistItem,
    Profile,
    ReferenceRecord,
    VerificationProvider,
)
from app.security import hash_password  # noqa: E402
from app.services import processing  # noqa: E402

NOW = datetime.now(timezone.utc)

APPLICATION_CATEGORIES = [
    ("EOA", "Extension of Approval", "Renew approval of existing programmes and intake for the academic year.", True, "Approval Process Handbook (placeholder demo reference)"),
]

DOC_CATEGORIES: list[dict] = [
    {
        "code": "fire_noc",
        "name": "Fire Safety NOC",
        "description": "Fire safety no-objection certificate from the local fire authority.",
        "expected_fields": [
            {"name": "noc_number", "label": "NOC number", "type": "identifier", "required": True},
            {"name": "issuer_name", "label": "Issuing authority", "type": "text", "required": True},
            {"name": "issued_on", "label": "Issued on", "type": "date", "required": True},
            {"name": "valid_until", "label": "Valid until", "type": "date", "required": True},
            {"name": "institution_name", "label": "Institution name", "type": "text", "required": True},
        ],
        "classification_keywords": ["fire", "no objection", "noc", "fire safety", "fire service"],
        "has_expiry": True,
        "is_infrastructure": False,
        "sort_order": 10,
    },
    {
        "code": "aicte_letter",
        "name": "Previous AICTE EoA Letter",
        "description": "Extension of Approval letter from the previous cycle.",
        "expected_fields": [
            {"name": "letter_no", "label": "Letter number", "type": "identifier", "required": True},
            {"name": "issued_on", "label": "Issued on", "type": "date", "required": True},
            {"name": "institution_name", "label": "Institution name", "type": "text", "required": True},
            {"name": "aicte_pid", "label": "AICTE Permanent ID", "type": "identifier", "required": True},
            {"name": "academic_year", "label": "Approved academic year", "type": "text", "required": True},
        ],
        "classification_keywords": ["aicte", "extension of approval", "eoa", "permanent id"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 20,
    },
    {
        "code": "land_record",
        "name": "Land Ownership / Lease Record",
        "description": "Sale deed, lease deed or revenue record for the campus plot.",
        "expected_fields": [
            {"name": "survey_no", "label": "Survey number", "type": "identifier", "required": True},
            {"name": "owner_name", "label": "Owner / lessee name", "type": "text", "required": True},
            {"name": "area_sq_m", "label": "Area (sq. m)", "type": "number", "required": True},
            {"name": "issued_on", "label": "Document date", "type": "date", "required": True},
        ],
        "classification_keywords": ["sale deed", "lease", "land", "survey", "khasra", "plot"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 30,
    },
    {
        "code": "building_certificate",
        "name": "Building Completion Certificate",
        "description": "Completion / occupancy certificate from the competent local authority.",
        "expected_fields": [
            {"name": "certificate_no", "label": "Certificate number", "type": "identifier", "required": True},
            {"name": "issued_on", "label": "Issued on", "type": "date", "required": True},
            {"name": "issuer_name", "label": "Issuing authority", "type": "text", "required": True},
            {"name": "institution_name", "label": "Institution name", "type": "text", "required": True},
        ],
        "classification_keywords": ["building", "completion", "occupancy", "municipal", "corporation"],
        "has_expiry": False,
        "is_infrastructure": True,
        "sort_order": 40,
    },
    {
        "code": "lab_photo",
        "name": "Computer Lab Photograph",
        "description": "Wide-angle photograph of the computer lab with workstations visible.",
        "expected_fields": [
            {"name": "room_label", "label": "Room label", "type": "text", "required": False},
            {"name": "workstation_count", "label": "Workstations visible", "type": "number", "required": False},
        ],
        "classification_keywords": ["lab", "workstation", "terminal", "computer lab"],
        "has_expiry": False,
        "is_infrastructure": True,
        "sort_order": 50,
    },
    {
        "code": "bank_statement",
        "name": "Bank / Financial Statement",
        "description": "Bank statement or solvency certificate supporting the declared financial position.",
        "expected_fields": [
            {"name": "account_no", "label": "Account number", "type": "identifier", "required": False},
            {"name": "bank_name", "label": "Bank name", "type": "text", "required": False},
            {"name": "closing_balance", "label": "Closing balance", "type": "number", "required": False},
        ],
        "classification_keywords": ["bank statement", "account statement", "statement of account", "ifsc", "closing balance", "account number"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 70,
    },
    {
        "code": "authorization_certificate",
        "name": "Authorized Signatory Certificate",
        "description": "Board resolution or authority letter naming the authorized signatory.",
        "expected_fields": [
            {"name": "signatory_name", "label": "Authorized signatory", "type": "text", "required": False},
            {"name": "issued_on", "label": "Issued on", "type": "date", "required": False},
        ],
        "classification_keywords": ["authorized signatory", "authorised signatory", "board resolution", "authorization letter", "power of attorney"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 80,
    },
    {
        "code": "passport",
        "name": "Passport",
        "description": "Passport of the authorized signatory, used for identity intake only.",
        "expected_fields": [
            {"name": "passport_no", "label": "Passport number", "type": "identifier", "required": False},
            {"name": "holder_name", "label": "Holder name", "type": "text", "required": False},
            {"name": "valid_until", "label": "Date of expiry", "type": "date", "required": False},
        ],
        "classification_keywords": ["passport", "republic of india", "place of birth", "nationality", "date of expiry", "passport number"],
        "has_expiry": True,
        "is_infrastructure": False,
        "sort_order": 90,
    },
    {
        "code": "identity_document",
        "name": "Identity Document",
        "description": "Aadhaar-style identity card or other government identity document.",
        "expected_fields": [],
        "classification_keywords": ["aadhaar", "aadhar", "identity card", "driving licence", "voter id", "pan card"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 100,
    },
    {
        "code": "affidavit",
        "name": "Affidavit",
        "description": "Sworn affidavit / undertaking with notary attestation.",
        "expected_fields": [],
        "classification_keywords": ["affidavit", "solemnly affirm", "deponent", "notary"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 110,
    },
    {
        "code": "aicte_application_form",
        "name": "AICTE Application Form",
        "description": "Submitted AICTE application form for the academic year.",
        "expected_fields": [],
        "classification_keywords": ["application form", "aicte application", "institution details", "programme details"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 120,
    },
    {
        "code": "other_supporting",
        "name": "Other Supporting Document",
        "description": "Any other supporting document that does not match a specific type.",
        "expected_fields": [],
        "classification_keywords": ["supporting document", "annexure", "enclosure"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 130,
    },
    {
        "code": "faculty_list",
        "name": "Faculty List",
        "description": "Signed list of faculty with qualifications and designations.",
        "expected_fields": [
            {"name": "faculty_count", "label": "Faculty count", "type": "number", "required": True},
            {"name": "institution_name", "label": "Institution name", "type": "text", "required": True},
            {"name": "academic_year", "label": "Academic year", "type": "text", "required": True},
        ],
        "classification_keywords": ["faculty", "professor", "assistant professor", "teaching staff"],
        "has_expiry": False,
        "is_infrastructure": False,
        "sort_order": 60,
    },
]

CHECKLIST_EOA_2026_27 = {
    "code": "AICTE-EOA-2026-27",
    "name": "AICTE EoA document checklist (provisional)",
    "category_code": "EOA",
    "academic_year": "2026-27",
    "version": 1,
    "is_provisional": True,
    "source_reference": (
        "Configured for the prototype from the document list used in the AICTE approval workflow. "
        "Requirements have not yet been verified clause-by-clause against the applicable Approval Process Handbook."
    ),
    "notes": "Provisional configuration: confirm requirement wording and evidence formats against the handbook before production use.",
    "items": [
        ("land_record", "Land Ownership Certificate", "required", 1, "Sale deed, lease deed or revenue record for the campus plot."),
        ("fire_noc", "Building Safety Certification (Fire NOC)", "required", 1, "Fire-safety no-objection certificate from the competent authority."),
        ("faculty_list", "Faculty List (AICTE format)", "required", 1, "Signed faculty list with qualifications and designations."),
        ("bank_statement", "Bank Statement / Financial Solvency", "required", 1, "Bank statement or solvency certificate for the trust/society."),
        ("authorization_certificate", "Authorized Signatory Certificate", "required", 1, "Board resolution or authority letter for the signatory."),
        ("passport", "Passport (Authorized Signatory)", "required", 1, "Passport of the authorized signatory for identity intake."),
        ("lab_photo", "Infrastructure Photographs", "optional", 3, "Photographs of laboratories, classrooms and library."),
        ("other_supporting", "Other Supporting Documents", "optional", 3, "Any additional supporting evidence."),
    ],
}

RULES: list[dict] = [
    {
        "rule_code": "EOA_DOC_FIRE_NOC",
        "name": "Fire NOC present",
        "category": "completeness",
        "definition": {"evaluator": "required_document", "document_category": "fire_noc"},
        "severity": "high",
        "is_demo_rule": True,
        "description": "EoA checklist requires a current fire-safety NOC from the local authority. DEMO RULE - validate against the applicable handbook version before production use.",
    },
    {
        "rule_code": "EOA_FIRE_NOC_CURRENT",
        "name": "Fire NOC not expired",
        "category": "expiry",
        "definition": {"evaluator": "document_expiry", "document_category": "fire_noc", "expiry_field": "valid_until", "grace_days": 0},
        "severity": "high",
        "is_demo_rule": True,
        "description": "The submitted fire NOC must be valid on the evaluation date. DEMO RULE.",
    },
    {
        "rule_code": "EOA_PID_CONSISTENT",
        "name": "AICTE PID agrees across documents",
        "category": "consistency",
        "definition": {"evaluator": "identifier_match", "identifier_field": "aicte_pid"},
        "severity": "critical",
        "is_demo_rule": True,
        "description": "The institution's AICTE Permanent ID must match exactly across application records and supporting documents. DEMO RULE.",
    },
    {
        "rule_code": "EOA_AICTE_LETTER_PRESENT",
        "name": "Previous EoA letter present",
        "category": "completeness",
        "definition": {"evaluator": "required_document", "document_category": "aicte_letter"},
        "severity": "medium",
        "is_demo_rule": True,
        "description": "EoA applications should reference the previous approval letter. DEMO RULE.",
    },
    {
        "rule_code": "DEMO_INTAKE_MIN",
        "name": "Minimum approved intake",
        "category": "regulatory",
        "definition": {"evaluator": "application_field_min", "field_name": "proposed_intake", "min_value": 60},
        "severity": "medium",
        "is_demo_rule": True,
        "description": "Synthetic rule used to demonstrate numeric regulatory evaluation. Not derived from any official handbook paragraph.",
    },
    {
        "rule_code": "EOA_VERIFICATION_FIRE_NOC",
        "name": "Fire NOC source verification",
        "category": "verification",
        "definition": {"evaluator": "verification_status", "provider_code": "demo-firesvc"},
        "severity": "high",
        "is_demo_rule": True,
        "description": "The fire NOC should be confirmed against the (simulated, clearly labelled) issuing source. Mismatch values fail; inconclusive values route to manual review. DEMO RULE.",
    },
]

PROVIDERS = [
    {
        "code": "demo-firesvc",
        "name": "Demo Fire Services Registry (SIMULATED)",
        "provider_type": "simulated",
        "description": "Synthetic issuing-authority responses for fire NOCs. Clearly labelled simulated.",
        "supported_document_categories": ["fire_noc"],
        "availability": "available",
    },
    {
        "code": "demo-aicte-records",
        "name": "Demo AICTE Institutional Records (SIMULATED)",
        "provider_type": "simulated",
        "description": "Synthetic previous-EoA and PID records for demonstration.",
        "supported_document_categories": ["aicte_letter"],
        "availability": "available",
    },
    {
        "code": "demo-land-portal",
        "name": "Demo Land Records Portal (SIMULATED)",
        "provider_type": "simulated",
        "description": "Synthetic land-record service demonstrating SOURCE_UNAVAILABLE handling.",
        "supported_document_categories": ["land_record"],
        "availability": "unavailable",
    },
]

DEMO_USERS = [
    ("admin@resilient-ai.local", "Demo Administrator", "admin", "Password123!"),
    ("reviewer@resilient-ai.local", "Demo Scrutiny Officer", "reviewer", "Password123!"),
    ("institution@resilient-ai.local", "Demo Institution Rep", "institution", "Password123!"),
    ("auditor@resilient-ai.local", "Demo Auditor", "auditor", "Password123!"),
]


def _simple_pdf(title: str, lines: list[str]) -> bytes:
    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    y = 80
    page.insert_text((60, y), title, fontsize=16, fontname="Times-Bold")
    y += 40
    for line in lines:
        page.insert_text((60, y), line, fontsize=11, fontname="Times-Roman")
        y += 22
    data = doc.tobytes()
    doc.close()
    return data


def upsert_user(db: Session, email: str, full_name: str, role: str, password: str) -> Profile:
    profile = db.scalars(select(Profile).where(Profile.email == email)).first()
    pw_hash = hash_password(password)
    if profile is None:
        row = db.execute(
            text(
                """
                insert into auth.users (instance_id, id, aud, email, encrypted_password, email_confirmed_at,
                                        role, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_sso_user)
                values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', :email,
                        extensions.crypt(:pw, extensions.gen_salt('bf')), now(), 'authenticated', now(), now(),
                        '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false)
                returning id
                """
            ),
            {"email": email, "pw": password},
        ).first()
        profile = Profile(id=row[0], email=email, full_name=full_name, role=role, is_demo_account=True)
        db.add(profile)
        db.flush()
    else:
        profile.full_name = full_name
        profile.role = role
        profile.is_active = True
    credential = db.get(AuthCredential, profile.id)
    if credential is None:
        db.add(AuthCredential(user_id=profile.id, password_hash=pw_hash))
    else:
        credential.password_hash = pw_hash
    db.flush()
    return profile


def main(reset: bool = False) -> None:
    db = SessionFactory()
    try:
        if reset:
            db.execute(text(
                "truncate public.finding_evidence, public.findings, public.review_actions,"
                " public.rule_evaluations, public.validation_runs, public.verification_attempts,"
                " public.infrastructure_evidence, public.report_records, public.document_pages,"
                " public.document_classifications, public.extracted_fields, public.field_corrections,"
                " public.processing_jobs, public.document_derivatives, public.document_versions, public.documents,"
                " public.document_corrections, public.intake_manifests, public.intake_checklist_items,"
                " public.intake_checklists,"
                " public.application_status_history, public.applications,"
                " public.reference_records, public.institution_memberships,"
                " public.user_sessions, public.auth_credentials,"
                " public.institutions, public.audit_events, public.notifications cascade"
            ))
            db.commit()
            print("reset done")

        for code, name, desc, enabled, source in APPLICATION_CATEGORIES:
            cat = db.get(ApplicationCategory, code)
            if cat is None:
                db.add(ApplicationCategory(code=code, name=name, description=desc, is_enabled=enabled, source_reference=source))
            else:
                cat.is_enabled = enabled
        for spec in DOC_CATEGORIES:
            cat = db.get(DocumentCategory, spec["code"])
            if cat is None:
                cat = DocumentCategory(code=spec["code"], name=spec["name"])
                db.add(cat)
            cat.description = spec["description"]
            cat.expected_fields = spec["expected_fields"]
            cat.classification_keywords = spec["classification_keywords"]
            cat.has_expiry = spec["has_expiry"]
            cat.is_infrastructure = spec["is_infrastructure"]
            cat.sort_order = spec["sort_order"]
        db.flush()

        checklist = db.scalars(
            select(IntakeChecklist).where(
                IntakeChecklist.code == CHECKLIST_EOA_2026_27["code"],
                IntakeChecklist.version == CHECKLIST_EOA_2026_27["version"],
            )
        ).first()
        if checklist is None:
            checklist = IntakeChecklist(
                code=CHECKLIST_EOA_2026_27["code"],
                name=CHECKLIST_EOA_2026_27["name"],
                category_code=CHECKLIST_EOA_2026_27["category_code"],
                academic_year=CHECKLIST_EOA_2026_27["academic_year"],
                version=CHECKLIST_EOA_2026_27["version"],
                is_provisional=CHECKLIST_EOA_2026_27["is_provisional"],
                source_reference=CHECKLIST_EOA_2026_27["source_reference"],
                notes=CHECKLIST_EOA_2026_27["notes"],
            )
            db.add(checklist)
            db.flush()
        existing_items = {
            item.document_category_code: item
            for item in db.scalars(
                select(IntakeChecklistItem).where(IntakeChecklistItem.checklist_id == checklist.id)
            ).all()
        }
        for order, (code, label, requirement, expected, guidance) in enumerate(CHECKLIST_EOA_2026_27["items"]):
            item = existing_items.get(code)
            if item is None:
                item = IntakeChecklistItem(checklist_id=checklist.id, document_category_code=code, label=label)
                db.add(item)
            item.label = label
            item.requirement = requirement
            item.expected_count = expected
            item.guidance = guidance
            item.sort_order = (order + 1) * 10
        db.flush()

        from app.models import ComplianceRule, RuleVersion

        for spec in RULES:
            rule = db.scalars(select(ComplianceRule).where(ComplianceRule.rule_code == spec["rule_code"])).first()
            if rule is None:
                rule = ComplianceRule(rule_code=spec["rule_code"], name=spec["name"], category=spec["category"])
                db.add(rule)
                db.flush()
            existing = db.scalars(select(RuleVersion).where(RuleVersion.rule_id == rule.id)).first()
            if existing is None:
                version = RuleVersion(
                    rule_id=rule.id,
                    version=1,
                    name=spec["name"],
                    description=spec["description"],
                    definition=spec["definition"],
                    applies_to=["EOA"],
                    severity=spec["severity"],
                    effective_from=date(2024, 1, 1),
                    source_document="synthetic demo ruleset",
                    source_clause=None,
                    is_demo_rule=spec["is_demo_rule"],
                    change_note="seeded",
                )
                db.add(version)
                db.flush()
                rule.current_version_id = version.id
        for spec in PROVIDERS:
            provider = db.get(VerificationProvider, spec["code"])
            if provider is None:
                db.add(VerificationProvider(
                    code=spec["code"], name=spec["name"], provider_type=spec["provider_type"],
                    description=spec["description"], supported_document_categories=spec["supported_document_categories"],
                    availability=spec["availability"],
                ))
            else:
                provider.availability = spec["availability"]
        db.flush()

        admin = upsert_user(db, *DEMO_USERS[0])
        reviewer = upsert_user(db, *DEMO_USERS[1])
        inst_user = upsert_user(db, *DEMO_USERS[2])
        upsert_user(db, *DEMO_USERS[3])

        inst = db.scalars(select(Institution).where(Institution.aicte_pid == "DEMO-PID-1001")).first()
        if inst is None:
            inst = Institution(
                name="Demo Valley Institute of Technology",
                aicte_pid="DEMO-PID-1001",
                institution_type="Engineering and Technology",
                trust_society_name="Valley Education Trust",
                address_line="Plot 42, Knowledge Park",
                city="Pune",
                district="Pune",
                state="Maharashtra",
                pincode="411045",
                contact_email="registrar@dvit-demo.local",
                established_year=2008,
                created_by=admin.id,
            )
            db.add(inst)
            db.flush()
            db.add(InstitutionMembership(institution_id=inst.id, user_id=inst_user.id, member_role="head"))
            db.add(InstitutionMembership(institution_id=inst.id, user_id=admin.id, member_role="representative"))

        application = db.scalars(select(Application).where(Application.reference_no.like("RAI-%")).order_by(Application.created_at.desc())).first()
        if application is None:
            application = Application(
                reference_no=f"RAI-{uuid.uuid4().hex[:8].upper()}",
                institution_id=inst.id,
                category_code="EOA",
                academic_year="2026-27",
                title="EoA renewal for CSE and Mechanical (demo dataset)",
                description="Synthetic demonstration application covering seeded scrutiny cases.",
                status="submitted",
                declared_data={"proposed_intake": "180", "aicte_pid": "DEMO-PID-1001", "institution_name": "Demo Valley Institute of Technology"},
                priority="normal",
                submitted_at=NOW - timedelta(days=1),
                created_by=inst_user.id,
            )
            db.add(application)
            db.flush()
            db.add(ApplicationStatusHistory(
                application_id=application.id, from_status="draft", to_status="submitted",
                actor_id=inst_user.id, reason="seed submission",
            ))
            db.add(ApplicationStatusHistory(
                application_id=application.id, from_status="submitted", to_status="under_review",
                actor_id=reviewer.id, reason="seeded into review",
            ))
            application.status = "under_review"

        application_id = str(application.id)
        # Findings/evaluations/attempts reference the documents being rebuilt; clear them so a
        # reseed does not leave stale open findings from a previous document set.
        for table in ("findings", "validation_runs", "verification_attempts", "report_records"):
            db.execute(text(f"delete from public.{table} where application_id = :aid"), {"aid": application.id})
        db.execute(text("delete from public.document_pages dp using public.document_versions dv, public.applications a"
                        " where dp.document_version_id = dv.id and dv.application_id = a.id and a.id = :aid"),
                   {"aid": application.id})
        db.execute(text("delete from public.extracted_fields where application_id = :aid"), {"aid": application.id})
        db.execute(text("delete from public.document_classifications dc using public.document_versions dv"
                        " where dc.document_version_id = dv.id and dv.application_id = :aid"), {"aid": application.id})
        db.execute(text("delete from public.document_versions where application_id = :aid"), {"aid": application.id})
        db.execute(text("delete from public.documents where application_id = :aid"), {"aid": application.id})
        db.commit()

        def add_document(title: str, category: str, lines: list[str], data: bytes | None = None):
            data = data if data is not None else _simple_pdf(title, lines)
            settings = get_settings()
            from app.services import storage as storage_mod

            meta = storage_mod.save_application_file(application.reference_no, data, f"{title}.pdf")
            document = Document(
                application_id=application.id,
                institution_id=inst.id,
                title=title[:180],
                declared_category_code=category,
                created_by=inst_user.id,
                status="uploaded",
            )
            db.add(document)
            db.flush()
            version = DocumentVersion(
                document_id=document.id,
                application_id=application.id,
                version_no=1,
                original_filename=f"{title}.pdf",
                mime_type=meta["mime_type"],
                file_ext=meta["file_ext"],
                size_bytes=meta["size_bytes"],
                sha256=meta["sha256"],
                storage_backend=meta["backend"],
                storage_path=meta["path"],
                uploaded_by=inst_user.id,
            )
            db.add(version)
            db.flush()
            document.current_version_id = version.id
            document.current_version_no = 1
            db.flush()
            return document, version

        valid_until_current = date.today() + timedelta(days=300)
        valid_until_expired = date.today() - timedelta(days=40)

        fire_doc, _ = add_document("Fire Safety NOC 2025", "fire_noc", [
            "Fire Safety No Objection Certificate",
            "NOC number: FSN-2025-00918",
            "Issuing authority: Directorate of Fire Services, Maharashtra",
            "Institution name: Demo Valley Institute of Technology",
            "Issued on: 12/03/2025",
            f"Valid until: {valid_until_current:%d/%m/%Y}",
            "This certificate confirms inspection of the premises on Kaveri Campus Road, Pune.",
        ])
        letter_doc, _ = add_document("Previous EoA Letter", "aicte_letter", [
            "All India Council for Technical Education",
            "Letter number: AICTE/EOA/2024/0912",
            "Permanent ID: DEMO-PID-1001",
            "Institution name: Demo Valley Institue of Technology",
            "Approved academic year: 2024-25",
            "Issued on: 02/07/2024",
        ])
        land_doc, _ = add_document("Land Sale Deed", "land_record", [
            "Registered Sale Deed",
            "Survey number: 118/2B",
            "Owner / lessee name: Valley Education Trust",
            "Area (sq. m): 12450",
            "Document date: 18/06/2011",
        ])
        building_doc, _ = add_document("Building Completion Certificate", "building_certificate", [
            "Building Completion Certificate",
            "Certificate number: BCC/2016/4410",
            "Issuing authority: Pune Municipal Corporation",
            "Institution name: Demo Valley Institute of Technology",
            "Issued on: 01/12/2016",
        ])
        # Same bytes uploaded twice: demonstrates the SHA-256 exact-duplicate detector.
        lab_lines = [
            "Computer Lab Photograph - Room L-201",
            "Visible workstations: 30",
        ]
        lab_bytes = _simple_pdf("Computer Lab Photograph A", lab_lines)
        lab_doc, _ = add_document("Computer Lab Photograph A", "lab_photo", lab_lines, data=lab_bytes)
        lab_dup, _ = add_document("Computer Lab Photograph B", "lab_photo", lab_lines, data=lab_bytes)
        faculty_doc, _ = add_document("Faculty List 2026-27", "faculty_list", [
            "Faculty Teaching Staff List",
            "Institution name: Demo Valley Institute of Technology",
            "Academic year: 2026-27",
            "Faculty count: 46",
        ])
        expired_doc, _ = add_document("Fire NOC (expired certificate copy)", "fire_noc", [
            "Fire Safety No Objection Certificate",
            "NOC number: FSN-2019-00505",
            "Issuing authority: Directorate of Fire Services, Maharashtra",
            "Institution name: Demo Valley Institute of Technology",
            "Issued on: 20/02/2019",
            f"Valid until: {valid_until_expired:%d/%m/%Y}",
        ])
        db.commit()

        # Canonical record types (earlier seeds wrote 'reference'/'institution').
        db.execute(text("update public.reference_records set record_type = 'fire_noc'"
                        " where provider_code = 'demo-firesvc' and record_type = 'reference'"))
        db.execute(text("update public.reference_records set record_type = 'aicte_record'"
                        " where provider_code = 'demo-aicte-records' and record_type = 'institution'"))

        reference_rows = [
            ("demo-firesvc", "fire_noc", "FSN-2025-00918", {
                "noc_number": "FSN-2025-00918",
                # Must agree with the generated document so the healthy case verifies.
                "issued_on": "2025-03-12",
                "valid_to": valid_until_current.isoformat(),
                "institution_name": "Demo Valley Institute of Technology",
            }),
            ("demo-firesvc", "fire_noc", "FSN-2019-00505", {
                "noc_number": "FSN-2019-00505",
                "issued_on": date(2019, 2, 20).isoformat(),
                "valid_to": valid_until_expired.isoformat(),
                "institution_name": "Demo Valley Institute of Technology",
            }),
            ("demo-aicte-records", "aicte_record", None, {
                "aicte_pid": "DEMO-PID-1001",
                "institution_name": "Demo Valley Institute of Technology",
            }),
        ]
        for provider_code, record_type, reference_no, data in reference_rows:
            existing = db.scalars(
                select(ReferenceRecord).where(
                    ReferenceRecord.provider_code == provider_code,
                    ReferenceRecord.record_type == record_type,
                    ReferenceRecord.reference_no.is_(reference_no) if reference_no is None
                    else ReferenceRecord.reference_no == reference_no,
                )
            ).first()
            if existing is None:
                db.add(ReferenceRecord(
                    provider_code=provider_code,
                    institution_id=inst.id,
                    record_type=record_type,
                    reference_no=reference_no,
                    data=data,
                    valid_from=date(2019, 1, 1),
                    valid_to=valid_until_current if "FSN-2025" in str(data) else None,
                    is_synthetic=True,
                ))
            else:
                # Keep synthetic reference data in step with regenerated demo documents.
                existing.data = data
                existing.valid_to = valid_until_current if "FSN-2025" in str(data) else None
        db.commit()

        to_process = [fire_doc, letter_doc, land_doc, building_doc, lab_doc, lab_dup, faculty_doc, expired_doc]
        print(f"processing {len(to_process)} demo documents ...", flush=True)
        from app.services import gemini as gemini_mod

        gemini_mod.suppress(True)  # deterministic seed data: rules only, no optional network assist
        try:
            for index, document in enumerate(to_process, start=1):
                print(f"  [{index}/{len(to_process)}] {document.title}", flush=True)
                processing.process_document(db, document.id)
                db.commit()
        finally:
            gemini_mod.suppress(False)
        print("running compliance validation ...", flush=True)
        processing.validate_application(db, application.id, reviewer.id)
        verification = db.scalars(select(VerificationProvider)).all()
        from app.services import verification as verification_mod
        from app.services.verification import run_application_verification

        attempts = run_application_verification(db, application, None)
        db.commit()
        print(f"seeded {len(attempts)} verification attempts", flush=True)
        print(f"seed complete: application {application.reference_no}")
    finally:
        db.close()


if __name__ == "__main__":
    main(reset="--reset" in sys.argv)
