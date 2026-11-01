"""CODEMIND AI backend. Run from the backend folder:  python -m uvicorn app.main:app --reload --port 8000"""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings, load_settings
from .db import Database
from .ai.providers import LLMProvider
from .ai.service import AIService
from .errors import ApiError
from .intelligence.parse_manager import ParseManager
from .intelligence.queries import IntelligenceQueries
from .queries import Queries
from .repo_service import RepositoryService
from .routers import ai as ai_router
from .routers import intelligence, repositories, views as views_router
from .scan_manager import ScanManager


def create_app(settings: Settings | None = None, ai_provider: LLMProvider | None = None) -> FastAPI:
    settings = settings or load_settings()
    db = Database(settings.db_path)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db.init()
        app.state.settings = settings
        app.state.db = db
        app.state.repos = RepositoryService(db)
        app.state.queries = Queries(db)
        app.state.scans = ScanManager(settings, db, app.state.repos)
        app.state.scans.recover_interrupted()
        app.state.intel = IntelligenceQueries(db)
        app.state.parser = ParseManager(settings, db, app.state.repos)
        app.state.parser.recover_interrupted()
        app.state.ai = AIService(settings, db, app.state.repos, app.state.queries, app.state.intel, provider=ai_provider)
        yield
        app.state.scans.shutdown()
        app.state.parser.shutdown()

    app = FastAPI(title="CODEMIND AI", version="0.2.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Content-Type"],
    )

    @app.exception_handler(ApiError)
    async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse({"detail": {"code": exc.code, "message": exc.message, **exc.extra}}, status_code=exc.status)

    app.include_router(repositories.router)
    app.include_router(intelligence.router)
    app.include_router(ai_router.router)
    app.include_router(views_router.router)
    return app


app = create_app()
