"""Configuración del backend, leída de variables de entorno."""

import os

# Render define RENDER_GIT_COMMIT; en otros entornos se puede pasar COMMIT_SHA.
VERSION = os.environ.get("RENDER_GIT_COMMIT") or os.environ.get("COMMIT_SHA") or "local"
