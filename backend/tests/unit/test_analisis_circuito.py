import math

import pandas as pd
import pytest
from conftest import CLASIFICACION, LEC

from f1analytics.analisis.circuito import (
    COLUMNAS_ZONAS_ALTA_VELOCIDAD,
    COLUMNAS_ZONAS_FRENADO,
    orientar_circuito,
    posicion_curvas,
    resumen_circuito,
    zonas_alta_velocidad,
    zonas_frenado,
)
from f1analytics.datos.circuitos import Curva, circuito
from f1analytics.datos.telemetria_vuelta import telemetria_de_vuelta

PASO_M = 10  # una muestra cada 10 m


def vuelta(*tramos: tuple[int, float, float, float, float]) -> pd.DataFrame:
    """Telemetría de juguete sobre una recta (x crece con la distancia, y = 0).

    Cada tramo es ``(muestras, vel_inicial, vel_final, freno, acelerador)``; la velocidad
    cambia en línea recta dentro del tramo. La unidad de ``x`` son décimas de metro.
    """
    velocidades, frenos, aceleradores = [], [], []
    for muestras, vel_ini, vel_fin, freno, acelerador in tramos:
        for i in range(muestras):
            fraccion = i / (muestras - 1) if muestras > 1 else 0
            velocidades.append(vel_ini + (vel_fin - vel_ini) * fraccion)
            frenos.append(freno)
            aceleradores.append(acelerador)
    distancia = [i * PASO_M for i in range(len(velocidades))]
    return pd.DataFrame(
        {
            "tiempo_s": [d / 50 for d in distancia],
            "distancia_m": distancia,
            "x": [d * 10 for d in distancia],
            "y": 0.0,
            "velocidad": velocidades,
            "acelerador": aceleradores,
            "freno": frenos,
            "marcha": 7,
        }
    )


def curvas_en(*posiciones_m: float) -> pd.DataFrame:
    """Curvas 1, 2, 3… sobre la recta de ``vuelta``, a esas distancias en metros."""
    return posicion_curvas(
        [
            Curva(numero=i + 1, letra="", x=m * 10, y=0, distancia_m=m)
            for i, m in enumerate(posiciones_m)
        ]
    )


# Una recta a fondo, una frenada de 300 a 100 km/h y una curva lenta.
UNA_FRENADA = vuelta(
    (20, 300, 300, 0, 100),  # 0–190 m
    (10, 300, 100, 100, 0),  # 200–290 m: frenada
    (20, 100, 100, 0, 50),  # 300–490 m
)


# --- orientar_circuito ---------------------------------------------------------------


def test_orientar_gira_en_sentido_antihorario():
    tel = pd.DataFrame({"x": [100.0], "y": [0.0]})

    girada = orientar_circuito(tel, 90)

    assert girada["x"][0] == pytest.approx(0, abs=1e-9)
    assert girada["y"][0] == pytest.approx(100)


def test_orientar_con_rotacion_cero_deja_todo_igual():
    pd.testing.assert_frame_equal(orientar_circuito(UNA_FRENADA, 0), UNA_FRENADA, check_dtype=False)


def test_orientar_no_modifica_la_telemetria_original_y_conserva_las_otras_columnas():
    original = UNA_FRENADA.copy()

    girada = orientar_circuito(UNA_FRENADA, 95)

    pd.testing.assert_frame_equal(UNA_FRENADA, original)
    assert list(girada.columns) == list(original.columns)
    pd.testing.assert_series_equal(girada["velocidad"], original["velocidad"])


def test_orientar_conserva_las_distancias_entre_puntos():
    girada = orientar_circuito(UNA_FRENADA, 33)

    antes = math.dist(UNA_FRENADA[["x", "y"]].iloc[0], UNA_FRENADA[["x", "y"]].iloc[-1])
    despues = math.dist(girada[["x", "y"]].iloc[0], girada[["x", "y"]].iloc[-1])
    assert despues == pytest.approx(antes)


