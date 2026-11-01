import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import REGION_ROLES, get_current_user
from app.models import Institution, Region, User

router = APIRouter(prefix="/institutions", tags=["institutions"])


class InstitutionOut(BaseModel):
    id: uuid.UUID
    pid: str
    name: str
    state: str
    district: str
    region_id: uuid.UUID
    region_name: str
    type: str
    status: str
    lat: float
    lng: float


class InstitutionPage(BaseModel):
    items: list[InstitutionOut]
    total: int
    page: int
    page_size: int


def scope_conditions(user: User):
    if user.role == "institution":
        return [Institution.id == user.institution_id]
    if user.role in REGION_ROLES:
        return [Institution.region_id == user.region_id]
    return []


def institution_out(institution: Institution, region_name: str) -> InstitutionOut:
    return InstitutionOut(
        id=institution.id,
        pid=institution.pid,
        name=institution.name,
        state=institution.state,
        district=institution.district,
        region_id=institution.region_id,
        region_name=region_name,
        type=institution.type,
        status=institution.status,
        lat=institution.lat,
        lng=institution.lng,
    )


@router.get("", response_model=InstitutionPage)
def list_institutions(
    search: str | None = None,
    state: str | None = None,
    region_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> InstitutionPage:
    conditions = scope_conditions(user)
    if search:
        term = f"%{search.lower()}%"
        conditions.append(
            or_(
                func.lower(Institution.name).like(term),
                func.lower(Institution.pid).like(term),
                func.lower(Institution.district).like(term),
            )
        )
    if state:
        conditions.append(Institution.state == state)
    if region_id is not None:
        if user.role not in ("bureau_officer", "admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You cannot filter by another region.",
            )
        conditions.append(Institution.region_id == region_id)

    total = session.scalar(
        select(func.count()).select_from(Institution).where(*conditions)
    )
    rows = session.execute(
        select(Institution, Region.name)
        .join(Region, Region.id == Institution.region_id)
        .where(*conditions)
        .order_by(Institution.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return InstitutionPage(
        items=[institution_out(institution, region_name) for institution, region_name in rows],
        total=total or 0,
        page=page,
        page_size=page_size,
    )


@router.get("/{institution_id}", response_model=InstitutionOut)
def get_institution(
    institution_id: uuid.UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> InstitutionOut:
    row = session.execute(
        select(Institution, Region.name)
        .join(Region, Region.id == Institution.region_id)
        .where(Institution.id == institution_id, *scope_conditions(user))
    ).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Institution not found.")
    institution, region_name = row
    return institution_out(institution, region_name)
