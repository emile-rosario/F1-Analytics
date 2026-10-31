"""Configuración del backend, leída de variables de entorno."""

import os

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
