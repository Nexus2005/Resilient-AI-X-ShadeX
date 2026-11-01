from app.seed.data import DEMO_PASSWORD
from tests.conftest import auth_headers, client, login


def test_login_returns_token_and_portal() -> None:
    body = login("institution@demo.controltower.in")
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["role"] == "institution"
    assert body["user"]["portal"] == "/institution/overview"
    assert body["user"]["institution_name"] == "Axis Institute of Technology"


def test_each_demo_role_has_its_own_portal() -> None:
    expected = {
        "institution@demo.controltower.in": "/institution/overview",
        "regional@demo.controltower.in": "/regional/overview",
        "evc@demo.controltower.in": "/evc/queue",
        "bureau@demo.controltower.in": "/bureau/overview",
        "admin@demo.controltower.in": "/admin/overview",
    }
    for email, portal in expected.items():
        assert login(email)["user"]["portal"] == portal


def test_wrong_password_is_rejected_with_a_clear_message() -> None:
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "institution@demo.controltower.in", "password": "wrong-password"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "Email or password is incorrect."


def test_me_requires_a_token() -> None:
    assert client.get("/api/v1/auth/me").status_code == 401


def test_me_rejects_a_forged_token() -> None:
    response = client.get("/api/v1/auth/me", headers=auth_headers("not-a-real-token"))
    assert response.status_code == 401


def test_change_password_requires_the_current_password(institution_session: dict) -> None:
    response = client.post(
        "/api/v1/auth/change-password",
        headers=auth_headers(institution_session["access_token"]),
        json={"current_password": "not-my-password", "new_password": "AnotherPass!26"},
    )
    assert response.status_code == 400
    assert "current password" in response.json()["detail"]

    # The demo password still works, so the account was not changed.
    assert login("institution@demo.controltower.in", DEMO_PASSWORD)["user"]["role"] == "institution"
