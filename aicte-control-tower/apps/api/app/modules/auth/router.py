from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.models import Institution, Region, User
from app.modules.auth.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])

PORTALS = {
    "institution": "/institution/overview",
    "regional_officer": "/regional/overview",
    "evc_coordinator": "/evc/queue",
    "bureau_officer": "/bureau/overview",
    "admin": "/admin/overview",
}


def user_out(session: Session, user: User) -> UserOut:
    region_name = None
    institution_name = None
    if user.region_id is not None:
        region = session.get(Region, user.region_id)
        region_name = region.name if region else None
    if user.institution_id is not None:
        institution = session.get(Institution, user.institution_id)
        institution_name = institution.name if institution else None
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        portal=PORTALS.get(user.role, "/login"),
        region_id=user.region_id,
        region_name=region_name,
        institution_id=user.institution_id,
        institution_name=institution_name,
    )


@router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> LoginResponse:
    user = session.scalar(
        select(User).where(func.lower(User.email) == payload.email.lower())
    )
    if user is None or not user.active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email or password is incorrect.",
        )
    return LoginResponse(
        access_token=create_access_token(str(user.id), user.role),
        user=user_out(session, user),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout() -> None:
    """Tokens are stateless; the web app clears its session cookie."""
    return None


@router.get("/me", response_model=UserOut)
def me(
    user: User = Depends(get_current_user), session: Session = Depends(get_session)
) -> UserOut:
    return user_out(session, user)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The current password is not correct.",
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Choose a password you have not used for this account.",
        )
    user.password_hash = hash_password(payload.new_password)
    session.add(user)
    session.commit()
