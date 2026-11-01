from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


def test_root_returns_service_info() -> None:
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["service"] == settings.project_name


def test_health_reports_status_and_database() -> None:
    response = client.get(f"{settings.api_v1_prefix}/health")
    assert response.status_code in (200, 503)
    body = response.json()
    assert body["status"] in ("ok", "degraded")
    assert body["database"] in ("ok", "unavailable")
