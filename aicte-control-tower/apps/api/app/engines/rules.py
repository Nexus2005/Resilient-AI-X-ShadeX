"""Rule version loading and route resolution."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Application, RuleVersion

FALLBACK_CONFIG = {
    "application_types": {
        "new_institution": {"route": ["scrutiny", "evc", "sac_shc"], "documents": []},
        "extension_of_approval": {"route": ["scrutiny"], "documents": []},
        "increase_in_intake": {"route": ["scrutiny", "evc"], "documents": []},
        "change_of_site": {"route": ["evc", "sac_shc"], "documents": []},
    },
    "stage_targets_days": {"scrutiny": 7, "re_scrutiny": 5, "evc_queue": 5, "sac_shc": 10, "approval": 5},
    "reminders_days_before": [90, 60, 30, 7],
    "escalation_ladder": [
        {"level": 1, "after_hours": 0, "to": "regional_officer"},
        {"level": 2, "after_hours": 72, "to": "bureau_officer"},
        {"level": 3, "after_hours": 168, "to": "member_secretary_view"},
    ],
}


def published_rule(session: Session) -> RuleVersion | None:
    return session.scalar(
        select(RuleVersion)
        .where(RuleVersion.status == "published")
        .order_by(RuleVersion.effective_from.desc(), RuleVersion.version.desc())
        .limit(1)
    )


def rule_config(version: RuleVersion | None) -> dict:
    if version is None or not version.config:
        return FALLBACK_CONFIG
    return version.config


def resolve_route(config: dict, app_type: str) -> list[str]:
    entry = (config.get("application_types") or {}).get(app_type) or {}
    return list(entry.get("route") or ["scrutiny"])


def required_documents(config: dict, app_type: str) -> list[str]:
    entry = (config.get("application_types") or {}).get(app_type) or {}
    return list(entry.get("documents") or [])


def target_days(config: dict, stage: str) -> int:
    return int((config.get("stage_targets_days") or {}).get(stage, 7))


def escalation_ladder(config: dict) -> list[dict]:
    ladder = config.get("escalation_ladder")
    return ladder if isinstance(ladder, list) and ladder else FALLBACK_CONFIG["escalation_ladder"]


def reminders_days(config: dict) -> list[int]:
    values = config.get("reminders_days_before")
    return values if isinstance(values, list) and values else [90, 60, 30, 7]


def next_stage_for_route(route: list[str], current_stage: str, cleared_entry: str) -> str | None:
    """Return the next workflow stage after clearing a route entry."""
    if cleared_entry not in route:
        return None
    index = route.index(cleared_entry)
    if index + 1 >= len(route):
        return None
    nxt = route[index + 1]
    return {"scrutiny": "scrutiny", "evc": "evc_queue", "sac_shc": "sac_shc"}.get(nxt)


def stage_for_route_entry(entry: str) -> str:
    return entry


def application_route(application: Application) -> list[str]:
    return list(application.route or [])
