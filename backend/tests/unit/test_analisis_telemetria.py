import json

import numpy as np
import pandas as pd
import pytest
from conftest import CLASIFICACION, LEC, VER

from f1analytics.analisis.telemetria import (
    CANALES,
    COLUMNAS_GANADORES,
    EMPATE_S,
    alinear_vueltas,
    delta_tiempo,
    ganador_por_minisector,
    remuestrear_por_distancia,
    resumen_telemetria,
)
from f1analytics.datos.telemetria_vuelta import COLUMNAS, telemetria_de_vuelta

# Oficiales de OpenF1: la vuelta 20 de Leclerc (A) y la 11 de Verstappen (B) en Monza.
DURACION_LEC_S = 79.461
DURACION_VER_S = 79.662


def vuelta_sintetica(
    velocidad_kmh: float | np.ndarray = 180.0, largo_m: float = 1000.0, muestras: int = 400
) -> pd.DataFrame:
    """Vuelta recta ideal: la distancia y el tiempo salen de la velocidad, sin error."""
    velocidad = np.broadcast_to(np.asarray(velocidad_kmh, dtype=float), (muestras,)).copy()
    distancia = np.linspace(0, largo_m, muestras)
    ms = velocidad / 3.6
    tramos = np.diff(distancia) * (1 / ms[1:] + 1 / ms[:-1]) / 2
    return pd.DataFrame(
        {
            "tiempo_s": np.concatenate([[0.0], np.cumsum(tramos)]),
            "distancia_m": distancia,
            "x": distancia * 10,
            "y": np.zeros(muestras),
            "velocidad": velocidad,
            "acelerador": np.full(muestras, 100.0),
            "freno": np.zeros(muestras, dtype=int),
            "marcha": np.full(muestras, 6),
            "rpm": np.full(muestras, 11000.0),
            "drs": np.zeros(muestras, dtype=int),
        }
    )[COLUMNAS]


@pytest.fixture
def lec(cargador) -> pd.DataFrame:
    return telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)


@pytest.fixture
def ver(cargador) -> pd.DataFrame:
    return telemetria_de_vuelta(cargador, CLASIFICACION, VER, 11)


@pytest.fixture
def alineadas_reales(lec, ver) -> pd.DataFrame:
    return alinear_vueltas(lec, ver)


# --- remuestrear_por_distancia -------------------------------------------------------


def test_remuestrear_da_una_fila_cada_cinco_metros(lec):
    nueva = remuestrear_por_distancia(lec)

    assert nueva["distancia_m"].iloc[0] == 0
    assert nueva["distancia_m"].iloc[-1] == pytest.approx(lec["distancia_m"].max())
    pasos = np.diff(nueva["distancia_m"])
    assert pasos.max() == pytest.approx(5.0)
    assert pasos.min() > 0
    assert list(nueva.columns) == ["distancia_m", *CANALES]


def test_remuestrear_con_otro_paso(lec):
    nueva = remuestrear_por_distancia(lec, paso_m=20)

    assert np.diff(nueva["distancia_m"]).max() == pytest.approx(20.0)
    assert len(nueva) < len(remuestrear_por_distancia(lec, paso_m=5))


def test_remuestrear_no_inventa_velocidades_fuera_del_rango(lec):
    nueva = remuestrear_por_distancia(lec)

    assert nueva["velocidad"].between(lec["velocidad"].min(), lec["velocidad"].max()).all()


def test_remuestrear_los_canales_discretos_conservan_valores_que_existen(lec):
    nueva = remuestrear_por_distancia(lec)

    assert set(nueva["freno"]) <= set(lec["freno"])
    assert set(nueva["marcha"]) <= set(lec["marcha"])
    assert set(nueva["drs"]) <= set(lec["drs"])


def test_remuestrear_una_vuelta_a_velocidad_constante(lec):
    nueva = remuestrear_por_distancia(vuelta_sintetica(180, largo_m=1000))

    assert nueva["velocidad"].to_numpy() == pytest.approx(180)
    # 1000 m a 50 m/s son 20 s, repartidos de forma pareja.
    assert nueva["tiempo_s"].iloc[-1] == pytest.approx(20)
    assert nueva["tiempo_s"].iloc[40] == pytest.approx(4)  # 200 m


