"""Pruebas contra la API real de OpenF1. No corren en CI: `uv run pytest -m integracion`."""

import pytest

from f1analytics.datos.cargador import Cargador
from f1analytics.datos.cliente import ClienteOpenF1
from f1analytics.datos.telemetria_vuelta import telemetria_de_vuelta, vuelta_rapida

pytestmark = pytest.mark.integracion

LEC, VER = 16, 1
LONGITUD_MONZA_M = 5793
LONGITUD_SAKHIR_M = 5412


@pytest.fixture
def cargador(tmp_path):
    return Cargador(ClienteOpenF1(dir_cache=tmp_path))


def evento(cargador: Cargador, nombre: str) -> int:
    calendario = cargador.calendario(2024)
    return int(calendario[calendario["nombre"] == nombre].iloc[0]["evento"])


def test_monza_2024_clasificacion_leclerc(cargador):
    sesion = cargador.buscar_sesion(2024, evento(cargador, "Italian Grand Prix"), "Qualifying")

    vuelta = vuelta_rapida(cargador, sesion, LEC)
    tel = telemetria_de_vuelta(cargador, sesion, LEC, vuelta)

    assert tel["velocidad"].max() > 320
    assert tel["distancia_m"].iloc[-1] == pytest.approx(LONGITUD_MONZA_M, rel=0.02)


def test_bahrein_2024_clasificacion_verstappen_contra_leclerc(cargador):
    sesion = cargador.buscar_sesion(2024, evento(cargador, "Bahrain Grand Prix"), "Qualifying")

    for piloto in (VER, LEC):
        vuelta = vuelta_rapida(cargador, sesion, piloto)
        tel = telemetria_de_vuelta(cargador, sesion, piloto, vuelta)

        assert len(tel) > 250
        assert tel["distancia_m"].iloc[-1] == pytest.approx(LONGITUD_SAKHIR_M, rel=0.02)


def test_bahrein_2024_carrera_trae_stints_y_paradas(cargador):
    sesion = cargador.buscar_sesion(2024, evento(cargador, "Bahrain Grand Prix"), "Race")

    assert len(cargador.stints(sesion)) > 20
    assert not cargador.paradas(sesion).empty
    assert not cargador.direccion_carrera(sesion).empty
