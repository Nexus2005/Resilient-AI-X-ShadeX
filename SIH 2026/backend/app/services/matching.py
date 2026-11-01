"""Expected-vs-detected document type matching.

The checklist slot says what the applicant was asked to supply; the classifier says what
was actually uploaded. They are not the same question, so this module compares the two
with explicit, configurable rules instead of trusting either side blindly.

Rules are data, not code paths: for each expected document type, ``equivalent`` lists the
detected types that count as the same evidence and ``related`` lists near-equivalents
that must be confirmed by a human. Override the table with the ``INTAKE_MATCH_RULES``
environment variable (JSON object with the same shape).
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.config import get_settings

logger = logging.getLogger("resilient.matching")

DEFAULT_RULES: dict[str, dict[str, list[str]]] = {
    "land_record": {
        "equivalent": ["land_record"],
        # A property certificate is evidence about the same plot, but it is not the
        # ownership/lease record the checklist asks for until a reviewer confirms it.
        "related": ["property_certificate", "building_certificate", "other_supporting"],
    },
    "fire_noc": {"equivalent": ["fire_noc"], "related": ["building_certificate"]},
    "building_certificate": {"equivalent": ["building_certificate"], "related": ["fire_noc", "property_certificate"]},
    "passport": {"equivalent": ["passport"], "related": ["identity_document"]},
    "identity_document": {"equivalent": ["identity_document"], "related": ["passport"]},
    "faculty_list": {"equivalent": ["faculty_list"], "related": ["other_supporting"]},
    "bank_statement": {"equivalent": ["bank_statement"], "related": ["other_supporting"]},
    "authorization_certificate": {
        "equivalent": ["authorization_certificate"],
        "related": ["affidavit", "other_supporting"],
    },
    "lab_photo": {"equivalent": ["lab_photo"], "related": ["other_supporting"]},
    "affidavit": {"equivalent": ["affidavit"], "related": ["authorization_certificate", "other_supporting"]},
    "aicte_letter": {"equivalent": ["aicte_letter"], "related": ["other_supporting"]},
    "aicte_application_form": {"equivalent": ["aicte_application_form"], "related": ["other_supporting"]},
    "other_supporting": {"equivalent": ["other_supporting"], "related": []},
}

MESSAGES: dict[str, str] = {
    "matches": "Detected type matches the required document.",
    "possible_match": "Possible match — confirmation required.",
    "wrong_type": "Wrong document type — upload the required document.",
    "uncertain": "Classification confidence is low — confirm the document type.",
    "unclassified": "Document type could not be detected — confirm it manually.",
    "no_expectation": "No specific document type was requested for this file.",
    "confirmed": "Document type confirmed by a human reviewer.",
}


def rules() -> dict[str, dict[str, list[str]]]:
    raw = get_settings().INTAKE_MATCH_RULES.strip()
    if not raw:
        return DEFAULT_RULES
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("INTAKE_MATCH_RULES is not valid JSON; using built-in matching rules")
        return DEFAULT_RULES
    if not isinstance(parsed, dict):
        logger.warning("INTAKE_MATCH_RULES must be a JSON object; using built-in matching rules")
        return DEFAULT_RULES
    merged = {code: dict(value) for code, value in DEFAULT_RULES.items()}
    for code, value in parsed.items():
        if isinstance(value, dict):
            merged[str(code)] = {
                "equivalent": [str(item) for item in value.get("equivalent", [])],
                "related": [str(item) for item in value.get("related", [])],
            }
    return merged


def match_document(
    expected_code: str | None,
    detected_code: str | None,
    confidence: float | None,
    corrected_code: str | None = None,
    review_threshold: float | None = None,
) -> dict[str, Any]:
    """Compare the requested checklist type with what processing actually detected."""
    threshold = (
        review_threshold
        if review_threshold is not None
        else get_settings().CLASSIFICATION_REVIEW_CONFIDENCE
    )
    result: dict[str, Any] = {
        "expected_code": expected_code,
        "detected_code": detected_code,
        "corrected_code": corrected_code,
        "status": "no_expectation",
        "needs_confirmation": False,
        "message": MESSAGES["no_expectation"],
    }
    if expected_code is None:
        return result
    if corrected_code is not None:
        result.update(
            status="confirmed",
            message=MESSAGES["confirmed"],
            needs_confirmation=False,
        )
        return result
    if detected_code is None:
        result.update(status="unclassified", message=MESSAGES["unclassified"], needs_confirmation=True)
        return result
    if confidence is not None and confidence < threshold:
        result.update(status="uncertain", message=MESSAGES["uncertain"], needs_confirmation=True)
        return result

    for code, rule in rules().items():
        if code != expected_code:
            continue
        if detected_code in rule.get("equivalent", []) or detected_code == expected_code:
            result.update(status="matches", message=MESSAGES["matches"])
            return result
        if detected_code in rule.get("related", []):
            result.update(status="possible_match", message=MESSAGES["possible_match"], needs_confirmation=True)
            return result

    if detected_code == expected_code:
        result.update(status="matches", message=MESSAGES["matches"])
        return result
    result.update(status="wrong_type", message=MESSAGES["wrong_type"])
    return result