def test_remuestrear_tolera_distancias_repetidas_por_un_coche_parado():
    tel = vuelta_sintetica(180)
    tel.loc[100:110, "distancia_m"] = tel.loc[100, "distancia_m"]

    nueva = remuestrear_por_distancia(tel)

    assert not nueva.isna().any().any()
    assert nueva["distancia_m"].is_monotonic_increasing


def test_remuestrear_rechaza_un_paso_que_no_es_positivo():
    with pytest.raises(ValueError):
        remuestrear_por_distancia(vuelta_sintetica(), paso_m=0)


def test_remuestrear_rechaza_una_vuelta_con_una_sola_muestra():
    with pytest.raises(ValueError):
        remuestrear_por_distancia(vuelta_sintetica().iloc[:1])


# --- alinear_vueltas -----------------------------------------------------------------


def test_alinear_deja_cada_canal_con_sufijo_a_y_b(alineadas_reales):
    esperadas = ["distancia_m"] + [f"{c}_{s}" for s in "ab" for c in CANALES]

    assert sorted(alineadas_reales.columns) == sorted(esperadas)
    assert not alineadas_reales.isna().any().any()


def test_alinear_estira_las_vueltas_al_promedio_de_sus_largos(lec, ver, alineadas_reales):
    promedio = (lec["distancia_m"].max() + ver["distancia_m"].max()) / 2

    assert alineadas_reales["distancia_m"].iloc[-1] == pytest.approx(promedio)
    # Las dos vueltas empiezan y terminan en la meta: la velocidad de las dos puntas es parecida.
    for punta in (0, -1):
        a = alineadas_reales["velocidad_a"].iloc[punta]
        b = alineadas_reales["velocidad_b"].iloc[punta]
        assert abs(a - b) < 30


def test_alinear_compara_el_mismo_punto_de_la_pista_aunque_el_largo_difiera():
    # B recorre un 1 % más de «distancia» solo por el error de integrar: es la misma pista.
    corta = vuelta_sintetica(np.linspace(150, 300, 400), largo_m=1000)
    larga = vuelta_sintetica(np.linspace(150, 300, 400), largo_m=1010)

    alineadas = alinear_vueltas(corta, larga)

    # Con la misma velocidad en cada punto de la pista, tras estirar no debe haber diferencia.
    assert (alineadas["velocidad_a"] - alineadas["velocidad_b"]).abs().max() < 1e-6


def test_alinear_una_vuelta_consigo_misma_es_identica(lec):
    alineadas = alinear_vueltas(lec, lec)

    for canal in CANALES:
        assert alineadas[f"{canal}_a"].equals(alineadas[f"{canal}_b"])


# --- delta_tiempo --------------------------------------------------------------------


def test_delta_de_una_vuelta_consigo_misma_es_cero(lec):
    delta = delta_tiempo(alinear_vueltas(lec, lec))

    assert (delta == 0).all()
    assert delta.name == "delta_s"


def test_delta_a_velocidad_constante_se_calcula_a_mano():
    # 1000 m: A a 180 km/h (50 m/s) tarda 20 s; B a 162 km/h (45 m/s) tarda 22,222 s.
    rapida = vuelta_sintetica(180)
    lenta = vuelta_sintetica(162)

    delta = delta_tiempo(alinear_vueltas(rapida, lenta))

    assert delta.iloc[0] == 0
    assert delta.iloc[-1] == pytest.approx(1000 / 45 - 1000 / 50, abs=1e-6)
    # Es positivo y crece sin bajar: B pierde tiempo en todos los metros.
    assert delta.is_monotonic_increasing


def test_delta_cambia_de_signo_si_se_intercambian_los_pilotos(lec, ver):
    ab = delta_tiempo(alinear_vueltas(lec, ver))
    ba = delta_tiempo(alinear_vueltas(ver, lec))

    assert ba.to_numpy() == pytest.approx(-ab.to_numpy(), abs=1e-9)