# --- posicion_curvas -----------------------------------------------------------------


def test_posicion_curvas_junta_el_numero_y_la_letra():
    tabla = posicion_curvas(
        [Curva(1, "", 0, 0, 0), Curva(1, "A", 10, 0, 10), Curva(12, "A", 20, 0, 20)]
    )

    assert tabla["etiqueta"].tolist() == ["1", "1A", "12A"]


def test_las_curvas_giran_igual_que_la_telemetria():
    curva = Curva(1, "", 2900, 0, 290)
    tel = UNA_FRENADA.loc[[29]]  # x = 2900

    girada = orientar_circuito(tel, 95)
    curvas = posicion_curvas([curva], 95)

    assert curvas["x"][0] == pytest.approx(girada["x"].iloc[0])
    assert curvas["y"][0] == pytest.approx(girada["y"].iloc[0])


def test_posicion_curvas_sin_curvas_devuelve_una_tabla_vacia_con_columnas():
    tabla = posicion_curvas([], 95)

    assert tabla.empty
    assert list(tabla.columns) == ["numero", "letra", "etiqueta", "x", "y", "distancia_m"]


# --- zonas_frenado -------------------------------------------------------------------


def test_zona_de_frenado_con_velocidades_longitud_y_punto_de_inicio():
    zonas = zonas_frenado(UNA_FRENADA, curvas_en(300))

    assert list(zonas.columns) == COLUMNAS_ZONAS_FRENADO
    assert len(zonas) == 1
    zona = zonas.iloc[0]
    assert zona["curva"] == 1
    assert (zona["inicio_m"], zona["fin_m"], zona["longitud_m"]) == (200, 290, 90)
    assert (zona["vel_entrada"], zona["vel_salida"]) == (300, 100)
    assert (zona["x_inicio"], zona["y_inicio"]) == (2000, 0)


def test_cada_zona_va_a_la_curva_donde_se_suelta_el_freno():
    # La curva 1 queda justo antes del final de la frenada y la 2 poco después.
    zonas = zonas_frenado(UNA_FRENADA, curvas_en(280, 320))

    assert zonas["curva"].tolist() == [1]


def test_los_toques_cortos_de_freno_no_cuentan():
    tel = vuelta(
        (20, 300, 300, 0, 100),
        (2, 300, 290, 100, 0),  # 10 m de freno
        (20, 290, 290, 0, 100),
    )

    assert zonas_frenado(tel, curvas_en(200)).empty


def test_la_longitud_minima_se_puede_cambiar():
    tel = vuelta((20, 300, 300, 0, 100), (4, 300, 250, 100, 0), (20, 250, 250, 0, 100))

    assert zonas_frenado(tel, curvas_en(220), longitud_min_m=50).empty
    assert len(zonas_frenado(tel, curvas_en(220), longitud_min_m=20)) == 1


def test_dos_frenadas_en_la_misma_curva_dejan_la_mas_larga():
    tel = vuelta(
        (10, 300, 300, 0, 100),
        (5, 300, 200, 100, 0),  # 40 m
        (5, 200, 200, 0, 100),
        (10, 200, 100, 100, 0),  # 90 m
        (10, 100, 100, 0, 50),
    )

    zonas = zonas_frenado(tel, curvas_en(240))

    assert len(zonas) == 1
    assert zonas.iloc[0]["longitud_m"] == 90


def test_una_zona_lejos_de_toda_curva_se_descarta():
    assert zonas_frenado(UNA_FRENADA, curvas_en(2000)).empty


def test_la_distancia_maxima_a_la_curva_se_puede_cambiar():
    curvas = curvas_en(450)  # a 160 m del final de la frenada

    assert zonas_frenado(UNA_FRENADA, curvas, distancia_max_m=100).empty
    assert len(zonas_frenado(UNA_FRENADA, curvas, distancia_max_m=200)) == 1


