from datetime import UTC, datetime

import pandas as pd
import pytest
from conftest import CARRERA, CLASIFICACION, EVENTO_MONZA, LEC, crear_cargador

from f1analytics.datos.errores import ErrorDatos


def test_calendario_trae_los_grandes_premios_sin_la_pretemporada(cargador):
    calendario = cargador.calendario(2024)

    assert len(calendario) == 24
    assert not calendario["nombre"].str.contains("Testing").any()
    assert calendario.iloc[0]["nombre"] == "Bahrain Grand Prix"
    assert calendario["inicio"].is_monotonic_increasing
    assert {"evento", "pais", "circuito", "circuito_clave"} <= set(calendario.columns)


def test_sesiones_de_monza_en_orden_y_terminadas(cargador):
    sesiones = cargador.sesiones(2024, EVENTO_MONZA)

    assert list(sesiones["nombre"]) == [
        "Practice 1",
        "Practice 2",
        "Practice 3",
        "Qualifying",
        "Race",
    ]
    assert sesiones["terminada"].all()


def test_sesiones_no_incluye_la_pretemporada(cargador):
    assert cargador.sesiones(2024, 1228).empty


def test_una_sesion_en_curso_no_figura_como_terminada(openf1, tmp_path):
    # La clasificación de Monza fue el 31/08/2024 entre las 14:00 y las 15:00 UTC.
    en_curso = crear_cargador(tmp_path, datetime(2024, 8, 31, 14, 30, tzinfo=UTC))

    sesiones = en_curso.sesiones(2024, EVENTO_MONZA).set_index("nombre")

    assert not sesiones.loc["Qualifying", "terminada"]
    assert not sesiones.loc["Race", "terminada"]
    assert sesiones.loc["Practice 1", "terminada"]


def test_buscar_sesion_devuelve_el_session_key(cargador):
    assert cargador.buscar_sesion(2024, EVENTO_MONZA, "Qualifying") == CLASIFICACION
    assert cargador.buscar_sesion(2024, EVENTO_MONZA, "Race") == CARRERA


def test_buscar_una_sesion_que_no_hay_lanza_sesion_no_encontrada(cargador):
    with pytest.raises(ErrorDatos) as error:
        cargador.buscar_sesion(2024, EVENTO_MONZA, "Sprint")

    assert error.value.codigo == "sesion_no_encontrada"


def test_info_de_una_sesion_inexistente_lanza_sesion_no_encontrada(cargador):
    with pytest.raises(ErrorDatos) as error:
        cargador.info_sesion(999999)

    assert error.value.codigo == "sesion_no_encontrada"


def test_pilotos_en_espanol_con_el_color_del_equipo(cargador):
    pilotos = cargador.pilotos(CLASIFICACION)

    assert len(pilotos) == 20
    leclerc = pilotos[pilotos["numero"] == LEC].iloc[0]
    assert leclerc["codigo"] == "LEC"
    assert leclerc["equipo"] == "Ferrari"
    assert leclerc["color"] == "#E80020"


def test_vueltas_de_un_piloto(cargador):
    vueltas = cargador.vueltas(CLASIFICACION, LEC)

    assert list(vueltas.columns) == [
        "piloto",
        "vuelta",
        "inicio",
        "tiempo_vuelta_s",
        "sector_1_s",
        "sector_2_s",
        "sector_3_s",
        "salida_pits",
    ]
    assert set(vueltas["piloto"]) == {LEC}
    assert vueltas["inicio"].dt.tz is not None
    mejor = vueltas.loc[vueltas["tiempo_vuelta_s"].idxmin()]
    assert (mejor["vuelta"], mejor["tiempo_vuelta_s"]) == (20, 79.461)
    assert vueltas["salida_pits"].dtype == bool
    assert vueltas.loc[vueltas["vuelta"] == 1, "salida_pits"].iloc[0]


def test_las_vueltas_sin_tiempo_quedan_como_nulas(cargador):
    vueltas = cargador.vueltas(CLASIFICACION, LEC)

    assert vueltas["tiempo_vuelta_s"].isna().sum() == 2


def test_vueltas_de_un_piloto_que_no_corrio_es_una_tabla_vacia(cargador):
    assert cargador.vueltas(CLASIFICACION, 99).empty


def test_stints_en_espanol(cargador):
    stints = cargador.stints(CARRERA)

    assert list(stints.columns) == [
        "piloto",
        "stint",
        "compuesto",
        "vuelta_inicio",
        "vuelta_fin",
        "edad_inicial",
    ]
    assert len(stints) == 50
    assert set(stints["compuesto"]) <= {"SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"}


def test_paradas_en_espanol(cargador):
    paradas = cargador.paradas(CARRERA)

    assert list(paradas.columns) == ["piloto", "vuelta", "fecha", "duracion_s"]
    assert len(paradas) == 30
    assert paradas["fecha"].dt.tz is not None


def test_direccion_de_carrera_incluye_la_fase_de_la_clasificacion(cargador):
    direccion = cargador.direccion_carrera(CLASIFICACION)

    assert len(direccion) == 36
    assert direccion["fecha"].is_monotonic_increasing
    assert set(direccion["fase_clasificacion"].dropna()) == {1, 2, 3}


def test_una_sesion_terminada_se_guarda_en_cache(cargador, openf1):
    cargador.pilotos(CLASIFICACION)
    pedidos_a_drivers = len([u for u in openf1.pedidos if u.path.endswith("/drivers")])

    cargador.pilotos(CLASIFICACION)

    assert len([u for u in openf1.pedidos if u.path.endswith("/drivers")]) == pedidos_a_drivers


def test_una_sesion_en_curso_no_se_guarda_en_cache(openf1, tmp_path):
    en_curso = crear_cargador(tmp_path, datetime(2024, 8, 31, 14, 30, tzinfo=UTC))

    en_curso.pilotos(CLASIFICACION)
    en_curso.pilotos(CLASIFICACION)

    drivers = [u for u in openf1.pedidos if u.path.endswith("/drivers")]
    assert len(drivers) == 2
    assert not list(tmp_path.rglob("*.parquet"))


def test_la_fecha_de_fin_se_compara_con_el_reloj_inyectado(cargador):
    fin = cargador.info_sesion(CLASIFICACION)["fin"]

    assert fin == pd.Timestamp("2024-08-31T15:00:00+00:00")
