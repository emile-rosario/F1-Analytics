import matplotlib

matplotlib.use("Agg")  # sin ventanas: los tests corren en CI

import matplotlib.pyplot as plt  # noqa: E402
import pandas as pd  # noqa: E402
import pytest  # noqa: E402
from conftest import CLASIFICACION, LEC  # noqa: E402

from f1analytics.analisis.circuito import (  # noqa: E402
    orientar_circuito,
    posicion_curvas,
    zonas_frenado,
)
from f1analytics.datos.circuitos import circuito  # noqa: E402
from f1analytics.datos.telemetria_vuelta import telemetria_de_vuelta  # noqa: E402
from f1analytics.graficos.circuito import mapa_marchas, mapa_velocidad  # noqa: E402
from f1analytics.graficos.estilo import colores_marcha  # noqa: E402


@pytest.fixture(autouse=True)
def cerrar_figuras():
    yield
    plt.close("all")


@pytest.fixture
def monza(cargador):
    """Telemetría de Monza ya girada, con las curvas y las zonas de frenado."""
    tel = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)
    trazado = circuito(39, 2024)
    tel = orientar_circuito(tel, trazado.rotacion)
    curvas = posicion_curvas(trazado.curvas, trazado.rotacion)
    return tel, curvas, zonas_frenado(tel, curvas)


def textos(fig) -> list[str]:
    return [t.get_text() for t in fig.axes[0].texts]


def test_mapa_de_velocidad_dibuja_la_pista_con_curvas_y_barra_de_color(monza):
    tel, curvas, zonas = monza

    fig = mapa_velocidad(tel, curvas, zonas, titulo="Monza")

    assert len(fig.axes) == 2  # el mapa y la barra de km/h
    assert fig.axes[0].get_title(loc="left") == "Monza"
    assert sorted(textos(fig), key=int) == [str(n) for n in range(1, 12)]
    assert fig.axes[1].get_ylabel() == "km/h"


def test_mapa_de_velocidad_pinta_cada_tramo_con_su_velocidad(monza):
    tel, curvas, zonas = monza

    linea = mapa_velocidad(tel, curvas, zonas).axes[0].collections[0]

    assert linea.get_array().max() == tel["velocidad"].max()
    assert linea.get_array().min() == tel["velocidad"].min()


def test_mapa_de_velocidad_sin_curvas_ni_zonas_funciona(monza):
    tel, _, _ = monza

    fig = mapa_velocidad(tel)

    assert textos(fig) == []
    assert fig.axes[0].get_legend() is None


def test_mapa_de_velocidad_marca_las_frenadas_en_la_leyenda(monza):
    tel, curvas, zonas = monza

    leyenda = mapa_velocidad(tel, curvas, zonas).axes[0].get_legend()

    assert [t.get_text() for t in leyenda.get_texts()] == ["Inicio de frenada"]


def test_mapa_de_marchas_lista_solo_las_marchas_que_se_usaron(monza):
    tel, curvas, zonas = monza

    leyenda = mapa_marchas(tel, curvas, zonas).axes[0].get_legend()

    usadas = [f"Marcha {m}" for m in sorted(tel["marcha"].unique())]
    assert [t.get_text() for t in leyenda.get_texts()] == [*usadas, "Inicio de frenada"]


def test_el_mapa_se_puede_dibujar_en_un_eje_existente(monza):
    tel, curvas, _ = monza
    fig, ejes = plt.subplots(1, 2)

    resultado = mapa_marchas(tel, curvas, ax=ejes[1])

    assert resultado is fig
    assert len(ejes[1].collections) == 1
    assert len(ejes[0].collections) == 0


def test_la_pista_se_cierra_cuando_la_vuelta_empieza_y_termina_junto():
    tel = pd.DataFrame(
        {"x": [0.0, 1000, 1000, 0], "y": [0.0, 0, 1000, 900], "velocidad": [100, 200, 300, 200]}
    )

    linea = mapa_velocidad(tel).axes[0].collections[0]

    assert len(linea.get_segments()) == 4  # 3 tramos y el cierre hasta la meta


def test_los_puntos_repetidos_no_generan_tramos():
    tel = pd.DataFrame(
        {"x": [0.0, 0, 1000, 5000], "y": [0.0, 0, 0, 5000], "velocidad": [100, 150, 200, 250]}
    )

    linea = mapa_velocidad(tel).axes[0].collections[0]

    assert len(linea.get_segments()) == 2


def test_los_colores_de_marcha_son_ocho_y_distintos():
    colores = colores_marcha()

    assert list(colores) == list(range(1, 9))
    assert len(set(colores.values())) == 8
