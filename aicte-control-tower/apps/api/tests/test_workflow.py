import uuid

from tests.conftest import auth_headers, client


def _create_and_submit(headers: dict[str, str]) -> dict:
    created = client.post(
        "/api/v1/applications",
        json={"type": "increase_in_intake", "academic_year": "2026-27"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    application = created.json()
    submitted = client.post(
        f"/api/v1/applications/{application['id']}/submit", headers=headers
    )
    assert submitted.status_code == 200, submitted.text
    return application


def test_detail_exposes_stage_actions_and_summary(institution_session: dict) -> None:
    headers = auth_headers(institution_session["access_token"])
    application = _create_and_submit(headers)

    response = client.get(f"/api/v1/applications/{application['id']}", headers=headers)
    assert response.status_code == 200, response.text
    detail = response.json()

    assert detail["open_stage"]["stage"] == "scrutiny"
    assert detail["open_stage"]["owner_name"]
    assert detail["audit_chain_valid"] is True
    assert detail["summary"].startswith(application["app_no"])
    assert detail["audit"][0]["hash"]
    assert detail["permitted_actions"] == []


def test_revert_requires_a_signature(institution_session: dict, regional_session: dict) -> None:
    institution_headers = auth_headers(institution_session["access_token"])
    regional_headers = auth_headers(regional_session["access_token"])
    application = _create_and_submit(institution_headers)

    body = {
        "category": "Fire NOC not in the institution name",
        "required_evidence": "Revised fire NOC issued to the trust",
        "due_days": 7,
    }

    unsigned = client.post(
        f"/api/v1/applications/{application['id']}/revert",
        json=body,
        headers=regional_headers,
    )
    assert unsigned.status_code == 403
    assert "Sign this decision" in unsigned.json()["detail"]

    wrong = client.post(
        "/api/v1/sign", json={"password": "not-the-password"}, headers=regional_headers
    )
    assert wrong.status_code == 400

    signed = client.post(
        "/api/v1/sign", json={"password": "DemoPass!26"}, headers=regional_headers
    )
    assert signed.status_code == 200, signed.text

    reverted = client.post(
        f"/api/v1/applications/{application['id']}/revert",
        json=body,
        headers={**regional_headers, "X-Sign-Token": signed.json()["sign_token"]},
    )
    assert reverted.status_code == 200, reverted.text
    assert reverted.json()["stage"] == "reverted"

    detail = client.get(
        f"/api/v1/applications/{application['id']}", headers=institution_headers
    ).json()
    assert detail["status"] == "reverted"
    assert detail["reverts"][0]["status"] == "open"
    assert detail["reverts"][0]["issued_by_name"]
    assert "institution_name" in detail["locked_fields"]
    events = [item["action"] for item in detail["audit"]]
    assert "application.reverted" in events
    assert detail["audit_chain_valid"] is True

    resubmitted = client.post(
        f"/api/v1/applications/{application['id']}/resubmit", headers=institution_headers
    )
    assert resubmitted.status_code == 200, resubmitted.text
    assert resubmitted.json()["stage"] == "re_scrutiny"

    cleared = client.post(
        f"/api/v1/applications/{application['id']}/clear",
        headers={**regional_headers, "X-Sign-Token": signed.json()["sign_token"]},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["stage"] == "evc_queue"

    detail = client.get(
        f"/api/v1/applications/{application['id']}", headers=regional_headers
    ).json()
    assert detail["evc"]["status"] == "queued"
    assert detail["current_stage"] == "evc_queue"


def test_revert_without_signature_is_rejected(regional_session: dict) -> None:
    headers = auth_headers(regional_session["access_token"])
    listing = client.get("/api/v1/applications?page_size=1", headers=headers).json()
    application_id = listing["items"][0]["id"]

    response = client.post(
        f"/api/v1/applications/{application_id}/revert",
        json={"category": "test", "required_evidence": "test", "due_days": 5},
        headers=headers,
    )
    assert response.status_code == 403
    assert "Sign this decision" in response.json()["detail"]


def test_institution_cannot_revert_its_own_case(institution_session: dict) -> None:
    headers = auth_headers(institution_session["access_token"])
    application = _create_and_submit(headers)
    signed = client.post("/api/v1/sign", json={"password": "DemoPass!26"}, headers=headers)
    assert signed.status_code == 200

    response = client.post(
        f"/api/v1/applications/{application['id']}/revert",
        json={"category": "test", "required_evidence": "test", "due_days": 5},
        headers={**headers, "X-Sign-Token": signed.json()["sign_token"]},
    )
    assert response.status_code == 403
    assert "Regional Officer" in response.json()["detail"]


def test_unknown_application_returns_404(bureau_session: dict) -> None:
    headers = auth_headers(bureau_session["access_token"])
    response = client.get(f"/api/v1/applications/{uuid.uuid4()}", headers=headers)
    assert response.status_code == 404


def test_server_side_sorting_and_paging(bureau_session: dict) -> None:
    headers = auth_headers(bureau_session["access_token"])
    response = client.get(
        "/api/v1/applications?sort=institution&direction=asc&page_size=10", headers=headers
    )
    assert response.status_code == 200
    names = [item["institution_name"] for item in response.json()["items"]]
    assert names == sorted(names)

    second = client.get(
        "/api/v1/applications?sort=app_no&direction=asc&page_size=5&page=2", headers=headers
    ).json()
    first = client.get(
        "/api/v1/applications?sort=app_no&direction=asc&page_size=5&page=1", headers=headers
    ).json()
    assert second["items"][0]["app_no"] > first["items"][-1]["app_no"]
