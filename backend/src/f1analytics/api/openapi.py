import copy
import json

from fastapi import FastAPI


def esquema_openapi(app: FastAPI) -> dict:
    """OpenAPI de la app, con la versión fija: así el archivo no cambia en cada commit."""
    esquema = copy.deepcopy(app.openapi())
    esquema["info"]["version"] = "1"
    return esquema


def como_texto(app: FastAPI) -> str:
    return json.dumps(esquema_openapi(app), indent=2, ensure_ascii=False) + "\n"