def test_con_las_duraciones_oficiales_el_delta_final_es_la_diferencia_oficial(alineadas_reales):
    delta = delta_tiempo(alineadas_reales, DURACION_LEC_S, DURACION_VER_S)

    assert delta.iloc[-1] == pytest.approx(DURACION_VER_S - DURACION_LEC_S, abs=1e-9)
    assert delta.iloc[0] == 0


def test_sin_ajustar_el_delta_final_se_desvia_de_la_diferencia_oficial(alineadas_reales):
    # Es la razón de ajustar: con ~3,7 muestras por segundo la integración cruda da 0,43 s
    # donde el cronometraje oficial dice 0,20 s (más del doble).
    oficial = DURACION_VER_S - DURACION_LEC_S

    error = abs(delta_tiempo(alineadas_reales).iloc[-1] - oficial)

    assert 0.05 < error < 0.5


def test_el_delta_integrado_coincide_con_la_diferencia_de_los_relojes_de_las_vueltas(
    alineadas_reales,
):
    # La telemetría trae la hora de cada muestra: es una segunda forma, independiente, de
    # saber cuánto tardó cada piloto en llegar a cada metro.
    por_reloj = alineadas_reales["tiempo_s_b"] - alineadas_reales["tiempo_s_a"]

    delta = delta_tiempo(alineadas_reales, DURACION_LEC_S, DURACION_VER_S)

    assert (delta - por_reloj).abs().max() < 0.15


def test_el_ajuste_mueve_el_delta_como_mucho_unas_decimas(alineadas_reales):
    crudo = delta_tiempo(alineadas_reales)
    ajustado = delta_tiempo(alineadas_reales, DURACION_LEC_S, DURACION_VER_S)

    assert (ajustado - crudo).abs().max() < 0.3


def test_el_coche_casi_parado_no_dispara_el_delta():
    tel = vuelta_sintetica(180)
    tel.loc[200, "velocidad"] = 0

    delta = delta_tiempo(alinear_vueltas(vuelta_sintetica(180), tel))

    assert np.isfinite(delta).all()


# --- ganador_por_minisector ----------------------------------------------------------


def test_los_minisectores_son_25_tramos_iguales_que_cubren_toda_la_vuelta(alineadas_reales):
    delta = delta_tiempo(alineadas_reales, DURACION_LEC_S, DURACION_VER_S)

    ganadores = ganador_por_minisector(alineadas_reales, delta)

    assert list(ganadores.columns) == COLUMNAS_GANADORES
    assert list(ganadores["sector"]) == list(range(25))
    assert ganadores["inicio_m"].iloc[0] == 0
    assert ganadores["fin_m"].iloc[-1] == pytest.approx(alineadas_reales["distancia_m"].iloc[-1])
    assert ganadores["inicio_m"].iloc[1:].to_numpy() == pytest.approx(
        ganadores["fin_m"].iloc[:-1].to_numpy()
    )
    largos = ganadores["fin_m"] - ganadores["inicio_m"]
    assert largos.max() == pytest.approx(largos.min())
    assert set(ganadores["ganador"]) <= {"a", "b", "empate"}


def test_las_diferencias_de_los_minisectores_suman_el_delta_final(alineadas_reales):
    delta = delta_tiempo(alineadas_reales, DURACION_LEC_S, DURACION_VER_S)

    ganadores = ganador_por_minisector(alineadas_reales, delta)

    assert ganadores["diferencia_s"].sum() == pytest.approx(delta.iloc[-1], abs=1e-9)


def test_cada_minisector_lo_gana_quien_tuvo_el_mejor_tiempo():
    # B es más lento en la primera mitad y más rápido en la segunda.
    velocidad_a = np.full(400, 200.0)
    velocidad_b = np.where(np.linspace(0, 1, 400) < 0.5, 180.0, 220.0)
    alineadas = alinear_vueltas(vuelta_sintetica(velocidad_a), vuelta_sintetica(velocidad_b))
    delta = delta_tiempo(alineadas)

    ganadores = ganador_por_minisector(alineadas, delta, n_sectores=10)

    # Los sectores 4 y 5 cruzan la mitad exacta; en el resto no hay duda.
    assert list(ganadores["ganador"][:4]) == ["a"] * 4
    assert list(ganadores["ganador"][6:]) == ["b"] * 4


