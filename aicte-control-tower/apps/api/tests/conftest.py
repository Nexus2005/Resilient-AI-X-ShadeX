import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.seed.data import DEMO_PASSWORD

client = TestClient(app)


def login(email: str, password: str = DEMO_PASSWORD) -> dict:
    response = client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def demo_now(headers: dict[str, str]):
    """The clock the application uses, so date arithmetic follows the demo offset."""
    from datetime import datetime

    response = client.get("/api/v1/demo/clock", headers=headers)
    assert response.status_code == 200, response.text
    return datetime.fromisoformat(response.json()["now"])


@pytest.fixture(scope="session")
def institution_session() -> dict:
    return login("institution@demo.controltower.in")


@pytest.fixture(scope="session")
def regional_session() -> dict:
    return login("regional@demo.controltower.in")


@pytest.fixture(scope="session")
def evc_session() -> dict:
    return login("evc@demo.controltower.in")


@pytest.fixture(scope="session")
def bureau_session() -> dict:
    return login("bureau@demo.controltower.in")


@pytest.fixture(scope="session")
def admin_session() -> dict:
    return login("admin@demo.controltower.in")
