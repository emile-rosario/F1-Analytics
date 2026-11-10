from collections import namedtuple
from datetime import UTC, datetime

import pytest
from conftest import CARRERA, CARRERA_ESPANA, CLASIFICACION, crear_cargador, crear_cliente

from f1analytics.api.dependencias import obtener_limitador_concurrencia, obtener_limitador_ip
from f1analytics.api.limites import LimitadorConcurrencia, LimitadorPorIp
from f1analytics.api.rutas.gomas import _ajuste

RUTA = "/api/analisis/gomas"
VER, NOR, LEC, HAM, SAI, PIA = 1, 4, 16, 44, 55, 81


def pedir(cliente, sesion=CARRERA_ESPANA, pilotos=None, **extra):
    params = {"sesion": sesion}
    if pilotos is not None:
        params["pilotos"] = pilotos
    return cliente.get(RUTA, params=params, **extra)


def pedidos_de_vueltas(openf1) -> int:
    return sum(1 for url in openf1.pedidos if url.path.endswith("/laps"))


def codigo_y_estado(respuesta):
    return respuesta.status_code, respuesta.json()["codigo"]


# --- la respuesta --------------------------------------------------------------------


def test_devuelve_estrategias_vueltas_degradacion_y_resumen(cliente):
    respuesta = pedir(cliente)

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert set(datos) == {
        "sesion",
        "n_vueltas",
        "segundos_combustible_por_vuelta",
        "estrategias",
        "pilotos_elegidos",
        "vueltas",
        "degradacion",
        "compuestos",
        "resumen",
        "resumen_sin_corregir",
    }
    assert datos["sesion"] == CARRERA_ESPANA
    assert datos["n_vueltas"] == 66
    assert datos["segundos_combustible_por_vuelta"] == 0.06


def test_las_estrategias_son_de_los_20_pilotos_ordenadas_por_posicion_final(cliente):
    estrategias = pedir(cliente).json()["estrategias"]

    assert len(estrategias) == 20
    assert [e["piloto"]["codigo"] for e in estrategias[:3]] == ["VER", "NOR", "HAM"]
    assert [e["posicion"] for e in estrategias] == list(range(1, 21))
    verstappen = estrategias[0]
    assert verstappen["piloto"]["equipo"] == "Red Bull Racing"
    assert [
        (s["compuesto"], s["vuelta_inicio"], s["vuelta_fin"]) for s in verstappen["stints"]
    ] == [
        ("SOFT", 1, 17),
        ("MEDIUM", 18, 44),
        ("SOFT", 45, 66),
    ]
    assert verstappen["stints"][0]["edad_inicial"] == 3  # unas blandas ya usadas


def test_sin_pilotos_usa_el_podio_y_manda_solo_sus_vueltas(cliente):
    datos = pedir(cliente).json()

    assert datos["pilotos_elegidos"] == [VER, NOR, HAM]
    assert {v["piloto"] for v in datos["vueltas"]} == {VER, NOR, HAM}
    primera = datos["vueltas"][0]
    assert set(primera) == {
        "piloto",
        "vuelta",
        "stint",
        "compuesto",
        "edad_goma",
        "tiempo_s",
        "tiempo_corregido_s",
    }
    assert primera["vuelta"] >= 2  # la vuelta 1 se descarta


def test_los_pilotos_elegidos_mantienen_el_orden_y_no_se_repiten(cliente):
    respuesta = cliente.get(RUTA, params={"sesion": CARRERA_ESPANA, "pilotos": [LEC, PIA, LEC]})

    datos = respuesta.json()
    assert datos["pilotos_elegidos"] == [LEC, PIA]
    assert [v["piloto"] for v in datos["vueltas"]][0] == LEC
    assert {v["piloto"] for v in datos["vueltas"]} == {LEC, PIA}
    # El análisis de toda la carrera no depende de a quién se elija.
    assert len(datos["estrategias"]) == 20


def test_la_degradacion_es_de_todos_los_stints_de_los_pilotos_con_vueltas(cliente):
    degradacion = pedir(cliente).json()["degradacion"]

    assert len(degradacion) == 18  # los fixtures traen las vueltas de 6 pilotos
    assert not any(d["insuficiente"] for d in degradacion)
    assert {d["piloto"] for d in degradacion} == {VER, NOR, LEC, HAM, SAI, PIA}


def test_cada_stint_trae_el_ajuste_con_y_sin_correccion_de_combustible(cliente):
    degradacion = pedir(cliente).json()["degradacion"]

    for stint in degradacion:
        con, sin = stint["corregido"], stint["sin_corregir"]
        assert set(con) == {"pendiente_s_por_vuelta", "intercepto", "r2"}
        # Corregir por combustible suma lo que el coche ganó por aligerarse: 0,06 s por vuelta.
        assert con["pendiente_s_por_vuelta"] - sin["pendiente_s_por_vuelta"] == pytest.approx(
            0.06, abs=0.001
        )


def test_los_compuestos_se_comparan_con_y_sin_correccion(cliente):
    compuestos = pedir(cliente).json()["compuestos"]

    assert [c["compuesto"] for c in compuestos] == ["SOFT", "MEDIUM", "HARD"]
    blanda = compuestos[0]
    assert blanda["n_stints"] == 11
    assert blanda["pendiente_s_por_vuelta"] > blanda["pendiente_sin_corregir_s_por_vuelta"]
    assert blanda["pendiente_s_por_vuelta"] > compuestos[1]["pendiente_s_por_vuelta"]


