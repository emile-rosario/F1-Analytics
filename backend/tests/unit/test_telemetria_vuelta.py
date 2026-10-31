import pytest
from conftest import CARRERA, CLASIFICACION, LEC, VER

from f1analytics.datos.errores import ErrorDatos
from f1analytics.datos.telemetria_vuelta import (
    COLUMNAS,
    telemetria_de_vuelta,
    vuelta_rapida,
)

# Longitud oficial de Monza.
LONGITUD_MONZA_M = 5793


def codigo_de(funcion, *args) -> str:
    with pytest.raises(ErrorDatos) as error:
        funcion(*args)
    return error.value.codigo


# --- telemetria_de_vuelta ------------------------------------------------------------


def test_la_telemetria_tiene_las_columnas_esperadas(cargador):
    tel = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)

    assert list(tel.columns) == COLUMNAS
    assert len(tel) == 315


def test_el_tiempo_cubre_toda_la_vuelta(cargador):
    tel = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)

    assert tel["tiempo_s"].iloc[0] == pytest.approx(0, abs=0.1)
    assert tel["tiempo_s"].iloc[-1] == pytest.approx(79.461, abs=0.2)
    assert tel["tiempo_s"].is_monotonic_increasing


def test_la_distancia_de_una_vuelta_completa_queda_a_menos_de_2_por_ciento_del_circuito(cargador):
    for piloto, vuelta in [(LEC, 20), (VER, 11)]:
        tel = telemetria_de_vuelta(cargador, CLASIFICACION, piloto, vuelta)

        distancia = tel["distancia_m"].iloc[-1]
        assert distancia == pytest.approx(LONGITUD_MONZA_M, rel=0.02)


def test_la_distancia_empieza_en_cero_y_nunca_baja(cargador):
    tel = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)

    assert tel["distancia_m"].iloc[0] == 0
    assert tel["distancia_m"].is_monotonic_increasing


def test_todas_las_muestras_tienen_posicion(cargador):
    tel = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)

    assert not tel[["x", "y"]].isna().any().any()


def test_los_canales_de_conduccion_son_los_de_openf1_en_espanol(cargador):
    tel = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)

    assert tel["velocidad"].max() == 351
    assert tel["marcha"].between(1, 8).all()
    assert tel["acelerador"].between(0, 100).all()
    assert set(tel["freno"]) <= {0, 100}


def test_una_vuelta_sin_tiempo_oficial_lanza_sin_telemetria(cargador):
    # La vuelta 1 es la salida de pits: OpenF1 no le da tiempo.
    assert codigo_de(telemetria_de_vuelta, cargador, CLASIFICACION, LEC, 1) == "sin_telemetria"


def test_una_vuelta_que_no_existe_lanza_sin_telemetria(cargador):
    assert codigo_de(telemetria_de_vuelta, cargador, CLASIFICACION, LEC, 500) == "sin_telemetria"


def test_una_vuelta_sin_datos_de_coche_lanza_sin_telemetria(cargador):
    # En el fixture solo hay telemetría de la mejor vuelta de cada piloto.
    assert codigo_de(telemetria_de_vuelta, cargador, CLASIFICACION, LEC, 14) == "sin_telemetria"


def test_una_vuelta_con_solo_una_muestra_suelta_lanza_telemetria_incompleta(cargador):
    # La vuelta 19 termina donde empieza la 20: del fixture solo le cae una muestra.
    assert (
        codigo_de(telemetria_de_vuelta, cargador, CLASIFICACION, LEC, 19) == "telemetria_incompleta"
    )


def test_un_piloto_que_no_corrio_lanza_piloto_no_encontrado(cargador):
    assert (
        codigo_de(telemetria_de_vuelta, cargador, CLASIFICACION, 99, 20) == "piloto_no_encontrado"
    )


def test_muy_pocas_muestras_lanza_telemetria_incompleta(cargador, openf1):
    openf1.datos["car_data"] = [
        fila for i, fila in enumerate(openf1.datos["car_data"]) if i % 4 == 0
    ]

    assert (
        codigo_de(telemetria_de_vuelta, cargador, CLASIFICACION, LEC, 20) == "telemetria_incompleta"
    )


def test_un_hueco_largo_en_la_telemetria_lanza_telemetria_incompleta(cargador, openf1):
    lec = [f for f in openf1.datos["car_data"] if f["driver_number"] == LEC]
    resto = [f for f in openf1.datos["car_data"] if f["driver_number"] != LEC]
    # Se borran ~3 s seguidos en medio de la vuelta, pero quedan muestras de sobra.
    sin_hueco = lec[:100] + lec[112:]
    openf1.datos["car_data"] = sin_hueco + resto

    assert (
        codigo_de(telemetria_de_vuelta, cargador, CLASIFICACION, LEC, 20) == "telemetria_incompleta"
    )


# --- vuelta_rapida -------------------------------------------------------------------


def test_vuelta_rapida_de_toda_la_sesion(cargador):
    assert vuelta_rapida(cargador, CLASIFICACION, LEC) == 20
    assert vuelta_rapida(cargador, CLASIFICACION, VER) == 11


def test_vuelta_rapida_por_segmento_de_la_clasificacion(cargador):
    assert vuelta_rapida(cargador, CLASIFICACION, LEC, "Q1") == 2
    assert vuelta_rapida(cargador, CLASIFICACION, LEC, "Q2") == 11
    assert vuelta_rapida(cargador, CLASIFICACION, LEC, "Q3") == 20


def test_la_mejor_vuelta_de_verstappen_fue_en_q2_y_no_en_q3(cargador):
    # Es el caso que motivó los segmentos: la mejor de la sesión no está en Q3.
    assert vuelta_rapida(cargador, CLASIFICACION, VER) == vuelta_rapida(
        cargador, CLASIFICACION, VER, "Q2"
    )
    assert vuelta_rapida(cargador, CLASIFICACION, VER, "Q3") == 17


def test_la_vuelta_rapida_nunca_es_una_salida_de_pits(cargador):
    vueltas = cargador.vueltas(CLASIFICACION, LEC)
    salidas = set(vueltas.loc[vueltas["salida_pits"], "vuelta"])

    assert vuelta_rapida(cargador, CLASIFICACION, LEC) not in salidas


def test_segmento_de_clasificacion_en_una_carrera_no_esta_disponible(cargador):
    assert codigo_de(vuelta_rapida, cargador, CARRERA, LEC, "Q1") == "analisis_no_disponible"


def test_segmento_sprint_en_una_clasificacion_normal_no_esta_disponible(cargador):
    assert codigo_de(vuelta_rapida, cargador, CLASIFICACION, LEC, "SQ1") == "analisis_no_disponible"


def test_un_segmento_desconocido_no_esta_disponible(cargador):
    assert codigo_de(vuelta_rapida, cargador, CLASIFICACION, LEC, "Q4") == "analisis_no_disponible"


def test_vuelta_rapida_de_un_piloto_que_no_corrio(cargador):
    assert codigo_de(vuelta_rapida, cargador, CLASIFICACION, 99) == "piloto_no_encontrado"
