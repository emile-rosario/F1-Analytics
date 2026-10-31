"""Fixtures compartidos: un OpenF1 falso que sirve respuestas reales guardadas en disco."""

import json
from datetime import UTC, datetime
from pathlib import Path

import httpx
import pandas as pd
import pytest
import respx
from fastapi.testclient import TestClient

from f1analytics.api.dependencias import obtener_cargador
from f1analytics.api.main import crear_app
from f1analytics.datos.cargador import Cargador
from f1analytics.datos.cliente import ClienteOpenF1

CARPETA = Path(__file__).parent / "fixtures" / "openf1"
BASE = "https://api.openf1.org/v1"
ENDPOINTS = [
    "meetings",
    "sessions",
    "drivers",
    "laps",
    "stints",
    "pit",
    "race_control",
    "car_data",
    "location",
]

# Monza 2024
CLASIFICACION = 9586
CARRERA = 9590
EVENTO_MONZA = 1244
LEC, VER = 16, 1


def _coincide(fila: dict, clave: str, valor: str) -> bool:
    """Aplica un filtro de OpenF1: igualdad, o ``date>`` / ``date<`` para rangos de fecha."""
    if clave in ("date>", "date<", "date>=", "date<="):
        fecha, limite = pd.Timestamp(fila["date"]), pd.Timestamp(valor)
        return {
            "date>": fecha > limite,
            "date<": fecha < limite,
            "date>=": fecha >= limite,
            "date<=": fecha <= limite,
        }[clave]
    return str(fila.get(clave)) == valor


class OpenF1Falso:
    """Responde como OpenF1: filtra las filas guardadas y da 404 si no queda ninguna."""

    def __init__(self, router: respx.MockRouter):
        self.datos: dict[str, list[dict]] = {
            endpoint: json.loads((CARPETA / f"{endpoint}.json").read_text(encoding="utf-8"))
            for endpoint in ENDPOINTS
        }
        self.pedidos: list[httpx.URL] = []
        for endpoint in ENDPOINTS:
            router.get(f"{BASE}/{endpoint}").mock(side_effect=self._responder(endpoint))

    def _responder(self, endpoint: str):
        def responder(peticion: httpx.Request) -> httpx.Response:
            self.pedidos.append(peticion.url)
            filas = self.datos[endpoint]
            for clave, valor in peticion.url.params.multi_items():
                filas = [f for f in filas if _coincide(f, clave, valor)]
            if not filas:
                return httpx.Response(404, json={"detail": "No results found."})
            return httpx.Response(200, json=filas)

        return responder


@pytest.fixture
def openf1():
    with respx.mock(assert_all_called=False) as router:
        yield OpenF1Falso(router)


def crear_cargador(directorio: Path, ahora: datetime) -> Cargador:
    cliente = ClienteOpenF1(dir_cache=directorio, dormir=lambda _: None)
    return Cargador(cliente, ahora=lambda: ahora)


@pytest.fixture
def cargador(openf1, tmp_path):
    """Cargador con el reloj en 2026: todas las sesiones de 2024 están terminadas."""
    return crear_cargador(tmp_path, datetime(2026, 1, 1, tzinfo=UTC))


def crear_cliente(cargador: Cargador) -> TestClient:
    """Cliente de la API que usa el cargador indicado en vez del real."""
    app = crear_app(["http://localhost:3000"])
    app.dependency_overrides[obtener_cargador] = lambda: cargador
    return TestClient(app)


@pytest.fixture
def cliente(cargador):
    """Cliente de la API conectado al OpenF1 falso de los fixtures de Monza 2024."""
    return crear_cliente(cargador)