def test_dos_vueltas_iguales_empatan_en_todos_los_minisectores(lec):
    alineadas = alinear_vueltas(lec, lec)

    ganadores = ganador_por_minisector(alineadas, delta_tiempo(alineadas))

    assert (ganadores["ganador"] == "empate").all()
    assert (ganadores["diferencia_s"].abs() <= EMPATE_S).all()


def test_se_puede_cambiar_la_cantidad_de_minisectores(alineadas_reales):
    delta = delta_tiempo(alineadas_reales)

    assert len(ganador_por_minisector(alineadas_reales, delta, n_sectores=3)) == 3
    with pytest.raises(ValueError):
        ganador_por_minisector(alineadas_reales, delta, n_sectores=0)


# --- resumen_telemetria --------------------------------------------------------------


@pytest.fixture
def resumen_real(alineadas_reales) -> dict:
    delta = delta_tiempo(alineadas_reales, DURACION_LEC_S, DURACION_VER_S)
    ganadores = ganador_por_minisector(alineadas_reales, delta)
    return resumen_telemetria(alineadas_reales, delta, ganadores)


def test_el_resumen_dice_que_leclerc_fue_mas_rapido_en_toda_la_vuelta(resumen_real):
    assert resumen_real["delta_final_s"] == pytest.approx(0.201, abs=1e-9)
    assert resumen_real["ganador"] == "a"


def test_el_resumen_cuenta_los_25_minisectores(resumen_real):
    assert sum(resumen_real["sectores_ganados"].values()) == 25
    assert set(resumen_real["sectores_ganados"]) == {"a", "b", "empate"}


def test_el_resumen_marca_el_minisector_de_mayor_ventaja_de_cada_piloto(
    alineadas_reales, resumen_real
):
    delta = delta_tiempo(alineadas_reales, DURACION_LEC_S, DURACION_VER_S)
    ganadores = ganador_por_minisector(alineadas_reales, delta)
    for letra, signo in (("a", 1), ("b", -1)):
        ventaja = resumen_real["mayor_ventaja"][letra]
        propios = ganadores[ganadores["ganador"] == letra]
        if propios.empty:
            assert ventaja is None
            continue
        assert ventaja["ventaja_s"] == pytest.approx((signo * propios["diferencia_s"]).max())
        assert ventaja["ventaja_s"] > EMPATE_S
        assert ventaja["inicio_m"] < ventaja["fin_m"]


def test_el_resumen_trae_velocidades_y_acelerador_de_cada_piloto(lec, ver, resumen_real):
    assert resumen_real["vel_maxima"]["a"]["kmh"] == pytest.approx(lec["velocidad"].max(), abs=3)
    assert resumen_real["vel_maxima"]["b"]["kmh"] == pytest.approx(ver["velocidad"].max(), abs=3)
    for letra in "ab":
        assert resumen_real["vel_minima"][letra]["kmh"] < resumen_real["vel_maxima"][letra]["kmh"]
        assert 0 < resumen_real["pct_a_fondo"][letra] < 100


def test_el_resumen_es_solo_datos_y_se_puede_serializar_a_json(resumen_real):
    texto = json.dumps(resumen_real)

    def sin_texto_para_el_usuario(valor) -> bool:
        if isinstance(valor, dict):
            return all(sin_texto_para_el_usuario(v) for v in valor.values())
        return valor is None or isinstance(valor, int | float) or valor in {"a", "b", "empate"}

    assert json.loads(texto) == resumen_real
    assert sin_texto_para_el_usuario(resumen_real)


def test_un_empate_exacto_no_da_ganador_ni_ventajas(lec):
    alineadas = alinear_vueltas(lec, lec)
    delta = delta_tiempo(alineadas)

    resumen = resumen_telemetria(alineadas, delta, ganador_por_minisector(alineadas, delta))

    assert resumen["ganador"] == "empate"
    assert resumen["sectores_ganados"] == {"a": 0, "b": 0, "empate": 25}
    assert resumen["mayor_ventaja"] == {"a": None, "b": None}
