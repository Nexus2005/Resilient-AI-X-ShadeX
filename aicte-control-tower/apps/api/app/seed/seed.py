"""Idempotent demonstration seed.

Run with: python -m app.seed.seed
Every identifier is derived from a fixed namespace, so a second run updates rows
instead of duplicating them.
"""

import hashlib
import json
import random
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select

from app.core.clock import now_utc
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import (
    Application,
    AuditEvent,
    Document,
    Escalation,
    EvcCase,
    Expert,
    Holiday,
    Institution,
    Notification,
    Obligation,
    Region,
    RuleVersion,
    StageHistory,
    StageInstance,
    SystemClock,
    User,
)
from app.seed.data import (
    CITIES,
    DEMO_PASSWORD,
    DEMO_USERS,
    EVC_NAMES,
    EXPERTS,
    EXTRA_HQ_USERS,
    EXTRA_INSTITUTION_USERS,
    HOLIDAYS,
    INSTITUTION_TYPES,
    OFFICER_NAMES,
    PREFIXES,
    REGIONS,
    RULES_CONFIG,
    STATE_REGION,
    SUFFIXES,
)

NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "aicte-control-tower/seeded-demo")
HQ_EMAIL_DOMAIN = "demo.controltower.in"

APP_TYPES = ["new_institution", "extension_of_approval", "increase_in_intake", "change_of_site"]
DOC_TYPES = [
    "lease_agreement",
    "fire_noc",
    "land_document",
    "building_plan",
    "trust_deed",
    "affiliation_certificate",
    "faculty_list",
]
OBLIGATION_TEMPLATES = [
    ("fire_safety", "Submit the annual fire safety certificate"),
    ("lease_validity", "Upload the renewed land lease agreement"),
    ("faculty_ratio", "Maintain the sanctioned faculty to student ratio"),
    ("lab_equipment", "Replace the calibration certificates for lab equipment"),
    ("library_accession", "Submit the library accession register extract"),
    ("building_completion", "Complete the sanctioned building work"),
]
NOTIFICATION_TEMPLATES = [
    ("stage_warning", "Stage approaching its target"),
    ("stage_overdue", "Stage past its target date"),
    ("document_expiry", "Document expiring soon"),
    ("obligation_due", "Undertaking due soon"),
]


def oid(kind: str, key: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE, f"{kind}:{key}")


def upsert(session, model, kind: str, key: str, **values):
    pk = oid(kind, key)
    obj = session.get(model, pk)
    if obj is None:
        obj = model(id=pk, **values)
        session.add(obj)
    else:
        for field, value in values.items():
            setattr(obj, field, value)
    return obj


def seed_regions(session) -> dict[str, Region]:
    regions: dict[str, Region] = {}
    for region in REGIONS:
        regions[region["name"]] = upsert(
            session,
            Region,
            "region",
            region["name"],
            name=region["name"],
            office_city=region["office_city"],
            states=region["states"],
        )
    session.flush()
    return regions


