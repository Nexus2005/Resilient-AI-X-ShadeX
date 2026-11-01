from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.clock import now_utc
from app.core.config import settings
from app.core.db import database_is_reachable

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> JSONResponse:
    database_ok = database_is_reachable()
    payload = {
        "status": "ok" if database_ok else "degraded",
        "service": settings.project_name,
        "database": "ok" if database_ok else "unavailable",
        "demo_mode": settings.demo_mode,
        "time": now_utc().isoformat(),
    }
    return JSONResponse(content=payload, status_code=200 if database_ok else 503)
