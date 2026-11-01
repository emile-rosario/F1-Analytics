"""Guarda el OpenAPI de la API en backend/openapi.json.

Uso (desde backend/):  uv run python scripts/exportar_openapi.py

De ese archivo el frontend genera sus tipos TypeScript (`npm run tipos`). Hay que volver a
correrlo cada vez que cambian las rutas o los modelos; un test falla si se olvida.
"""

from pathlib import Path

from f1analytics.api.main import app
from f1analytics.api.openapi import como_texto

DESTINO = Path(__file__).resolve().parents[1] / "openapi.json"

if __name__ == "__main__":
    DESTINO.write_text(como_texto(app), encoding="utf-8", newline="\n")
    print(f"OpenAPI guardado en {DESTINO}")
