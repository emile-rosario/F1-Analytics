"""La API completa contra OpenF1 real. No corre en CI: `uv run pytest -m integracion`.

Falla con `openf1_en_vivo` mientras hay una sesión de F1 en vivo: OpenF1 bloquea entonces todo
acceso sin clave, también al histórico. Se vuelve a correr cuando la sesión termine.
"""

import pytest
from fastapi.testclient import TestClient

from f1analytics.api.dependencias import obtener_cargador
from f1analytics.api.main import crear_app
from f1analytics.datos.cargador import Cargador
from f1analytics.datos.cliente import ClienteOpenF1

pytestmark = pytest.mark.integracion


@pytest.fixture
def cliente(tmp_path):
    app = crear_app(["http://localhost:3000"])
    app.dependency_overrides[obtener_cargador] = lambda: Cargador(ClienteOpenF1(dir_cache=tmp_path))
    return TestClient(app)


def test_del_calendario_a_los_pilotos_de_una_sesion_real(cliente):
    calendario = cliente.get("/api/calendario/2024").json()
    assert len(calendario) == 24
    monza = next(e for e in calendario if e["circuito"] == "Monza")

    sesiones = cliente.get(f"/api/sesiones/2024/{monza['evento']}").json()
    clasificacion = next(s for s in sesiones if s["nombre"] == "Qualifying")
    assert clasificacion["terminada"]

    pilotos = cliente.get(f"/api/sesiones/{clasificacion['sesion']}/pilotos").json()
    assert len(pilotos) == 20
    assert {"VER", "LEC"} <= {p["codigo"] for p in pilotos}


def test_analisis_del_circuito_de_la_pole_de_monza(cliente):
    sesion = 9586  # clasificación de Monza 2024
    pilotos = cliente.get(f"/api/sesiones/{sesion}/pilotos").json()
    norris = next(p for p in pilotos if p["codigo"] == "NOR")

    respuesta = cliente.get(
        "/api/analisis/circuito", params={"sesion": sesion, "piloto": norris["numero"]}
    )

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["tiempo_vuelta_s"] == 79.327  # la pole: 1:19.327
    assert len(datos["curvas"]) == 11
    assert datos["resumen"]["frenada_mas_fuerte"]["curva"] == 1
    assert 340 <= datos["resumen"]["vel_maxima"]["kmh"] <= 355
