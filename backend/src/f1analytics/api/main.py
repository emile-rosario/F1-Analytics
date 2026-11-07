from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from f1analytics import config
from f1analytics.api.errores import registrar_manejadores
from f1analytics.api.esquemas import ErrorApi, Salud
from f1analytics.api.rutas import analisis, gomas, meta


def crear_app(origenes: list[str], origen_regex: str | None = None) -> FastAPI:
    app = FastAPI(title="F1 Analytics API", version=config.VERSION)

    # Primero gzip y después CORS: así CORS queda por fuera y cubre también lo comprimido.
    app.add_middleware(GZipMiddleware, minimum_size=1_000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origenes,
        allow_origin_regex=origen_regex,
        allow_methods=["GET"],
        allow_headers=["*"],
    )
    registrar_manejadores(app)
    app.include_router(meta.router)
    app.include_router(analisis.router)
    app.include_router(gomas.router)

    @app.get("/api/salud", responses={503: {"model": ErrorApi}})
    def salud() -> Salud:
        """Indica que la API responde y qué versión está desplegada."""
        return Salud(estado="ok", version=config.VERSION)

    return app


app = crear_app(config.ORIGENES_PERMITIDOS, config.ORIGEN_PREVIEW_REGEX)
