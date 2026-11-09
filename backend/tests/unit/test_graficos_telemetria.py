import matplotlib

matplotlib.use("Agg")  # sin ventanas: los tests corren en CI

import matplotlib.pyplot as plt  # noqa: E402
import pytest  # noqa: E402
from conftest import CLASIFICACION, LEC, VER  # noqa: E402
from matplotlib.collections import LineCollection  # noqa: E402
from matplotlib.colors import to_hex  # noqa: E402

from f1analytics.analisis.circuito import posicion_curvas  # noqa: E402
from f1analytics.analisis.telemetria import (  # noqa: E402
    alinear_vueltas,
    delta_tiempo,
    ganador_por_minisector,
)
from f1analytics.datos.circuitos import circuito  # noqa: E402
from f1analytics.datos.telemetria_vuelta import telemetria_de_vuelta  # noqa: E402
from f1analytics.graficos.estilo import COLORES_PILOTOS  # noqa: E402
from f1analytics.graficos.telemetria import mapa_minisectores, trazas  # noqa: E402


@pytest.fixture(autouse=True)
def cerrar_figuras():
    yield
    plt.close("all")


@pytest.fixture
def comparacion(cargador):
    lec = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)
    ver = telemetria_de_vuelta(cargador, CLASIFICACION, VER, 11)
    alineadas = alinear_vueltas(lec, ver)
    delta = delta_tiempo(alineadas, 79.461, 79.662)
    return alineadas, delta, ganador_por_minisector(alineadas, delta)


def test_las_trazas_apilan_cuatro_paneles_con_la_distancia_compartida(comparacion):
    alineadas, delta, _ = comparacion

    fig = trazas(alineadas, delta, nombre_a="LEC", nombre_b="VER")

    assert len(fig.axes) == 4
    assert fig.axes[0].get_shared_x_axes().joined(fig.axes[0], fig.axes[3])
    assert fig.axes[3].get_xlabel() == "Distancia desde la meta (m)"


def test_cada_panel_dibuja_a_los_dos_pilotos_con_su_color(comparacion):
    alineadas, delta, _ = comparacion

    fig = trazas(alineadas, delta, nombre_a="LEC", nombre_b="VER")

    for panel in fig.axes[:3]:
        colores = [to_hex(linea.get_color()) for linea in panel.get_lines()]
        assert colores == [COLORES_PILOTOS["a"].lower(), COLORES_PILOTOS["b"].lower()]
    leyenda = [t.get_text() for t in fig.axes[0].get_legend().get_texts()]
    assert leyenda == ["LEC", "VER"]


def test_el_panel_del_delta_termina_en_la_diferencia_de_tiempo(comparacion):
    alineadas, delta, _ = comparacion

    fig = trazas(alineadas, delta, nombre_a="LEC", nombre_b="VER", titulo="Monza")

    ys = fig.axes[3].get_lines()[-1].get_ydata()
    assert ys[-1] == pytest.approx(0.201)
    assert "LEC" in fig.axes[3].get_ylabel()
    assert fig.texts[0].get_text() == "Monza"


def test_el_mapa_pinta_cada_tramo_del_color_de_quien_gano_el_minisector(comparacion):
    alineadas, _, ganadores = comparacion

    fig = mapa_minisectores(alineadas, ganadores, nombre_a="LEC", nombre_b="VER")

    linea = next(c for c in fig.axes[0].collections if isinstance(c, LineCollection))
    usados = {to_hex(c) for c in linea.get_colors()}
    esperados = {COLORES_PILOTOS[g].lower() for g in ganadores["ganador"]}
    assert usados == esperados


def test_la_leyenda_del_mapa_cuenta_los_minisectores_de_cada_piloto(comparacion):
    alineadas, _, ganadores = comparacion
    cuenta = ganadores["ganador"].value_counts()

    fig = mapa_minisectores(alineadas, ganadores, nombre_a="LEC", nombre_b="VER")

    textos = [t.get_text() for t in fig.axes[0].get_legend().get_texts()]
    assert textos[0] == f"LEC ({cuenta.get('a', 0)})"
    assert textos[1] == f"VER ({cuenta.get('b', 0)})"


def test_el_mapa_marca_el_empate_solo_si_lo_hubo(cargador):
    lec = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)
    alineadas = alinear_vueltas(lec, lec)
    ganadores = ganador_por_minisector(alineadas, delta_tiempo(alineadas))

    fig = mapa_minisectores(alineadas, ganadores, nombre_a="LEC", nombre_b="LEC")

    textos = [t.get_text() for t in fig.axes[0].get_legend().get_texts()]
    assert textos[-1] == "Empate (25)"


def test_el_mapa_dibuja_las_curvas_si_se_las_dan(comparacion):
    alineadas, _, ganadores = comparacion
    # Sin girar: la telemetría de las comparaciones tampoco va girada.
    curvas = posicion_curvas(circuito(39, 2024).curvas)

    sin = mapa_minisectores(alineadas, ganadores, nombre_a="LEC", nombre_b="VER")
    con = mapa_minisectores(alineadas, ganadores, nombre_a="LEC", nombre_b="VER", curvas=curvas)

    assert len(con.axes[0].texts) == len(curvas)
    assert len(sin.axes[0].texts) == 0