def test_los_resumenes_nombran_la_blanda_y_se_calculan_con_y_sin_correccion(cliente):
    datos = pedir(cliente).json()

    con, sin = datos["resumen"], datos["resumen_sin_corregir"]
    assert con["compuesto_mas_degradante"]["compuesto"] == "SOFT"
    assert sin["compuesto_mas_degradante"]["compuesto"] == "SOFT"
    assert (
        con["compuesto_mas_degradante"]["pendiente_s_por_vuelta"]
        > sin["compuesto_mas_degradante"]["pendiente_s_por_vuelta"]
    )
    assert con["n_stints_validos"] == 18
    assert con["stint_mas_largo"]["vueltas"] >= 30


def test_la_respuesta_va_comprimida_con_gzip(cliente):
    respuesta = pedir(cliente, headers={"Accept-Encoding": "gzip"})

    assert respuesta.headers["content-encoding"] == "gzip"
    assert respuesta.json()["n_vueltas"] == 66


def test_otra_carrera_con_un_abandono_marca_a_quien_se_retira(cliente):
    estrategias = pedir(cliente, sesion=CARRERA).json()["estrategias"]

    abandonos = [e for e in estrategias if e["abandono"]]
    assert abandonos
    assert all(e["posicion"] is None for e in abandonos)
    assert estrategias[-1]["abandono"]  # los que abandonan van al final


def test_un_ajuste_insuficiente_no_trae_recta():
    fila = namedtuple("Fila", "insuficiente pendiente_s_por_vuelta intercepto r2")(
        True, float("nan"), float("nan"), float("nan")
    )

    assert _ajuste(fila) is None


# --- errores -------------------------------------------------------------------------


def test_una_sesion_que_no_existe_da_404(cliente):
    assert codigo_y_estado(pedir(cliente, sesion=1)) == (404, "sesion_no_encontrada")


def test_una_clasificacion_no_tiene_analisis_de_gomas(cliente, openf1):
    assert codigo_y_estado(pedir(cliente, sesion=CLASIFICACION)) == (422, "analisis_no_disponible")
    assert pedidos_de_vueltas(openf1) == 0


def test_una_carrera_sin_terminar_da_409_sin_bajar_las_vueltas(openf1, tmp_path):
    cargador = crear_cargador(tmp_path, datetime(2024, 6, 23, 14, 0, tzinfo=UTC))

    respuesta = pedir(crear_cliente(cargador))

    assert codigo_y_estado(respuesta) == (409, "sesion_no_terminada")
    assert pedidos_de_vueltas(openf1) == 0


def test_un_piloto_que_no_corrio_da_404(cliente):
    assert codigo_y_estado(pedir(cliente, pilotos=[VER, 99])) == (404, "piloto_no_encontrado")


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"sesion": 0},
        {"sesion": CARRERA_ESPANA, "pilotos": [1, 4, 16, 44]},  # más de tres
        {"sesion": CARRERA_ESPANA, "pilotos": 0},
        {"sesion": CARRERA_ESPANA, "pilotos": -4},
        {"sesion": CARRERA_ESPANA, "pilotos": "abc"},
    ],
)
def test_parametros_que_faltan_o_no_valen_dan_422_parametro_invalido(cliente, params):
    respuesta = cliente.get(RUTA, params=params)

    assert codigo_y_estado(respuesta) == (422, "parametro_invalido")


# --- límites -------------------------------------------------------------------------


@pytest.fixture
def con_limite_de_uno(cliente):
    limitador = LimitadorPorIp(maximo=1)
    cliente.app.dependency_overrides[obtener_limitador_ip] = lambda: limitador
    return cliente


def test_pasado_el_limite_por_ip_responde_429_sin_pedir_mas_vueltas(con_limite_de_uno, openf1):
    assert pedir(con_limite_de_uno).status_code == 200
    antes = pedidos_de_vueltas(openf1)

    respuesta = pedir(con_limite_de_uno, sesion=CARRERA)

    assert codigo_y_estado(respuesta) == (429, "limite_peticiones")
    assert pedidos_de_vueltas(openf1) == antes


def test_las_respuestas_en_cache_no_cuentan_para_el_limite(con_limite_de_uno, openf1):
    assert pedir(con_limite_de_uno).status_code == 200  # pide las vueltas: gasta el único cupo
    antes = pedidos_de_vueltas(openf1)

    for pilotos in ([LEC], [PIA, SAI], None):
        assert pedir(con_limite_de_uno, pilotos=pilotos).status_code == 200

    assert pedidos_de_vueltas(openf1) == antes


def test_un_error_antes_de_pedir_las_vueltas_no_gasta_cupo(con_limite_de_uno):
    assert pedir(con_limite_de_uno, sesion=CLASIFICACION).status_code == 422

    assert pedir(con_limite_de_uno).status_code == 200


def test_con_el_servidor_saturado_responde_503_sin_pedir_nada_a_openf1(cliente, openf1):
    # Un solo análisis a la vez y ninguno puede esperar: con el hueco ocupado, se rechaza.
    saturado = LimitadorConcurrencia(maximo=1, max_en_espera=0)
    cliente.app.dependency_overrides[obtener_limitador_concurrencia] = lambda: saturado

    with saturado.turno():
        respuesta = pedir(cliente)

    assert codigo_y_estado(respuesta) == (503, "servidor_ocupado")
    assert respuesta.headers["retry-after"] == "10"
    assert pedidos_de_vueltas(openf1) == 0


def test_el_analisis_pasa_por_el_limitador_de_concurrencia(cliente):
    entradas = []

    class Registrador(LimitadorConcurrencia):
        def turno(self):
            entradas.append("turno")
            return super().turno()

    cliente.app.dependency_overrides[obtener_limitador_concurrencia] = lambda: Registrador(1)

    assert pedir(cliente).status_code == 200
    assert entradas == ["turno"]
