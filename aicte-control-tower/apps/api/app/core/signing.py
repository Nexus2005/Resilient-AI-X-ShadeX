"""Short-lived signature tokens for statutory actions (simulated e-sign)."""

from datetime import UTC, datetime, timedelta

import jwt

from app.core.config import settings
from app.core.security import ALGORITHM
from app.models import User

SIGN_PURPOSE = "sign"
SIGN_TTL_SECONDS = 300


def create_sign_token(user: User) -> tuple[str, int]:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user.id),
        "purpose": SIGN_PURPOSE,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=SIGN_TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM), SIGN_TTL_SECONDS


def verify_sign_token(token: str, user_id: str) -> bool:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return False
    return payload.get("purpose") == SIGN_PURPOSE and payload.get("sub") == user_id
