"""Notification delivery: in-app, SMTP email and a simulated SMS adapter."""

import logging
import smtplib
from email.message import EmailMessage
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.clock import now_utc
from app.core.config import settings
from app.models import Notification, User

logger = logging.getLogger("aicte.notify")

TEMPLATES: dict[str, tuple[str, str]] = {
    "stage_warning": (
        "Stage approaching its target",
        "Application {app_no} at {stage} has used {percent} percent of its {target} day target.",
    ),
    "stage_overdue": (
        "Stage past its target",
        "Application {app_no} at {stage} is {days} days past its target and has been escalated.",
    ),
    "document_expiry": (
        "Document expiring",
        "The {document_type} for {institution} expires on {expiry_date}. Upload the renewal.",
    ),
    "obligation_due": (
        "Undertaking due",
        "Undertaking {title} for {institution} is due on {due_date}.",
    ),
    "obligation_overdue": (
        "Undertaking overdue",
        "Undertaking {title} for {institution} was due on {due_date} and is now overdue.",
    ),
    "revert_overdue": (
        "Resubmission deadline missed",
        "{institution} has not resubmitted {app_no} by {due_date}. The decision to revert again or proceed is yours.",
    ),
    "evc_unscheduled": (
        "EVC visit not scheduled",
        "{app_no} has waited {days} days in the EVC queue against a {target} day target.",
    ),
    "escalation": (
        "Escalation level {level}",
        "{entity} has been escalated to you. {context}",
    ),
    "application_submitted": (
        "New case assigned",
        "{app_no} for {institution} is waiting for scrutiny.",
    ),
    "application_reverted": (
        "Application returned",
        "{app_no} was returned by the Regional Officer. Resubmit the required evidence by {due_date}.",
    ),
    "application_resubmitted": (
        "Case resubmitted",
        "{app_no} for {institution} has been resubmitted and returns to your queue.",
    ),
    "application_cleared": (
        "Case cleared from scrutiny",
        "{app_no} for {institution} has moved to {stage}.",
    ),
    "application_approved": (
        "Approval signed",
        "{app_no} for {institution} has been approved with {count} undertakings.",
    ),
    "escalation_acknowledged": (
        "Escalation acknowledged",
        "Level {level} escalation on {entity} was acknowledged by {actor}.",
    ),
    "evc_scheduled": (
        "EVC visit scheduled",
        "The Expert Visit Committee visits {institution} for {app_no} on {date}.",
    ),
    "obligation_verified": (
        "Undertaking verified",
        "{title} for {institution} was verified by an officer. Nothing further is needed.",
    ),
    "obligation_deficient": (
        "Undertaking marked deficient",
        "{title} for {institution} is deficient: {reason}",
    ),
    "document_dates_confirmed": (
        "Document dates confirmed",
        "The {document_type} for {institution} was confirmed by an officer. Its expiry clock now runs.",
    ),
    "document_renewed": (
        "Document renewal uploaded",
        "A new version of the {document_type} for {institution} is waiting for verification.",
    ),
    "clock_advanced": (
        "Demo clock advanced",
        "The demonstration clock moved forward by {days} days.",
    ),
}


def render(template_key: str, context: dict[str, Any]) -> tuple[str, str]:
    subject, body = TEMPLATES.get(template_key, ("Notification", "{app_no}"))
    safe = {key: context.get(key, "") for key in _placeholders(subject) | _placeholders(body)}
    try:
        return subject.format(**safe), body.format(**safe)
    except (KeyError, ValueError):
        return subject, body


def _placeholders(text: str) -> set[str]:
    import re

    return set(re.findall(r"\{(\w+)\}", text))


def send_email(to_address: str, subject: str, body: str) -> None:
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to_address
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as client:
        client.send_message(message)


def channels_for(user: User) -> list[str]:
    prefs = user.prefs or {}
    channels = ["in_app"] if prefs.get("in_app", True) else []
    if prefs.get("email", True):
        channels.append("email")
    if prefs.get("sms", False):
        channels.append("sms")
    return channels


def notify(
    session: Session,
    *,
    user: User,
    template_key: str,
    context: dict[str, Any],
    entity_type: str,
    entity_id,
    trigger_key: str,
    trigger: str,
    channels: list[str] | None = None,
) -> list[Notification]:
    subject, body = render(template_key, context)
    created: list[Notification] = []

    for channel in channels or channels_for(user):
        existing = session.scalar(
            select(Notification).where(
                Notification.entity_type == entity_type,
                Notification.entity_id == entity_id,
                Notification.trigger_key == trigger_key,
                Notification.channel == channel,
            )
        )
        if existing is not None:
            continue

        notification = Notification(
            user_id=user.id,
            channel=channel,
            template_key=template_key,
            subject=subject,
            body=body,
            trigger=trigger,
            trigger_key=trigger_key,
            entity_type=entity_type,
            entity_id=entity_id,
            status="queued",
        )

        if channel == "email":
            try:
                send_email(user.email, subject, body)
                notification.status = "sent"
            except Exception as error:  # delivery failure is recorded, not raised
                logger.warning("email to %s failed: %s", user.email, error)
                notification.status = "failed"
                notification.error = str(error)
        elif channel == "sms":
            # Simulated adapter: no provider is configured in this build.
            notification.status = "sent"
        else:
            notification.status = "sent"

        notification.sent_at = now_utc()
        try:
            with session.begin_nested():
                session.add(notification)
        except IntegrityError:
            # Another process recorded the same alert between the check and the insert.
            continue
        created.append(notification)

    return created
