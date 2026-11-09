import matplotlib

matplotlib.use("Agg")  # sin ventanas: los tests corren en CI

import matplotlib.pyplot as plt  # noqa: E402
import pytest  # noqa: E402
from conftest import CARRERA_ESPANA  # noqa: E402

from f1analytics.analisis.gomas import comparar_compuestos, degradacion_por_stint  # noqa: E402
from f1analytics.datos.limpieza import (  # noqa: E402
    agregar_correccion_combustible,
    agregar_edad_goma,
    estado_pista_por_vuelta,
    limpiar_vueltas_carrera,
)
from f1analytics.graficos.gomas import (  # noqa: E402
    degradacion_compuestos,
    dispersion_edad,
    estrategias,
)


@pytest.fixture(autouse=True)
def cerrar_figuras():
    yield
    plt.close("all")


@pytest.fixture
def espana(cargador):
    vueltas = cargador.vueltas(CARRERA_ESPANA)
    estado = estado_pista_por_vuelta(cargador.direccion_carrera(CARRERA_ESPANA), 66)
    limpias = limpiar_vueltas_carrera(vueltas, cargador.paradas(CARRERA_ESPANA), estado)
    stints = cargador.stints(CARRERA_ESPANA)
    con_edad = agregar_correccion_combustible(agregar_edad_goma(limpias, stints))
    return {
        "vueltas": con_edad,
        "stints": stints,
        "resultado": cargador.resultado(CARRERA_ESPANA),
        "pilotos": cargador.pilotos(CARRERA_ESPANA),
        "degradacion": degradacion_por_stint(con_edad),
    }


def etiquetas_y(fig) -> list[str]:
    return [t.get_text() for t in fig.axes[0].get_yticklabels()]


def textos(fig) -> list[str]:
    return [t.get_text() for t in fig.axes[0].texts]


# --- estrategias ---------------------------------------------------------------------


def test_estrategias_tiene_una_fila_por_piloto_ordenada_por_posicion_final(espana):
    fig = estrategias(espana["stints"], espana["resultado"], espana["pilotos"], titulo="España")

    etiquetas = etiquetas_y(fig)
    assert len(etiquetas) == 20
    assert etiquetas[:3] == ["VER", "NOR", "HAM"]  # el podio de España 2024
    assert fig.axes[0].get_title(loc="left") == "España"


def test_estrategias_dibuja_una_barra_por_stint_con_su_letra_y_vueltas(espana):
    fig = estrategias(espana["stints"], espana["resultado"], espana["pilotos"])

    assert len(fig.axes[0].patches) >= len(espana["stints"])  # las barras (más la leyenda aparte)
    verstappen = [t for t in textos(fig)][:3]
    assert verstappen == ["B 17", "M 27", "B 22"]  # blanda 17, media 27, blanda 22


def test_estrategias_el_que_abandona_lleva_una_cruz(cargador):
    resultado = cargador.resultado(9590)  # Monza: hubo un abandono
    stints = cargador.stints(9590)
    pilotos = cargador.pilotos(9590)

    fig = estrategias(stints, resultado, pilotos)

    assert "✕" in textos(fig)


def test_estrategias_la_leyenda_nombra_los_compuestos_usados(espana):
    fig = estrategias(espana["stints"], espana["resultado"], espana["pilotos"])

    nombres = [t.get_text() for t in fig.axes[0].get_legend().get_texts()]
    assert nombres == ["Blanda", "Media", "Dura"]


# --- dispersion_edad -----------------------------------------------------------------


def test_dispersion_dibuja_los_puntos_y_una_recta_por_stint(espana):
    fig = dispersion_edad(espana["vueltas"], espana["degradacion"], [1])

    ax = fig.axes[0]
    assert len(ax.lines) == 3  # los 3 stints de Verstappen
    puntos = sum(len(c.get_offsets()) for c in ax.collections)
    assert puntos == len(espana["vueltas"][espana["vueltas"]["piloto"] == 1])


def test_dispersion_con_tres_pilotos_dibuja_un_panel_por_piloto_titulado_con_su_codigo(espana):
    codigos = espana["pilotos"].set_index("numero")["codigo"]

    fig = dispersion_edad(espana["vueltas"], espana["degradacion"], [1, 4, 16], codigos)

    assert [ax.get_title(loc="left") for ax in fig.axes] == ["VER", "NOR", "LEC"]