def test_varias_zonas_salen_ordenadas_por_distancia():
    tel = vuelta(
        (10, 300, 300, 0, 100),
        (10, 300, 100, 100, 0),  # 100–190 m
        (10, 100, 300, 0, 100),
        (10, 300, 120, 100, 0),  # 300–390 m
        (5, 120, 120, 0, 50),
    )

    zonas = zonas_frenado(tel, curvas_en(190, 390))

    assert zonas["curva"].tolist() == [1, 2]
    assert zonas["inicio_m"].is_monotonic_increasing


def test_sin_frenadas_o_sin_curvas_devuelve_una_tabla_vacia_con_columnas():
    sin_freno = vuelta((30, 300, 300, 0, 100))

    for zonas in (
        zonas_frenado(sin_freno, curvas_en(100)),
        zonas_frenado(UNA_FRENADA, curvas_en()),
        zonas_frenado(UNA_FRENADA.iloc[0:0], curvas_en(100)),
    ):
        assert zonas.empty
        assert list(zonas.columns) == COLUMNAS_ZONAS_FRENADO


def test_la_frenada_que_dura_hasta_el_final_de_la_vuelta_cuenta():
    tel = vuelta((10, 300, 300, 0, 100), (10, 300, 100, 100, 0))

    zonas = zonas_frenado(tel, curvas_en(190))

    assert len(zonas) == 1
    assert zonas.iloc[0]["fin_m"] == 190


# --- zonas_alta_velocidad ------------------------------------------------------------


def test_zonas_de_alta_velocidad_son_los_tramos_sobre_el_percentil():
    tel = vuelta(
        (10, 100, 100, 0, 50),
        (10, 300, 300, 0, 100),  # 100–190 m
        (30, 100, 100, 0, 50),
        (10, 300, 300, 0, 100),  # 500–590 m
        (10, 100, 100, 0, 50),
    )

    zonas = zonas_alta_velocidad(tel, percentil=75)

    assert list(zonas.columns) == COLUMNAS_ZONAS_ALTA_VELOCIDAD
    assert zonas[["inicio_m", "fin_m", "vel_maxima"]].values.tolist() == [
        [100, 190, 300],
        [500, 590, 300],
    ]
    assert zonas.iloc[0][["x_inicio", "x_fin"]].tolist() == [1000, 1900]


def test_los_tramos_cortos_de_alta_velocidad_se_descartan():
    tel = vuelta((10, 100, 100, 0, 50), (2, 300, 300, 0, 100), (10, 100, 100, 0, 50))

    assert zonas_alta_velocidad(tel, percentil=95).empty


def test_alta_velocidad_con_telemetria_vacia():
    zonas = zonas_alta_velocidad(UNA_FRENADA.iloc[0:0])

    assert zonas.empty
    assert list(zonas.columns) == COLUMNAS_ZONAS_ALTA_VELOCIDAD


# --- resumen_circuito ----------------------------------------------------------------


def test_resumen_con_velocidades_maxima_y_minima_y_su_posicion():
    resumen = resumen_circuito(UNA_FRENADA, zonas_frenado(UNA_FRENADA, curvas_en(300)))

    assert resumen["vel_maxima"] == {"kmh": 300, "distancia_m": 0}
    assert resumen["vel_minima"] == {"kmh": 100, "distancia_m": 290}


def test_resumen_la_frenada_mas_fuerte_es_la_que_mas_velocidad_pierde():
    tel = vuelta(
        (10, 300, 300, 0, 100),
        (10, 300, 200, 100, 0),  # pierde 100
        (10, 200, 300, 0, 100),
        (10, 300, 80, 100, 0),  # pierde 220
        (5, 80, 80, 0, 50),
    )
    zonas = zonas_frenado(tel, curvas_en(190, 390))

    resumen = resumen_circuito(tel, zonas)

    assert resumen["frenada_mas_fuerte"] == {
        "curva": 2,
        "letra": "",
        "vel_entrada": 300,
        "vel_salida": 80,
    }


