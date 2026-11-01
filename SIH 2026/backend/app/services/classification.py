"""Document classification: keyword rules first, Gemini assist optional."""
import logging
from typing import Any

from app.config import get_settings
from app.models import DocumentCategory
from app.services import gemini

logger = logging.getLogger("resilient.classify")


def get_model_id() -> str | None:
    settings = get_settings()
    return settings.GEMINI_MODEL if settings.gemini_enabled else None


def keyword_confidence(best_score: float, second_score: float) -> float:
    """Heuristic rule confidence in [0, 1], NOT a calibrated probability.

    It rewards two independent pieces of evidence: the absolute strength of the winning
    category and how clearly it beats the runner-up. A document can therefore be
    auto-accepted only when its winning signal is strong and unambiguous; a close call
    between two categories stays in the review queue even if both scores are high.
    """
    if best_score <= 0:
        return 0.0
    margin = (best_score - second_score) / best_score
    absolute = min(1.0, best_score / 6.0)
    confidence = 0.3 * margin + 0.55 * absolute
    if best_score >= 4 and margin >= 0.5:
        confidence += 0.1
    return round(min(0.95, confidence), 4)


def classify_by_keywords(all_text: str, categories: list[DocumentCategory]) -> dict[str, Any]:
    lowered = all_text.lower()
    scores: dict[str, float] = {}
    matched_phrases: dict[str, list[str]] = {}
    for category in categories:
        score = 0.0
        hits: list[str] = []
        for kw in category.classification_keywords or []:
            kw_l = str(kw).lower()
            if kw_l and kw_l in lowered:
                weight = 2.0 if " " in kw_l else 1.0
                score += weight
                hits.append(str(kw))
        if category.expected_fields:
            present = [
                str(f.get("name", "")) for f in category.expected_fields if str(f.get("name", "")).lower() in lowered
            ]
            score += len(present) * 0.6
            hits.extend(present)
        scores[category.code] = score
        matched_phrases[category.code] = hits

    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    best_code = ranked[0][0] if ranked else None
    best_score = ranked[0][1] if ranked else 0.0
    second_score = ranked[1][1] if len(ranked) > 1 else 0.0
    if best_score <= 0.0:
        best_code = None
    confidence = keyword_confidence(best_score, second_score) if best_code else 0.0
    rationale = None
    if best_code:
        hits = matched_phrases.get(best_code, [])
        rationale = (
            f"Matched {len(hits)} intake cue(s) for {best_code}: {', '.join(hits[:6])}."
            if hits
            else f"Best available rule score for {best_code}."
        )
    return {
        "predicted_category": best_code,
        "confidence": confidence,
        "method": "keyword_rules",
        "model_id": None,
        "scores": {k: round(v, 2) for k, v in scores.items() if v > 0},
        "evidence": {k: v for k, v in matched_phrases.items() if v},
        "rationale": rationale,
    }


def classify_document(
    all_text: str,
    categories: list[DocumentCategory],
    declared_code: str | None,
) -> dict[str, Any]:
    """Precedence: decisive keyword rules > gemini assist > declared > unknown(None)."""
    rule_result = classify_by_keywords(all_text, categories)
    # Do not spend an optional network call when the deterministic rules are already decisive.
    if (
        rule_result["predicted_category"]
        and rule_result["confidence"] >= get_settings().CLASSIFICATION_AUTO_CONFIDENCE
    ):
        return rule_result
    gemini_result = gemini.classify_document(
        all_text, [{"code": c.code, "name": c.name, "description": c.description} for c in categories]
    )

    if gemini_result and gemini_result["predicted_category"]:
        g_conf = 0.5 + min(0.45, gemini_result["confidence"])
        if rule_result["predicted_category"] is None or rule_result["confidence"] < 0.3 or g_conf >= rule_result["confidence"]:
            combined = dict(rule_result)
            combined.update(
                {
                    "predicted_category": gemini_result["predicted_category"],
                    "confidence": round(g_conf, 4),
                    "method": "gemini+keyword_rules",
                    "model_id": get_model_id(),
                    "scores": {**rule_result["scores"], **({"gemini": g_conf} if g_conf else {})},
                    "rationale": gemini_result.get("rationale"),
                }
            )
            return combined

    if rule_result["predicted_category"]:
        return rule_result

    if declared_code:
        return {
            "predicted_category": declared_code,
            "confidence": 0.4,
            "method": "declared",
            "model_id": None,
            "scores": rule_result["scores"],
            "rationale": "No text signals matched; using institution-declared category",
        }
    return rule_result
