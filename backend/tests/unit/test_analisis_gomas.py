import numpy as np
import pandas as pd
import pytest
from conftest import CARRERA_ESPANA, PILOTOS_ESPANA

from f1analytics.analisis.gomas import (
    COLUMNAS_COMPUESTOS,
    COLUMNAS_DEGRADACION,
    COLUMNAS_STINTS,
    comparar_compuestos,
    degradacion_por_stint,
    resumen_gomas,
    resumen_stints,
)
from f1analytics.datos.limpieza import (
    agregar_correccion_combustible,
    agregar_edad_goma,
    estado_pista_por_vuelta,
    limpiar_vueltas_carrera,
)


def stint(
    piloto: int,
    numero: int,
    compuesto: str,
    pendiente: float,
    n: int = 10,
    base: float = 90.0,
    edad_inicial: int = 0,
    vuelta_inicio: int = 2,
) -> pd.DataFrame:
    """Vueltas de un stint cuyo tiempo crece exactamente ``pendiente`` s por vuelta de edad."""
    edades = np.arange(edad_inicial, edad_inicial + n)
    vueltas = np.arange(vuelta_inicio, vuelta_inicio + n)
    tiempo = base + pendiente * edades
    return pd.DataFrame(
        {
            "piloto": piloto,
            "vuelta": vueltas,
            "stint": numero,
            "compuesto": compuesto,
            "edad_goma": edades.astype(float),
            "tiempo_vuelta_s": tiempo,
            "tiempo_corregido_s": tiempo,
        }
    )


# --- degradacion_por_stint -----------------------------------------------------------


def test_recupera_la_pendiente_el_intercepto_y_el_r2_de_una_recta_exacta():
    vueltas = stint(1, 1, "SOFT", pendiente=0.1, base=80.0)

    degradacion = degradacion_por_stint(vueltas)

    assert list(degradacion.columns) == COLUMNAS_DEGRADACION
    fila = degradacion.iloc[0]
    assert fila["pendiente_s_por_vuelta"] == pytest.approx(0.1)
    assert fila["intercepto"] == pytest.approx(80.0)
    assert fila["r2"] == pytest.approx(1.0)
    assert fila["n_vueltas"] == 10
    assert not fila["insuficiente"]


def test_una_goma_que_no_se_gasta_tiene_pendiente_cero():
    vueltas = stint(1, 1, "HARD", pendiente=0.0)

    assert degradacion_por_stint(vueltas).iloc[0]["pendiente_s_por_vuelta"] == pytest.approx(0)


def test_con_ruido_el_r2_baja_pero_la_pendiente_se_mantiene_cerca():
    vueltas = stint(1, 1, "SOFT", pendiente=0.1, n=40)
    rng = np.random.default_rng(1)
    vueltas["tiempo_corregido_s"] += rng.normal(0, 0.3, len(vueltas))

    fila = degradacion_por_stint(vueltas).iloc[0]

    assert fila["pendiente_s_por_vuelta"] == pytest.approx(0.1, abs=0.03)
    assert 0.2 < fila["r2"] < 0.99


def test_la_goma_usada_mide_la_pendiente_contra_la_edad_real_y_no_contra_la_vuelta():
    # Mismo stint, pero la goma ya traía 8 vueltas: la pendiente es la misma y el intercepto no.
    nueva = degradacion_por_stint(stint(1, 1, "SOFT", 0.1, base=80.0)).iloc[0]
    usada = degradacion_por_stint(stint(1, 1, "SOFT", 0.1, base=80.0, edad_inicial=8)).iloc[0]

    assert usada["pendiente_s_por_vuelta"] == pytest.approx(nueva["pendiente_s_por_vuelta"])
    assert usada["intercepto"] == pytest.approx(80.0)
    assert (usada["edad_inicial"], usada["edad_final"]) == (8, 17)