def test_resumen_sin_frenadas_no_inventa_una():
    tel = vuelta((30, 300, 300, 0, 100))

    resumen = resumen_circuito(tel, zonas_frenado(tel, curvas_en(100)))

    assert resumen["frenada_mas_fuerte"] is None


def test_resumen_porcentaje_a_fondo_se_mide_sobre_la_distancia():
    # Acelerador a fondo en las primeras 41 de 100 muestras: 41 de 99 tramos de 10 m.
    tel = vuelta((41, 300, 300, 0, 100), (59, 100, 100, 0, 30))

    resumen = resumen_circuito(tel, zonas_frenado(tel, curvas_en()))

    assert resumen["pct_a_fondo"] == pytest.approx(100 * 41 / 99)


def test_resumen_pct_a_fondo_no_depende_de_cuantas_muestras_haya():
    # Mismo recorrido, pero la parte lenta tiene la mitad de muestras (el doble de separadas).
    # Con el acelerador a fondo en la mitad de la distancia, debe dar cerca de 50 %.
    tel = vuelta((51, 300, 300, 0, 100), (51, 100, 100, 0, 30))

    resumen = resumen_circuito(tel, zonas_frenado(tel, curvas_en()))

    assert resumen["pct_a_fondo"] == pytest.approx(51 / 101 * 100, abs=1)


def test_resumen_con_la_vuelta_sin_recorrido_da_cero_a_fondo():
    tel = vuelta((1, 100, 100, 0, 100))

    assert resumen_circuito(tel, zonas_frenado(tel, curvas_en()))["pct_a_fondo"] == 0


# --- con datos reales (Monza 2024, vuelta rápida de Leclerc en la clasificación) -----


@pytest.fixture
def monza(cargador):
    tel = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)
    return tel, circuito(39, 2024)


def test_en_monza_la_primera_chicane_es_la_frenada_mas_fuerte(monza):
    tel, monza_circuito = monza

    zonas = zonas_frenado(tel, posicion_curvas(monza_circuito.curvas))

    frenada_1 = zonas[zonas["curva"] == 1].iloc[0]
    assert frenada_1["vel_entrada"] > 320
    assert frenada_1["vel_salida"] < 130
    assert resumen_circuito(tel, zonas)["frenada_mas_fuerte"]["curva"] == 1


def test_en_monza_todas_las_zonas_van_a_curvas_que_existen_y_no_se_repiten(monza):
    tel, monza_circuito = monza

    zonas = zonas_frenado(tel, posicion_curvas(monza_circuito.curvas))

    numeros = {curva.numero for curva in monza_circuito.curvas}
    assert set(zonas["curva"]) <= numeros
    assert zonas["curva"].is_unique
    assert 4 <= len(zonas) <= 8


def test_en_monza_los_resumenes_tienen_valores_de_f1(monza):
    tel, monza_circuito = monza

    resumen = resumen_circuito(tel, zonas_frenado(tel, posicion_curvas(monza_circuito.curvas)))

    assert 330 <= resumen["vel_maxima"]["kmh"] <= 360
    assert resumen["vel_minima"]["kmh"] < 100
    assert 60 <= resumen["pct_a_fondo"] <= 95


def test_en_monza_girar_el_mapa_no_cambia_las_zonas_de_frenado(monza):
    tel, monza_circuito = monza
    rotacion = monza_circuito.rotacion

    sin_girar = zonas_frenado(tel, posicion_curvas(monza_circuito.curvas))
    girado = zonas_frenado(
        orientar_circuito(tel, rotacion), posicion_curvas(monza_circuito.curvas, rotacion)
    )

    pd.testing.assert_frame_equal(
        sin_girar.drop(columns=["x_inicio", "y_inicio"]),
        girado.drop(columns=["x_inicio", "y_inicio"]),
    )


def test_en_monza_las_zonas_de_alta_velocidad_incluyen_la_recta_de_meta(monza):
    tel, _ = monza

    zonas = zonas_alta_velocidad(tel)

    assert zonas["longitud_m"].max() > 400
    assert zonas["vel_maxima"].max() == tel["velocidad"].max()
