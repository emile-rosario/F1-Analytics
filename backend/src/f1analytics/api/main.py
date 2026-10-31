from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from f1analytics import config


def crear_app(origenes: list[str], origen_regex: str | None = None) -> FastAPI:
    app = FastAPI(title="F1 Analytics API", version=config.VERSION)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=origenes,
        allow_origin_regex=origen_regex,
        allow_methods=["GET"],
        allow_headers=["*"],
    )

    @app.get("/api/salud")
    def salud() -> dict[str, str]:
        """Indica que la API responde y qué versión está desplegada."""
        return {"estado": "ok", "version": config.VERSION}

    return app


app = crear_app(config.ORIGENES_PERMITIDOS, config.ORIGEN_PREVIEW_REGEX)
