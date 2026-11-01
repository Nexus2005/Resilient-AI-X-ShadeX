from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.modules.applications.actions import router as workflow_router
from app.modules.applications.router import router as applications_router
from app.modules.audit.router import router as audit_router
from app.modules.auth.router import router as auth_router
from app.modules.dashboard.router import router as dashboard_router
from app.modules.demo.router import router as demo_router
from app.modules.documents.router import router as documents_router
from app.modules.escalations.router import router as escalations_router
from app.modules.evc.router import router as evc_router
from app.modules.health.router import router as health_router
from app.modules.institutions.router import router as institutions_router
from app.modules.me.router import router as me_router
from app.modules.notifications.router import router as notifications_router
from app.modules.obligations.router import router as obligations_router
from app.modules.public.router import router as public_router


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.project_name,
        version="0.2.0",
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url=f"{settings.api_v1_prefix}/docs",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.web_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for router in (
        health_router,
        auth_router,
        me_router,
        institutions_router,
        applications_router,
        workflow_router,
        documents_router,
        evc_router,
        obligations_router,
        dashboard_router,
        notifications_router,
        escalations_router,
        audit_router,
        demo_router,
        public_router,
    ):
        app.include_router(router, prefix=settings.api_v1_prefix)

    @app.get("/", include_in_schema=False)
    def root() -> dict[str, str]:
        return {"service": settings.project_name, "docs": f"{settings.api_v1_prefix}/docs"}

    return app


app = create_app()
