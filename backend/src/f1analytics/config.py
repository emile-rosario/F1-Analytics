"""Configuración del backend, leída de variables de entorno."""

import os
from pathlib import Path

# Render define RENDER_GIT_COMMIT; en otros entornos se puede pasar COMMIT_SHA.
VERSION = os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("COMMIT_SHA") or "local"

# Orígenes del frontend con permiso CORS, separados por comas.
ORIGENES_PERMITIDOS = [
    origen.strip()
    for origen in os.environ.get("ORIGENES_PERMITIDOS", "http://localhost:3000").split(",")
    if origen.strip()
]

# Expresión regular para las URLs de preview de Vercel, que cambian en cada PR.
ORIGEN_PREVIEW_REGEX = os.environ.get("ORIGEN_PREVIEW_REGEX") or None

URL_OPENF1 = os.environ.get("URL_OPENF1", "https://api.openf1.org/v1")

# Caché en disco de las respuestas de OpenF1 (parquet). En Render se borra al dormirse.
DIR_CACHE = Path(os.environ.get("DIR_CACHE") or Path(__file__).resolve().parents[2] / ".cache")

# Tope de la caché en memoria, en bytes (~100 MB).
MAX_BYTES_CACHE_MEMORIA = 100 * 1024 * 1024