def build_institutions(session, regions: dict[str, Region]) -> list[Institution]:
    institutions: list[Institution] = []
    for index in range(60):
        city, state, district, lat, lng = CITIES[index // 2]
        prefix = PREFIXES[index]
        suffix = SUFFIXES[index % len(SUFFIXES)]
        name = f"{prefix} {suffix}"
        institution_type = INSTITUTION_TYPES[index % len(INSTITUTION_TYPES)]
        if index == 0:
            name = "Axis Institute of Technology"
            institution_type = "Engineering"
        institutions.append(
            upsert(
                session,
                Institution,
                "institution",
                f"{index:02d}",
                pid=f"AICTE-INST-{index + 1:04d}",
                name=name,
                state=state,
                district=district,
                lat=lat,
                lng=lng,
                region_id=regions[STATE_REGION[state]].id,
                type=institution_type,
                status="approved" if index % 11 else "pending_renewal",
            )
        )
    session.flush()
    return institutions


def seed_users(session, regions: dict[str, Region], institutions: list[Institution]) -> dict:
    password_hash = hash_password(DEMO_PASSWORD)

    def role_key(role: str, region: str | None, index: int) -> str:
        return f"{role}:{region or 'hq'}:{index}"

    users: dict[str, User] = {}

    for name, email, role, region_name in DEMO_USERS:
        region = regions[region_name] if region_name else None
        institution = institutions[0] if role == "institution" else None
        users[role] = upsert(
            session,
            User,
            "user",
            email,
            name=name,
            email=email,
            password_hash=password_hash,
            role=role,
            region_id=region.id if region else None,
            institution_id=institution.id if institution else None,
            prefs={"in_app": True, "email": True, "sms": False, "daily_digest": False},
            active=True,
        )

    other_regions = [name for name in regions if name != "Western"]
    for index, officer_name in enumerate(OFFICER_NAMES):
        region_name = other_regions[index]
        email = f"officer{index + 1}@{HQ_EMAIL_DOMAIN}"
        upsert(
            session,
            User,
            "user",
            email,
            name=officer_name,
            email=email,
            password_hash=password_hash,
            role="regional_officer",
            region_id=regions[region_name].id,
            institution_id=None,
            prefs={"in_app": True, "email": True, "sms": False, "daily_digest": False},
            active=True,
        )

    for index, coordinator_name in enumerate(EVC_NAMES):
        region_name = other_regions[index]
        email = f"evc{index + 1}@{HQ_EMAIL_DOMAIN}"
        upsert(
            session,
            User,
            "user",
            email,
            name=coordinator_name,
            email=email,
            password_hash=password_hash,
            role="evc_coordinator",
            region_id=regions[region_name].id,
            institution_id=None,
            prefs={"in_app": True, "email": True, "sms": False, "daily_digest": False},
            active=True,
        )

    for index, institution_name in enumerate(EXTRA_INSTITUTION_USERS):
        email = f"institution{index + 2}@{HQ_EMAIL_DOMAIN}"
        upsert(
            session,
            User,
            "user",
            email,
            name=institution_name,
            email=email,
            password_hash=password_hash,
            role="institution",
            region_id=None,
            institution_id=institutions[index + 1].id,
            prefs={"in_app": True, "email": True, "sms": False, "daily_digest": False},
            active=True,
        )

    for index, (name, role) in enumerate(EXTRA_HQ_USERS):
        email = f"hq{index + 1}@{HQ_EMAIL_DOMAIN}"
        upsert(
            session,
            User,
            "user",
            email,
            name=name,
            email=email,
            password_hash=password_hash,
            role=role,
            region_id=None,
            institution_id=None,
            prefs={"in_app": True, "email": True, "sms": False, "daily_digest": False},
            active=True,
        )

    session.flush()
    return users


def seed_experts(session, regions: dict[str, Region]) -> None:
    for index, (name, city, institution_name) in enumerate(EXPERTS):
        state = next(state for c, state, *_ in CITIES if c == city)
        region = regions[STATE_REGION[state]]
        upsert(
            session,
            Expert,
            "expert",
            name,
            name=name,
            region_id=region.id,
            home_district=city,
            home_institution=institution_name,
            past_employers=[],
            active=True,
        )


def seed_rule_version(session, admin: User) -> RuleVersion:
    rule = upsert(
        session,
        RuleVersion,
        "rule",
        "default",
        name="APH rules (demonstration)",
        version=1,
        status="published",
        effective_from=datetime(2026, 4, 1, tzinfo=UTC).date(),
        config=RULES_CONFIG,
        created_by=admin.id,
        notes="Seeded version for the demonstration. Clause references are placeholders.",
    )
    session.flush()
    return rule


def stage_for_route(route: list[str], rnd: random.Random) -> tuple[str, str]:
    """Pick a coherent current stage for a route."""
    if not route:
        return "scrutiny", "in_progress"
    if rnd.random() < 0.12:
        return ("closed", "closed") if rnd.random() < 0.6 else ("approved", "approved")

    index = rnd.randrange(len(route))
    entry = route[index]
    if entry == "scrutiny":
        return ("re_scrutiny" if rnd.random() < 0.25 else "scrutiny"), "in_progress"
    if entry == "evc":
        return rnd.choice(["evc_queue", "evc_queue", "evc_scheduled", "evc_completed"]), "in_progress"
    if entry == "sac_shc":
        return "sac_shc", "in_progress"
    return "scrutiny", "in_progress"


def seed_application_data(
    session,
    institutions: list[Institution],
    regions: dict[str, Region],
    rule: RuleVersion,
    users: dict[str, User],
) -> int:
    rnd = random.Random(2026)
    now = now_utc()

    officers_by_region: dict[uuid.UUID, User] = {}
    coordinators_by_region: dict[uuid.UUID, User] = {}
    for user in session.scalars(select(User)).all():
        if user.role == "regional_officer" and user.region_id:
            officers_by_region.setdefault(user.region_id, user)
        if user.role == "evc_coordinator" and user.region_id:
            coordinators_by_region.setdefault(user.region_id, user)
    bureau = users["bureau_officer"]
    targets = RULES_CONFIG["stage_targets_days"]

    created = 0
    for index in range(180):
        institution = institutions[index % len(institutions)]
        app_type = APP_TYPES[index % len(APP_TYPES)]
        route = list(RULES_CONFIG["application_types"][app_type]["route"])
        if index == 0:
            app_type = "new_institution"
            route = ["scrutiny", "evc"]

        if index == 0:
            current_stage, status = "evc_queue", "in_progress"
            submitted_at = now - timedelta(days=9, hours=4)
            stage_entered = now - timedelta(days=3, hours=6)
        else:
            current_stage, status = stage_for_route(route, rnd)
            submitted_at = now - timedelta(days=rnd.randint(1, 120), hours=rnd.randint(0, 20))
            stage_entered = max(
                submitted_at + timedelta(hours=6),
                now - timedelta(days=rnd.randint(1, 12), hours=rnd.randint(0, 18)),
            )

        owner = None
        if index != 0:
            if current_stage in ("scrutiny", "re_scrutiny", "submitted"):
                owner = officers_by_region.get(institution.region_id)
            elif current_stage.startswith("evc"):
                owner = coordinators_by_region.get(institution.region_id) or officers_by_region.get(
                    institution.region_id
                )
            elif current_stage in ("sac_shc", "approved_with_undertakings"):
                owner = bureau
        else:
            owner = officers_by_region.get(institution.region_id)

        application = upsert(
            session,
            Application,
            "application",
            f"{index:03d}",
            app_no=f"AICTE/2026/{index + 1:03d}",
            institution_id=institution.id,
            type=app_type,
            academic_year="2026-27",
            route=route,
            current_stage=current_stage,
            rule_version_id=rule.id,
            status=status,
            submitted_at=submitted_at,
            owner_user_id=owner.id if owner else None,
            locked_fields=["institution_name", "state", "district"] if current_stage == "re_scrutiny" else [],
        )
        created += 1

        if status == "in_progress":
            target = targets.get(current_stage, 7)
            stage = upsert(
                session,
                StageInstance,
                "stage",
                f"{index:03d}:current",
                application_id=application.id,
                stage=current_stage,
                entered_at=stage_entered,
                due_at=stage_entered + timedelta(days=target),
                completed_at=None,
                owner_user_id=owner.id if owner else None,
                paused_seconds=0,
                outcome=None,
            )
            session.add(stage)

        upsert(
            session,
            StageHistory,
            "history",
            f"{index:03d}:submitted",
            application_id=application.id,
            from_stage=None,
            to_stage="submitted",
            actor_id=None,
            reason="Application submitted by the institution.",
            created_at=submitted_at,
        )
        if index == 0:
            cleared_at = now - timedelta(days=4, hours=2)
            upsert(
                session,
                StageHistory,
                "history",
                f"{index:03d}:scrutiny",
                application_id=application.id,
                from_stage="submitted",
                to_stage="scrutiny",
                actor_id=officers_by_region.get(institution.region_id).id
                if officers_by_region.get(institution.region_id)
                else None,
                reason="Routed to scrutiny by the rule version in force.",
                created_at=submitted_at + timedelta(hours=2),
            )
            upsert(
                session,
                StageHistory,
                "history",
                f"{index:03d}:evc",
                application_id=application.id,
                from_stage="scrutiny",
                to_stage="evc_queue",
                actor_id=officers_by_region.get(institution.region_id).id
                if officers_by_region.get(institution.region_id)
                else None,
                reason="Scrutiny cleared. Queued for an EVC visit.",
                created_at=cleared_at,
            )
            upsert(
                session,
                EvcCase,
                "evc",
                "hero",
                application_id=application.id,
                queued_at=cleared_at,
                priority=1,
                scheduled_for=None,
                completed_at=None,
                panel=[],
                report_doc_id=None,
                status="queued",
            )
        elif status == "in_progress":
            upsert(
                session,
                StageHistory,
                "history",
                f"{index:03d}:current",
                application_id=application.id,
                from_stage="submitted",
                to_stage=current_stage,
                actor_id=owner.id if owner else None,
                reason="Stage advanced.",
                created_at=stage_entered,
            )

    session.flush()
    return created


def seed_documents(session, institutions: list[Institution]) -> None:
    now = now_utc()
    rnd = random.Random(77)

    upsert(
        session,
        Document,
        "document",
        "hero-lease",
        institution_id=institutions[0].id,
        application_id=oid("application", "000"),
        obligation_id=None,
        type="lease_agreement",
        version=1,
        parent_id=None,
        file_path="demo/hero-lease-v1.pdf",
        original_name="lease-agreement-axis.pdf",
        sha256=hashlib.sha256(b"hero-lease-v1").hexdigest(),
        issue_date=(now - timedelta(days=1060)).date(),
        expiry_date=(now + timedelta(days=32)).date(),
        dates_confirmed=True,
        ocr_suggestion={
            "expiry_date": (now + timedelta(days=32)).date().isoformat(),
            "confidence": 0.86,
            "snippet": "valid up to ... lease period thirty-six months",
        },
        verification_state="verified",
    )

    for index in range(69):
        institution = institutions[(index + 1) % len(institutions)]
        doc_type = DOC_TYPES[index % len(DOC_TYPES)]
        offset = rnd.randint(-120, 420)
        confirmed = index % 7 != 0
        upsert(
            session,
            Document,
            "document",
            f"{index:03d}",
            institution_id=institution.id,
            application_id=oid("application", f"{index % 180:03d}"),
            obligation_id=None,
            type=doc_type,
            version=2 if index % 9 == 0 else 1,
            parent_id=None,
            file_path=f"demo/document-{index:03d}.pdf",
            original_name=f"{doc_type.replace('_', '-')}-{index:03d}.pdf",
            sha256=hashlib.sha256(f"document-{index}".encode()).hexdigest(),
            issue_date=(now - timedelta(days=rnd.randint(400, 1200))).date(),
            expiry_date=(now + timedelta(days=offset)).date(),
            dates_confirmed=confirmed,
            ocr_suggestion={"expiry_date": None, "confidence": 0.0, "snippet": ""},
            verification_state="verified" if confirmed and offset > 0 else "unverified",
        )


HERO_OBLIGATIONS = [
    ("fire_safety", "Submit the annual fire safety certificate", 18, "due_soon"),
    ("lease_validity", "Upload the renewed land lease agreement", -12, "overdue"),
    ("faculty_ratio", "Maintain the sanctioned faculty to student ratio", 64, "not_due"),
    ("lab_equipment", "Replace the calibration certificates for lab equipment", 9, "submitted"),
    ("building_completion", "Complete the sanctioned building work", 180, "not_due"),
]


def seed_obligations(session, institutions: list[Institution]) -> None:
    now = now_utc()
    rnd = random.Random(91)

    # The demonstration institution carries a spread of undertaking states so the
    # register, the verifier and the reminders all have something real to show.
    hero = institutions[0]
    for number, (obligation_type, title, offset, state) in enumerate(HERO_OBLIGATIONS, start=1):
        upsert(
            session,
            Obligation,
            "obligation",
            f"hero-{number:02d}",
            institution_id=hero.id,
            application_id=oid("application", "000"),
            type=obligation_type,
            title=title,
            source_ref="Approval condition (demonstration)",
            evidence_required="Signed certificate uploaded to the document register",
            due_at=now + timedelta(days=offset),
            state=state,
            owner_user_id=None,
            verified_by=None,
            verified_at=now - timedelta(days=4) if state == "verified" else None,
        )

    for index in range(40):
        institution = institutions[index % len(institutions)]
        obligation_type, title = OBLIGATION_TEMPLATES[index % len(OBLIGATION_TEMPLATES)]
        offset = rnd.randint(-45, 150)
        due_at = now + timedelta(days=offset)
        if offset < 0:
            state = "overdue" if index % 4 else "verified"
        elif offset <= 30:
            state = "due_soon" if index % 3 else "submitted"
        elif index % 5 == 0:
            state = "closed"
        else:
            state = "not_due"

        upsert(
            session,
            Obligation,
            "obligation",
            f"{index:02d}",
            institution_id=institution.id,
            application_id=oid("application", f"{index % 180:03d}"),
            type=obligation_type,
            title=title,
            source_ref="Approval condition (demonstration)",
            evidence_required="Signed certificate uploaded to the document register",
            due_at=due_at,
            state=state,
            owner_user_id=None,
            verified_by=None,
            verified_at=now - timedelta(days=3) if state in ("verified", "closed") else None,
        )


def seed_notifications(session, users: dict[str, User]) -> None:
    now = now_utc()
    all_users = session.scalars(select(User)).all()
    rnd = random.Random(31)

    for index in range(48):
        user = all_users[index % len(all_users)]
        template_key, subject = NOTIFICATION_TEMPLATES[index % len(NOTIFICATION_TEMPLATES)]
        sent_at = now - timedelta(days=rnd.randint(0, 20), hours=rnd.randint(0, 20))
        upsert(
            session,
            Notification,
            "notification",
            f"{index:02d}",
            user_id=user.id,
            channel="in_app" if index % 3 else "email",
            template_key=template_key,
            subject=subject,
            body="Demonstration alert generated by the seed script.",
            trigger="seed",
            trigger_key=f"seed:{index:02d}",
            entity_type="application",
            entity_id=oid("application", f"{index % 180:03d}"),
            status="sent",
            sent_at=sent_at,
            read_at=sent_at + timedelta(hours=6) if index % 4 == 0 else None,
            error=None,
        )


def seed_audit_chain(session, applications: list[Application], admin: User) -> int:
    existing = session.scalar(select(func.count()).select_from(AuditEvent)) or 0
    if existing:
        return 0

    previous = "0" * 64
    events: list[dict] = []
    for application in sorted(applications, key=lambda row: row.app_no):
        events.append(
            {
                "at": application.submitted_at or now_utc(),
                "actor_id": None,
                "role": None,
                "action": "application.submitted",
                "entity_type": "application",
                "entity_id": application.id,
                "payload": {"app_no": application.app_no, "type": application.type},
            }
        )

    events.append(
        {
            "at": now_utc() - timedelta(days=1),
            "actor_id": admin.id,
            "role": "admin",
            "action": "rules.published",
            "entity_type": "rule_version",
            "entity_id": oid("rule", "default"),
            "payload": {"version": 1, "effective_from": "2026-04-01"},
        }
    )

    for event in events:
        body = {
            "at": event["at"].isoformat(),
            "actor_id": str(event["actor_id"]) if event["actor_id"] else None,
            "role": event["role"],
            "action": event["action"],
            "entity_type": event["entity_type"],
            "entity_id": str(event["entity_id"]) if event["entity_id"] else None,
            "payload": event["payload"],
        }
        digest = hashlib.sha256(
            (previous + json.dumps(body, sort_keys=True, separators=(",", ":"))).encode()
        ).hexdigest()
        session.add(AuditEvent(prev_hash=previous, hash=digest, **event))
        previous = digest

    return len(events)


def counts(session) -> dict[str, int]:
    return {
        model.__tablename__: session.scalar(select(func.count()).select_from(model)) or 0
        for model in (
            Region,
            Institution,
            User,
            Expert,
            Application,
            StageInstance,
            Document,
            Obligation,
            Notification,
            AuditEvent,
            RuleVersion,
        )
    }


def run_seed() -> dict[str, int]:
    with SessionLocal() as session:
        regions = seed_regions(session)
        institutions = build_institutions(session, regions)
        users = seed_users(session, regions, institutions)
        seed_experts(session, regions)
        rule = seed_rule_version(session, users["admin"])
        seed_application_data(session, institutions, regions, rule, users)
        seed_documents(session, institutions)
        seed_obligations(session, institutions)

        # The scheduler and the workflow write live alerts. A seed run restores the
        # clean demonstration baseline, so those rows are cleared before the
        # curated demo notifications are upserted. Audit events are never deleted.
        session.execute(
            delete(Notification).where(
                Notification.trigger.in_(("scheduler", "escalation", "workflow"))
            )
        )
        session.execute(delete(Escalation))
        seed_notifications(session, users)

        for holiday_date, label in HOLIDAYS:
            existing = session.scalar(select(Holiday).where(Holiday.date == holiday_date))
            if existing is None:
                session.add(Holiday(date=holiday_date, label=label, region_id=None))

        clock = session.get(SystemClock, 1)
        if clock is None:
            session.add(SystemClock(id=1, offset_seconds=0))
        else:
            clock.offset_seconds = 0

        applications = session.scalars(select(Application)).all()
        seed_audit_chain(session, applications, users["admin"])

        session.commit()
        return counts(session)


def main() -> None:
    result = run_seed()
    print("Seed complete. Row counts:")
    for table, count in result.items():
        print(f"  {table:16} {count}")


if __name__ == "__main__":
    main()
