import uuid
from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.db import get_session
from app.core.security import decode_access_token
from app.models import User

ROLES = ("institution", "regional_officer", "evc_coordinator", "bureau_officer", "admin")
HQ_ROLES = ("bureau_officer", "admin")
REGION_ROLES = ("regional_officer", "evc_coordinator")

_bearer = HTTPBearer(auto_error=False)

CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Sign in to continue.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    session: Session = Depends(get_session),
) -> User:
    if credentials is None:
        raise CREDENTIALS_ERROR
    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise CREDENTIALS_ERROR
    try:
        user_id = uuid.UUID(payload["sub"])
    except ValueError:
        raise CREDENTIALS_ERROR
    user = session.get(User, user_id)
    if user is None or not user.active:
        raise CREDENTIALS_ERROR
    return user


def require_roles(*roles: str) -> Callable[..., User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this resource.",
            )
        return user

    return dependency


def forbid() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this resource.",
    )
