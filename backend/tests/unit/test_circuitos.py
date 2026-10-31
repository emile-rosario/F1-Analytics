import numpy as np
import pytest
from conftest import CLASIFICACION, LEC

from f1analytics.datos.circuitos import circuito, claves_disponibles
from f1analytics.datos.errores import ErrorDatos
from f1analytics.datos.telemetria_vuelta import telemetria_de_vuelta

MONZA, IMOLA, SHANGHAI = 39, 6, 49
# Circuitos nuevos de 2026 que MultiViewer todavía no tiene.
KUALA_LUMPUR, MADRING = 12, 153


def test_hay_datos_de_24_circuitos():
    assert len(claves_disponibles()) == 24
    assert MONZA in claves_disponibles()


def test_monza_tiene_sus_11_curvas_y_la_rotacion_de_la_transmision():
    monza = circuito(MONZA, 2024)

    assert monza.nombre == "Monza"
    assert [c.numero for c in monza.curvas] == list(range(1, 12))
    assert monza.rotacion == 95
    assert monza.longitud_m == pytest.approx(5793, rel=0.01)  # longitud oficial


def test_un_circuito_que_no_esta_lanza_analisis_no_disponible():
    for clave in (KUALA_LUMPUR, MADRING):
        with pytest.raises(ErrorDatos) as error:
            circuito(clave, 2026)

        assert error.value.codigo == "analisis_no_disponible"


def test_un_anio_sin_datos_usa_el_trazado_mas_cercano():
    # Imola solo tiene 2023-2025 y Shanghái 2024-2026.
    assert 2025 in circuito(IMOLA, 2026).anios
    assert 2024 in circuito(SHANGHAI, 2023).anios


def test_las_curvas_de_todos_los_circuitos_estan_numeradas_sin_huecos():
    for clave in claves_disponibles():
        trazado = circuito(clave, 2025)

        numeros = sorted({c.numero for c in trazado.curvas})
        assert numeros == list(range(1, len(numeros) + 1)), trazado.nombre
        identificadores = [(c.numero, c.letra) for c in trazado.curvas]
        assert len(identificadores) == len(set(identificadores)), trazado.nombre


def test_hungaroring_distingue_la_curva_1_de_la_1a():
    hungaroring = circuito(4, 2024)

    curvas = {(c.numero, c.letra) for c in hungaroring.curvas}
    assert {(1, ""), (1, "A"), (12, ""), (12, "A")} <= curvas


def test_todos_los_circuitos_tienen_largo_y_curvas_razonables():
    for clave in claves_disponibles():
        trazado = circuito(clave, 2025)

        assert 3000 < trazado.longitud_m < 8000, trazado.nombre
        assert len(trazado.curvas) >= 10, trazado.nombre
        assert 0 <= trazado.rotacion < 360, trazado.nombre


def test_las_curvas_de_multiviewer_caen_sobre_la_telemetria_real_de_openf1(cargador):
    """Comprueba que ambas fuentes usan el mismo sistema de coordenadas."""
    monza = circuito(MONZA, 2024)
    tel = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)

    for curva in monza.curvas:
        # Las coordenadas están en décimas de metro.
        distancias = np.hypot(tel["x"] - curva.x, tel["y"] - curva.y) / 10
        mas_cercana = int(distancias.idxmin())

        assert distancias[mas_cercana] < 20, f"curva {curva.numero}"
        # La distancia integrada de la telemetría es algo menor que la oficial.
        assert abs(tel["distancia_m"][mas_cercana] - curva.distancia_m) < 80, (
            f"curva {curva.numero}"
        )
