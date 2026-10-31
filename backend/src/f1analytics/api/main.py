from fastapi import FastAPI

from f1analytics.config import VERSION

app = FastAPI(title="F1 Analytics API", version=VERSION)


@app.get("/api/salud")
def salud() -> dict[str, str]:
    """Indica que la API responde y qué versión está desplegada."""
    return {"estado": "ok", "version": VERSION}
