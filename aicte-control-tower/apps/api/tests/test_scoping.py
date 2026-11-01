from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import Application, Obligation, Region
from tests.conftest import auth_headers, client


def test_institution_sees_only_itself(institution_session: dict) -> None:
    headers = auth_headers(institution_session["access_token"])
    response = client.get("/api/v1/institutions", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "Axis Institute of Technology"


def test_institution_cannot_read_another_institution(
    institution_session: dict, admin_session: dict
) -> None:
    admin_headers = auth_headers(admin_session["access_token"])
    all_institutions = client.get(
        "/api/v1/institutions?page_size=100", headers=admin_headers
    ).json()["items"]
    other = next(item for item in all_institutions if item["name"] != "Axis Institute of Technology")

    response = client.get(
        f"/api/v1/institutions/{other['id']}",
        headers=auth_headers(institution_session["access_token"]),
    )
    assert response.status_code == 404


def test_regional_officer_sees_only_own_region(regional_session: dict) -> None:
    headers = auth_headers(regional_session["access_token"])
    body = client.get("/api/v1/applications?page_size=100", headers=headers).json()
    assert body["total"] > 0
    region_names = {item["region_name"] for item in body["items"]}
    assert region_names == {"Western"}


def test_regional_officer_cannot_read_another_region(regional_session: dict, admin_session: dict) -> None:
    admin_headers = auth_headers(admin_session["access_token"])
    # Oldest first: the seeded cases cover every region, while new test cases are
    # all filed by the Western institution and would fill the newest page.
    applications = client.get(
        "/api/v1/applications?page_size=100&sort=app_no&direction=asc", headers=admin_headers
    ).json()["items"]
    other = next(item for item in applications if item["region_name"] != "Western")

    response = client.get(
        f"/api/v1/applications/{other['id']}",
        headers=auth_headers(regional_session["access_token"]),
    )
    assert response.status_code == 404


def test_regional_officer_cannot_filter_another_region(regional_session: dict) -> None:
    response = client.get(
        "/api/v1/institutions?region_id=00000000-0000-0000-0000-000000000000",
        headers=auth_headers(regional_session["access_token"]),
    )
    assert response.status_code == 403


def test_bureau_sees_all_institutions(bureau_session: dict) -> None:
    response = client.get("/api/v1/institutions?page_size=100", headers=auth_headers(bureau_session["access_token"]))
    assert response.status_code == 200
    assert response.json()["total"] == 60


def test_dashboard_overview_is_scoped(regional_session: dict, admin_session: dict) -> None:
    regional = client.get(
        "/api/v1/dashboard/overview",
        headers=auth_headers(regional_session["access_token"]),
    ).json()
    admin = client.get(
        "/api/v1/dashboard/overview", headers=auth_headers(admin_session["access_token"])
    ).json()

    assert regional["scope_label"] == "Your region"
    assert regional["applications"] < admin["applications"]
    assert regional["applications"] > 0


def test_public_summary_matches_the_database() -> None:
    response = client.get("/api/v1/public/summary")
    assert response.status_code == 200
    body = response.json()

    with SessionLocal() as session:
        applications = session.scalar(select(func.count()).select_from(Application))
        regions = session.scalar(select(func.count()).select_from(Region))
        obligations = session.scalar(select(func.count()).select_from(Obligation))

    assert body["applications_tracked"] == applications
    assert body["regions"] == regions
    assert body["obligations_monitored"] == obligations
    assert body["applications_tracked"] >= 180
