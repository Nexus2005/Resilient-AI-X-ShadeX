from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.db import get_session
from app.core.deps import get_current_user
from app.models import User
from sqlalchemy.orm import Session

router = APIRouter(prefix="/me", tags=["me"])

KEYS = ("in_app", "email", "sms", "daily_digest")


class Preferences(BaseModel):
    in_app: bool = True
    email: bool = True
    sms: bool = False
    daily_digest: bool = False


def _read(user: User) -> Preferences:
    stored = user.prefs or {}
    return Preferences(**{key: bool(stored.get(key, Preferences().model_dump()[key])) for key in KEYS})


@router.get("/preferences", response_model=Preferences)
def get_preferences(user: User = Depends(get_current_user)) -> Preferences:
    return _read(user)


@router.patch("/preferences", response_model=Preferences)
def update_preferences(
    payload: Preferences,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> Preferences:
    user.prefs = {**payload.model_dump()}
    session.add(user)
    session.commit()
    return _read(user)