def test_dispersion_cada_panel_dibuja_solo_los_puntos_y_rectas_de_su_piloto(espana):
    fig = dispersion_edad(espana["vueltas"], espana["degradacion"], [1, 4, 16])

    for ax, piloto in zip(fig.axes, [1, 4, 16], strict=True):
        propias = espana["vueltas"][
            (espana["vueltas"]["piloto"] == piloto) & espana["vueltas"]["edad_goma"].notna()
        ]
        assert sum(len(c.get_offsets()) for c in ax.collections) == len(propias)
        rectas = espana["degradacion"][
            (espana["degradacion"]["piloto"] == piloto) & ~espana["degradacion"]["insuficiente"]
        ]
        assert len(ax.lines) == len(rectas)


def test_dispersion_los_paneles_comparten_la_escala_de_los_ejes(espana):
    fig = dispersion_edad(espana["vueltas"], espana["degradacion"], [1, 4, 16])

    primero = fig.axes[0]
    for ax in fig.axes[1:]:
        assert ax.get_shared_x_axes().joined(primero, ax)
        assert ax.get_shared_y_axes().joined(primero, ax)
        assert ax.get_ylim() == primero.get_ylim()
    # El título del eje x va una sola vez, en el panel de abajo.
    assert [ax.get_xlabel() for ax in fig.axes[:-1]] == ["", ""]
    assert fig.axes[-1].get_xlabel() == "Edad de la goma (vueltas)"


def test_dispersion_la_leyenda_nombra_los_compuestos_usados(espana):
    fig = dispersion_edad(espana["vueltas"], espana["degradacion"], [1, 4, 16])

    nombres = [t.get_text() for t in fig.legends[0].get_texts()]
    assert nombres == ["Blanda", "Media"]


def test_dispersion_con_un_solo_piloto_no_pone_titulo_de_piloto(espana):
    fig = dispersion_edad(espana["vueltas"], espana["degradacion"], [1], titulo="España")

    assert len(fig.axes) == 1
    assert fig.axes[0].get_title(loc="left") == ""
    assert fig.get_suptitle() == "España"


def test_dispersion_acepta_de_uno_a_tres_pilotos(espana):
    for pilotos in ([], [1, 4, 16, 44]):
        with pytest.raises(ValueError, match="de 1 a 3"):
            dispersion_edad(espana["vueltas"], espana["degradacion"], pilotos)


def test_dispersion_etiqueta_el_eje_segun_la_columna(espana):
    corregido = dispersion_edad(espana["vueltas"], espana["degradacion"], [1])
    sin = dispersion_edad(espana["vueltas"], espana["degradacion"], [1], columna="tiempo_vuelta_s")

    assert "combustible" in corregido.axes[0].get_ylabel()
    assert "combustible" not in sin.axes[0].get_ylabel()


def test_dispersion_no_dibuja_rectas_de_los_stints_insuficientes(espana):
    degradacion = espana["degradacion"].copy()
    degradacion["insuficiente"] = True

    fig = dispersion_edad(espana["vueltas"], degradacion, [1])

    assert len(fig.axes[0].lines) == 0


# --- degradacion_compuestos ----------------------------------------------------------


def test_degradacion_por_compuesto_una_barra_con_su_valor(espana):
    comparacion = comparar_compuestos(espana["degradacion"])

    fig = degradacion_compuestos(comparacion, titulo="Degradación")

    ax = fig.axes[0]
    assert len(ax.patches) == len(comparacion)
    assert etiquetas_y(fig) == ["Blanda", "Media", "Dura"]
    assert all("s/vuelta" in t for t in textos(fig))


def test_los_graficos_se_pueden_dibujar_en_un_eje_existente(espana):
    fig, ejes = plt.subplots(1, 2)

    resultado = degradacion_compuestos(comparar_compuestos(espana["degradacion"]), ax=ejes[1])

    assert resultado is fig
    assert len(ejes[1].patches) > 0
    assert len(ejes[0].patches) == 0