def test_menos_de_cinco_vueltas_es_insuficiente_y_no_trae_pendiente():
    fila = degradacion_por_stint(stint(1, 1, "SOFT", 0.1, n=4)).iloc[0]

    assert fila["insuficiente"]
    assert np.isnan(fila["pendiente_s_por_vuelta"])
    assert fila["n_vueltas"] == 4


def test_el_minimo_de_vueltas_se_puede_cambiar():
    vueltas = stint(1, 1, "SOFT", 0.1, n=4)

    assert not degradacion_por_stint(vueltas, minimo_vueltas=3).iloc[0]["insuficiente"]


def test_si_la_edad_no_cambia_no_hay_pendiente():
    vueltas = stint(1, 1, "SOFT", 0.1, n=6)
    vueltas["edad_goma"] = 5.0

    assert degradacion_por_stint(vueltas).iloc[0]["insuficiente"]


def test_cada_piloto_y_cada_stint_tiene_su_renglon_ordenado():
    vueltas = pd.concat(
        [
            stint(2, 1, "MEDIUM", 0.05),
            stint(1, 2, "HARD", 0.02, vuelta_inicio=20),
            stint(1, 1, "SOFT", 0.1),
        ]
    )

    degradacion = degradacion_por_stint(vueltas)

    assert list(zip(degradacion["piloto"], degradacion["stint"], strict=True)) == [
        (1, 1),
        (1, 2),
        (2, 1),
    ]
    assert degradacion["pendiente_s_por_vuelta"].round(3).tolist() == [0.1, 0.02, 0.05]


def test_ajusta_la_columna_que_se_pide():
    vueltas = stint(1, 1, "SOFT", 0.1)
    vueltas["tiempo_corregido_s"] = vueltas["tiempo_vuelta_s"] + 0.06 * vueltas["edad_goma"]

    sin = degradacion_por_stint(vueltas, "tiempo_vuelta_s").iloc[0]["pendiente_s_por_vuelta"]
    con = degradacion_por_stint(vueltas, "tiempo_corregido_s").iloc[0]["pendiente_s_por_vuelta"]

    assert (sin, con) == (pytest.approx(0.1), pytest.approx(0.16))


def test_ignora_las_vueltas_sin_stint_y_sin_vueltas_devuelve_una_tabla_vacia():
    vueltas = stint(1, 1, "SOFT", 0.1)
    vueltas.loc[0, "compuesto"] = None

    assert degradacion_por_stint(vueltas).iloc[0]["n_vueltas"] == 9
    vacia = degradacion_por_stint(vueltas.iloc[0:0])
    assert vacia.empty
    assert list(vacia.columns) == COLUMNAS_DEGRADACION


# --- resumen_stints ------------------------------------------------------------------


def test_resumen_de_stints_con_la_primera_y_la_ultima_vuelta_limpia():
    vueltas = pd.concat([stint(1, 1, "SOFT", 0.1, n=8), stint(1, 2, "HARD", 0.0, vuelta_inicio=30)])

    resumen = resumen_stints(vueltas)

    assert list(resumen.columns) == COLUMNAS_STINTS
    primero = resumen.iloc[0]
    assert (primero["compuesto"], primero["vuelta_inicio"], primero["vuelta_fin"]) == ("SOFT", 2, 9)
    assert (primero["n_vueltas"], primero["edad_inicial"], primero["edad_final"]) == (8, 0, 7)
    assert primero["tiempo_medio_s"] == pytest.approx(90 + 0.1 * 3.5)
    assert len(resumen) == 2


def test_resumen_de_stints_sin_vueltas_es_una_tabla_vacia_con_columnas():
    resumen = resumen_stints(stint(1, 1, "SOFT", 0.1).iloc[0:0])

    assert resumen.empty
    assert list(resumen.columns) == COLUMNAS_STINTS


# --- comparar_compuestos -------------------------------------------------------------


