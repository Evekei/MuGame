from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.account import router as account_router
from app.api.health import router as health_router
from app.api.import_matching import router as import_matching_router
from app.api.imports import router as imports_router
from app.api.temp_playlist import router as temp_playlist_router
from app.core.config import get_settings
from app.core.errors import install_error_handlers


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.version)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    install_error_handlers(app)
    app.include_router(account_router)
    app.include_router(health_router)
    app.include_router(imports_router)
    app.include_router(import_matching_router)
    app.include_router(temp_playlist_router)
    return app


app = create_app()
