import json
from pathlib import Path

import pytest
from conftest import crear_cliente

from f1analytics.api.main import app
from f1analytics.api.openapi import como_texto
from f1analytics.datos.errores import ErrorDatos, ErrorOpenF1


class CargadorRoto:
    """Un cargador que siempre falla con el error indicado."""

    def __init__(self, error: Exception):
        self._error = error

    def calendario(self, anio):
        raise self._error


@pytest.mark.parametrize(
    ("error", "estado"),
    [
        (ErrorDatos("parametro_invalido"), 422),
        (ErrorDatos("analisis_no_disponible"), 422),
        (ErrorDatos("telemetria_incompleta"), 422),
        (ErrorDatos("sesion_no_encontrada"), 404),
        (ErrorDatos("piloto_no_encontrado"), 404),
        (ErrorDatos("sin_telemetria"), 404),
        (ErrorDatos("sesion_no_terminada"), 409),
        (ErrorOpenF1("limite_peticiones"), 429),
        (ErrorOpenF1("fallo_openf1"), 503),
        (ErrorOpenF1("openf1_en_vivo"), 503),
    ],
)
def test_cada_codigo_de_error_tiene_su_estado_http(error, estado):
    cliente = crear_cliente(CargadorRoto(error))

    respuesta = cliente.get("/api/calendario/2024")

    assert respuesta.status_code == estado
    assert respuesta.json() == {"codigo": error.codigo}


def test_fallo_openf1_no_usa_502_porque_el_frontend_lo_reintenta_como_servidor_dormido():
    cliente = crear_cliente(CargadorRoto(ErrorOpenF1("fallo_openf1")))

    assert cliente.get("/api/calendario/2024").status_code != 502


def test_openapi_json_esta_al_dia():
    """Si falla: `uv run python scripts/exportar_openapi.py` y `npm run tipos` en el frontend."""
    archivo = Path(__file__).resolve().parents[2] / "openapi.json"

    assert archivo.read_text(encoding="utf-8") == como_texto(app)


def test_los_errores_del_openapi_usan_el_modelo_con_codigo():
    esquema = json.loads(como_texto(app))
    respuestas = esquema["paths"]["/api/calendario/{anio}"]["get"]["responses"]

    for estado in ("404", "422", "429", "503"):
        referencia = respuestas[estado]["content"]["application/json"]["schema"]["$ref"]
        assert referencia.endswith("/ErrorApi")