def test_la_degradacion_de_un_compuesto_pesa_cada_stint_por_sus_vueltas():
    vueltas = pd.concat(
        [
            stint(1, 1, "SOFT", 0.2, n=30),  # largo, 0,2
            stint(2, 1, "SOFT", 0.1, n=10),  # corto, 0,1
        ]
    )

    comparacion = comparar_compuestos(degradacion_por_stint(vueltas))

    soft = comparacion.iloc[0]
    assert soft["pendiente_s_por_vuelta"] == pytest.approx((0.2 * 30 + 0.1 * 10) / 40)
    assert soft["mediana"] == pytest.approx(0.15)
    assert (soft["n_stints"], soft["n_vueltas"]) == (2, 40)


def test_los_compuestos_salen_de_la_goma_mas_blanda_a_la_mas_dura():
    vueltas = pd.concat(
        [
            stint(1, 1, "HARD", 0.02),
            stint(2, 1, "SOFT", 0.1),
            stint(3, 1, "MEDIUM", 0.05),
        ]
    )

    comparacion = comparar_compuestos(degradacion_por_stint(vueltas))

    assert list(comparacion["compuesto"]) == ["SOFT", "MEDIUM", "HARD"]
    assert list(comparacion.columns) == COLUMNAS_COMPUESTOS


def test_los_stints_insuficientes_no_cuentan_en_la_comparacion():
    vueltas = pd.concat([stint(1, 1, "SOFT", 0.1, n=10), stint(2, 1, "SOFT", 5.0, n=3)])

    comparacion = comparar_compuestos(degradacion_por_stint(vueltas))

    assert comparacion.iloc[0]["pendiente_s_por_vuelta"] == pytest.approx(0.1)
    assert comparacion.iloc[0]["n_stints"] == 1


def test_sin_stints_validos_la_comparacion_esta_vacia():
    vueltas = stint(1, 1, "SOFT", 0.1, n=3)

    comparacion = comparar_compuestos(degradacion_por_stint(vueltas))

    assert comparacion.empty
    assert list(comparacion.columns) == COLUMNAS_COMPUESTOS


# --- resumen_gomas -------------------------------------------------------------------


def stints_de(*filas: tuple) -> pd.DataFrame:
    return pd.DataFrame(
        filas,
        columns=["piloto", "stint", "compuesto", "vuelta_inicio", "vuelta_fin", "edad_inicial"],
    )


def test_resumen_dice_que_compuesto_degrada_mas_y_cual_menos():
    vueltas = pd.concat(
        [stint(1, 1, "SOFT", 0.12), stint(1, 2, "MEDIUM", 0.06), stint(2, 1, "HARD", 0.03)]
    )
    stints = stints_de(
        (1, 1, "SOFT", 1, 20, 0), (1, 2, "MEDIUM", 21, 60, 0), (2, 1, "HARD", 1, 30, 0)
    )

    resumen = resumen_gomas(degradacion_por_stint(vueltas), stints)

    assert resumen["compuesto_mas_degradante"]["compuesto"] == "SOFT"
    assert resumen["compuesto_mas_degradante"]["pendiente_s_por_vuelta"] == pytest.approx(0.12)
    assert resumen["compuesto_menos_degradante"]["compuesto"] == "HARD"
    assert resumen["n_stints_validos"] == 3
    assert resumen["n_stints_insuficientes"] == 0


def test_resumen_con_un_solo_compuesto_no_declara_ganador():
    vueltas = pd.concat([stint(1, 1, "SOFT", 0.12), stint(2, 1, "SOFT", 0.08)])
    stints = stints_de((1, 1, "SOFT", 1, 20, 0))

    resumen = resumen_gomas(degradacion_por_stint(vueltas), stints)

    assert resumen["compuesto_mas_degradante"] is None
    assert resumen["compuesto_menos_degradante"] is None


def test_resumen_con_el_stint_mas_largo_y_las_paradas_por_piloto():
    stints = stints_de(
        (1, 1, "SOFT", 1, 20, 0),
        (1, 2, "HARD", 21, 70, 0),  # 50 vueltas
        (2, 1, "MEDIUM", 1, 30, 0),
        (2, 2, "HARD", 31, 40, 0),
        (2, 3, "SOFT", 41, 70, 0),
    )

    resumen = resumen_gomas(degradacion_por_stint(stint(1, 1, "SOFT", 0.1)), stints)

    assert resumen["stint_mas_largo"] == {"piloto": 1, "compuesto": "HARD", "vueltas": 50}
    assert resumen["paradas_por_piloto"] == pytest.approx(1.5)


