"""Undertakings and the document register: evidence, verification and renewals."""

from datetime import timedelta

from tests.conftest import auth_headers, client, demo_now

PDF = b"%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF"


def _sign(headers: dict[str, str]) -> dict[str, str]:
    signed = client.post("/api/v1/sign", json={"password": "DemoPass!26"}, headers=headers)
    assert signed.status_code == 200, signed.text
    return {**headers, "X-Sign-Token": signed.json()["sign_token"]}


def _upload(headers: dict[str, str], obligation_id: str | None = None) -> dict:
    data = {"type": "affiliation_certificate"}
    if obligation_id:
        data["obligation_id"] = obligation_id
    response = client.post(
        "/api/v1/documents",
        files={"file": ("evidence.pdf", PDF, "application/pdf")},
        data=data,
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _approved_case_with_undertaking(
    institution_session: dict, regional_session: dict, evc_session: dict, bureau_session: dict
) -> dict:
    """Run a case through scrutiny, EVC and approval so one undertaking exists."""
    institution_headers = auth_headers(institution_session["access_token"])
    regional_headers = auth_headers(regional_session["access_token"])
    evc_headers = auth_headers(evc_session["access_token"])
    bureau_headers = auth_headers(bureau_session["access_token"])

    created = client.post(
        "/api/v1/applications",
        json={"type": "increase_in_intake", "academic_year": "2026-27"},
        headers=institution_headers,
    )
    assert created.status_code == 201, created.text
    application = created.json()
    client.post(f"/api/v1/applications/{application['id']}/submit", headers=institution_headers)
    cleared = client.post(
        f"/api/v1/applications/{application['id']}/clear", headers=_sign(regional_headers)
    )
    assert cleared.status_code == 200, cleared.text

    queue = client.get("/api/v1/evc/queue", headers=evc_headers).json()
    case = next(item for item in queue if item["app_no"] == application["app_no"])
    experts = client.get("/api/v1/evc/experts", headers=evc_headers).json()
    expert = next(item for item in experts if item["id"] not in case["conflict_ids"])
    scheduled = client.post(
        f"/api/v1/evc/{case['id']}/schedule",
        json={
            "scheduled_for": (demo_now(evc_headers) + timedelta(days=4)).isoformat(),
            "expert_ids": [expert["id"]],
        },
        headers=evc_headers,
    )
    assert scheduled.status_code == 200, scheduled.text
    completed = client.post(
        f"/api/v1/evc/{case['id']}/complete",
        json={
            "outcome": "recommended_for_approval",
            "recommendation": "Panel found the additional intake supported by the labs on record.",
        },
        headers=_sign(evc_headers),
    )
    assert completed.status_code == 200, completed.text

    approved = client.post(
        f"/api/v1/applications/{application['id']}/approve",
        json={
            "conditions": [
                {
                    "title": "Submit the annual fire safety certificate",
                    "evidence_required": "Signed certificate uploaded to the document register",
                    "due_days": 30,
                }
            ]
        },
        headers=_sign(bureau_headers),
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["stage"] == "approved_with_undertakings"

    obligations = client.get("/api/v1/obligations", headers=institution_headers).json()
    obligation = next(item for item in obligations if item["application_id"] == application["id"])
    assert obligation["state"] == "not_due"
    return obligation


def test_undertaking_needs_evidence_and_an_officer(
    institution_session: dict,
    regional_session: dict,
    evc_session: dict,
    bureau_session: dict,
) -> None:
    institution_headers = auth_headers(institution_session["access_token"])
    bureau_headers = auth_headers(bureau_session["access_token"])
    obligation = _approved_case_with_undertaking(
        institution_session, regional_session, evc_session, bureau_session
    )

    early = client.post(
        f"/api/v1/obligations/{obligation['id']}/verify", headers=_sign(bureau_headers)
    )
    assert early.status_code == 400
    assert "not submitted evidence" in early.json()["detail"]

    _upload(institution_headers, obligation["id"])
    obligations = client.get("/api/v1/obligations", headers=institution_headers).json()
    state = next(item for item in obligations if item["id"] == obligation["id"])
    assert state["state"] == "submitted"
    assert state["evidence_count"] == 1

    unsigned = client.post(
        f"/api/v1/obligations/{obligation['id']}/verify", headers=bureau_headers
    )
    assert unsigned.status_code == 403

    forbidden = client.post(
        f"/api/v1/obligations/{obligation['id']}/verify", headers=_sign(institution_headers)
    )
    assert forbidden.status_code == 403
    assert "Only an officer" in forbidden.json()["detail"]

    verified = client.post(
        f"/api/v1/obligations/{obligation['id']}/verify", headers=_sign(bureau_headers)
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["state"] == "verified"
    assert verified.json()["verified_by"]


def test_verified_undertaking_cannot_be_marked_deficient(bureau_session: dict) -> None:
    bureau_headers = auth_headers(bureau_session["access_token"])
    verified = client.get("/api/v1/obligations?state=verified", headers=bureau_headers).json()
    assert verified
    first = verified[0]

    response = client.post(
        f"/api/v1/obligations/{first['id']}/deficient",
        json={"reason": "Certificate does not cover the current academic year."},
        headers=_sign(bureau_headers),
    )
    assert response.status_code == 400
    assert "cannot be marked deficient" in response.json()["detail"]


def test_document_dates_require_an_officer_signature(
    institution_session: dict, regional_session: dict
) -> None:
    institution_headers = auth_headers(institution_session["access_token"])
    regional_headers = auth_headers(regional_session["access_token"])
    document = _upload(institution_headers)
    assert document["dates_confirmed"] is False

    unsigned = client.post(
        f"/api/v1/documents/{document['id']}/confirm-dates",
        json={"issue_date": "2026-04-01", "expiry_date": "2027-03-31"},
        headers=regional_headers,
    )
    assert unsigned.status_code == 403
    assert "Sign this confirmation" in unsigned.json()["detail"]

    institution_try = client.post(
        f"/api/v1/documents/{document['id']}/confirm-dates",
        json={"issue_date": "2026-04-01", "expiry_date": "2027-03-31"},
        headers=_sign(institution_headers),
    )
    assert institution_try.status_code == 403

    confirmed = client.post(
        f"/api/v1/documents/{document['id']}/confirm-dates",
        json={"issue_date": "2026-04-01", "expiry_date": "2027-03-31"},
        headers=_sign(regional_headers),
    )
    assert confirmed.status_code == 200, confirmed.text
    assert confirmed.json()["dates_confirmed"] is True
    assert confirmed.json()["verification_state"] == "verified"

    invalid = client.post(
        f"/api/v1/documents/{document['id']}/confirm-dates",
        json={"issue_date": "2027-04-01", "expiry_date": "2027-03-31"},
        headers=_sign(regional_headers),
    )
    assert invalid.status_code == 400


def test_renewal_creates_the_next_version(
    institution_session: dict, regional_session: dict
) -> None:
    institution_headers = auth_headers(institution_session["access_token"])
    document = _upload(institution_headers)

    renewed = client.post(
        f"/api/v1/documents/{document['id']}/renew",
        files={"file": ("renewal.pdf", PDF, "application/pdf")},
        headers=institution_headers,
    )
    assert renewed.status_code == 201, renewed.text
    version = renewed.json()
    assert version["version"] == document["version"] + 1
    assert version["parent_id"] == document["id"]
    assert version["type"] == document["type"]
    assert version["dates_confirmed"] is False

    again = client.post(
        f"/api/v1/documents/{document['id']}/renew",
        files={"file": ("renewal-2.pdf", PDF, "application/pdf")},
        headers=institution_headers,
    )
    assert again.status_code == 201
    assert again.json()["version"] == document["version"] + 2

    officer = client.post(
        f"/api/v1/documents/{version['id']}/renew",
        files={"file": ("renewal.pdf", PDF, "application/pdf")},
        headers=auth_headers(regional_session["access_token"]),
    )
    assert officer.status_code == 403