def test_resumen_cuenta_los_stints_sin_degradacion_y_los_insuficientes():
    vueltas = pd.concat(
        [
            stint(1, 1, "SOFT", 0.1),
            stint(1, 2, "MEDIUM", -0.02),  # el tráfico o la pista taparon el desgaste
            stint(2, 1, "HARD", 0.0, n=3),  # muy corto
        ]
    )

    resumen = resumen_gomas(degradacion_por_stint(vueltas), stints_de((1, 1, "SOFT", 1, 10, 0)))

    assert resumen["n_stints_validos"] == 2
    assert resumen["n_stints_sin_degradacion"] == 1
    assert resumen["n_stints_insuficientes"] == 1


def test_resumen_sin_datos_no_falla():
    vacia = degradacion_por_stint(stint(1, 1, "SOFT", 0.1).iloc[0:0])

    resumen = resumen_gomas(vacia, stints_de())

    assert resumen["n_stints_validos"] == 0
    assert resumen["stint_mas_largo"] is None
    assert resumen["compuesto_mas_degradante"] is None
    assert resumen["paradas_por_piloto"] == 0


# --- con datos reales (España 2024) --------------------------------------------------


@pytest.fixture
def espana(cargador):
    vueltas = cargador.vueltas(CARRERA_ESPANA)
    estado = estado_pista_por_vuelta(cargador.direccion_carrera(CARRERA_ESPANA), 66)
    limpias = limpiar_vueltas_carrera(vueltas, cargador.paradas(CARRERA_ESPANA), estado)
    stints = cargador.stints(CARRERA_ESPANA)
    con_edad = agregar_correccion_combustible(agregar_edad_goma(limpias, stints))
    return con_edad, stints


def test_en_espana_hay_un_stint_valido_por_cada_stint_de_los_seis_pilotos(espana):
    vueltas, stints = espana

    degradacion = degradacion_por_stint(vueltas)

    esperados = stints[stints["piloto"].isin(PILOTOS_ESPANA)]
    assert len(degradacion) == len(esperados) == 18
    assert not degradacion["insuficiente"].any()


def test_en_espana_la_blanda_se_gasta_mas_que_la_media(espana):
    vueltas, _ = espana

    comparacion = comparar_compuestos(degradacion_por_stint(vueltas)).set_index("compuesto")

    assert (
        comparacion.loc["SOFT", "pendiente_s_por_vuelta"]
        > comparacion.loc["MEDIUM", "pendiente_s_por_vuelta"]
    )
    # Con la corrección por combustible, la goma pierde entre 3 y 20 centésimas por vuelta.
    assert comparacion["pendiente_s_por_vuelta"].between(0.03, 0.2).all()


def test_en_espana_corregir_por_combustible_aumenta_la_degradacion_en_unos_6_centesimas(espana):
    vueltas, _ = espana

    sin = degradacion_por_stint(vueltas, "tiempo_vuelta_s")["pendiente_s_por_vuelta"]
    con = degradacion_por_stint(vueltas, "tiempo_corregido_s")["pendiente_s_por_vuelta"]

    assert (con - sin).mean() == pytest.approx(0.06, abs=0.005)
    assert (con > sin).all()


def test_en_espana_el_resumen_nombra_la_blanda_como_la_que_mas_se_gasta(espana):
    vueltas, stints = espana

    resumen = resumen_gomas(degradacion_por_stint(vueltas), stints)

    assert resumen["compuesto_mas_degradante"]["compuesto"] == "SOFT"
    assert resumen["n_stints_sin_degradacion"] == 0
    assert 1.5 <= resumen["paradas_por_piloto"] <= 2.5
