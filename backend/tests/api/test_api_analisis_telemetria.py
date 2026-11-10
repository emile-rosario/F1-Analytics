from datetime import UTC, datetime

import pytest
from conftest import CARRERA, CLASIFICACION, LEC, VER, crear_cargador, crear_cliente

from f1analytics.api.dependencias import obtener_limitador_concurrencia, obtener_limitador_ip
from f1analytics.api.limites import LimitadorConcurrencia, LimitadorPorIp
from f1analytics.datos.circuitos import SIN_DATOS

RUTA = "/api/analisis/telemetria"

# Los fixtures solo tienen la telemetría de la mejor vuelta de la sesión de cada piloto.
DURACION_LEC_S = 79.461  # vuelta 20
DURACION_VER_S = 79.662  # vuelta 11


def pedir(cliente, a=LEC, b=VER, sesion=CLASIFICACION, **extra):
    params = {"sesion": sesion, "piloto_a": a, "piloto_b": b, **extra.pop("params", {})}
    return cliente.get(RUTA, params=params, **extra)


def pedidos_de_telemetria(openf1) -> int:
    return sum(1 for url in openf1.pedidos if url.path.endswith(("/car_data", "/location")))


# --- el análisis ---------------------------------------------------------------------


def test_devuelve_la_comparacion_con_canales_minisectores_y_resumen(cliente):
    respuesta = pedir(cliente)

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert set(datos) == {
        "sesion",
        "segmento",
        "piloto_a",
        "piloto_b",
        "longitud_m",
        "paso_m",
        "canales",
        "curvas",
        "minisectores",
        "resumen",
    }
    assert datos["sesion"] == CLASIFICACION
    assert datos["segmento"] is None
    assert datos["paso_m"] == 5
    assert (datos["piloto_a"]["piloto"]["codigo"], datos["piloto_a"]["vuelta"]) == ("LEC", 20)
    assert (datos["piloto_b"]["piloto"]["codigo"], datos["piloto_b"]["vuelta"]) == ("VER", 11)
    assert datos["piloto_a"]["tiempo_vuelta_s"] == pytest.approx(DURACION_LEC_S)
    assert datos["piloto_b"]["tiempo_vuelta_s"] == pytest.approx(DURACION_VER_S)
    assert [c["etiqueta"] for c in datos["curvas"]] == [str(n) for n in range(1, 12)]


def test_los_canales_son_columnas_del_mismo_largo_cada_5_metros(cliente):
    canales = pedir(cliente).json()["canales"]

    assert set(canales) == {
        "distancia_m",
        "velocidad_a",
        "velocidad_b",
        "acelerador_a",
        "acelerador_b",
        "freno_a",
        "freno_b",
        "delta_s",
        "x",
        "y",
    }
    largos = {len(columna) for columna in canales.values()}
    assert len(largos) == 1
    assert largos.pop() > 1000
    distancia = canales["distancia_m"]
    assert distancia[0] == 0
    assert distancia == sorted(distancia)
    assert max(b - a for a, b in zip(distancia, distancia[1:], strict=False)) <= 5.0 + 1e-6


def test_el_delta_empieza_en_cero_y_termina_en_la_diferencia_oficial(cliente):
    delta = pedir(cliente).json()["canales"]["delta_s"]

    assert delta[0] == 0
    assert delta[-1] == pytest.approx(DURACION_VER_S - DURACION_LEC_S, abs=1e-9)


def test_intercambiar_los_pilotos_cambia_el_signo_del_delta(cliente):
    ab = pedir(cliente, LEC, VER).json()
    ba = pedir(cliente, VER, LEC).json()

    assert ab["resumen"]["delta_final_s"] == pytest.approx(-ba["resumen"]["delta_final_s"])
    assert ab["resumen"]["ganador"] == "a"
    assert ba["resumen"]["ganador"] == "b"


def test_los_tipos_van_compactos_en_el_json(cliente):
    canales = pedir(cliente).json()["canales"]

    assert all(isinstance(v, int) for v in canales["velocidad_a"] + canales["velocidad_b"])
    assert all(isinstance(v, int) for v in canales["acelerador_a"])
    assert all(isinstance(v, bool) for v in canales["freno_a"] + canales["freno_b"])
    assert any(canales["freno_a"]) and not all(canales["freno_a"])
    assert max(canales["velocidad_a"]) == pytest.approx(351, abs=3)


def test_hay_25_minisectores_y_sus_diferencias_suman_el_delta_final(cliente):
    datos = pedir(cliente).json()

    sectores = datos["minisectores"]
    assert [s["sector"] for s in sectores] == list(range(25))
    assert sectores[0]["inicio_m"] == 0
    assert {s["ganador"] for s in sectores} <= {"a", "b", "empate"}
    assert sum(s["diferencia_s"] for s in sectores) == pytest.approx(
        datos["resumen"]["delta_final_s"], abs=0.03
    )


def test_el_resumen_es_coherente_con_los_minisectores(cliente):
    datos = pedir(cliente).json()
    resumen = datos["resumen"]

    cuenta = {
        k: sum(s["ganador"] == k for s in datos["minisectores"]) for k in ("a", "b", "empate")
    }
    assert resumen["sectores_ganados"] == cuenta
    assert isinstance(resumen["vel_maxima"]["a"]["kmh"], int)
    assert set(resumen["pct_a_fondo"]) == {"a", "b"}
    for letra in "ab":
        ventaja = resumen["mayor_ventaja"][letra]
        assert (ventaja is None) == (cuenta[letra] == 0)


def test_el_mapa_llega_girado_y_con_las_curvas_en_el_mismo_sistema(cliente):
    datos = pedir(cliente).json()

    xs, ys = datos["canales"]["x"], datos["canales"]["y"]
    # Sin girar, Monza es más alto que ancho; con la rotación de la transmisión queda apaisado.
    assert max(xs) - min(xs) > max(ys) - min(ys)
    for curva in datos["curvas"]:
        assert min(xs) - 1000 <= curva["x"] <= max(xs) + 1000
        assert min(ys) - 1000 <= curva["y"] <= max(ys) + 1000


def test_la_respuesta_va_comprimida_con_gzip(cliente):
    respuesta = pedir(cliente, headers={"Accept-Encoding": "gzip"})

    assert respuesta.headers["content-encoding"] == "gzip"
    assert respuesta.json()["piloto_a"]["piloto"]["codigo"] == "LEC"


def test_el_segmento_se_pasa_a_la_eleccion_de_la_vuelta(cliente, monkeypatch):
    pedidos = []

    def vuelta_falsa(_cargador, _sesion, piloto, segmento=None):
        pedidos.append((piloto, segmento))
        return {LEC: 20, VER: 11}[piloto]

    monkeypatch.setattr("f1analytics.api.rutas.telemetria.vuelta_rapida", vuelta_falsa)

    datos = pedir(cliente, params={"segmento": "Q3"}).json()

    assert pedidos == [(LEC, "Q3"), (VER, "Q3")]
    assert datos["segmento"] == "Q3"


def test_un_segmento_cuya_vuelta_no_tiene_telemetria_da_404(cliente):
    # La mejor vuelta de VER en la Q3 es la 17 y el fixture no trae su telemetría.
    respuesta = pedir(cliente, params={"segmento": "Q3"})

    assert codigo_y_estado(respuesta) == (404, "sin_telemetria")


# --- errores -------------------------------------------------------------------------


def codigo_y_estado(respuesta):
    return respuesta.status_code, respuesta.json()["codigo"]


def test_una_sesion_que_no_existe_da_404(cliente):
    assert codigo_y_estado(pedir(cliente, sesion=1)) == (404, "sesion_no_encontrada")


@pytest.mark.parametrize("a,b", [(99, VER), (LEC, 99)])
def test_un_piloto_que_no_corrio_da_404_sin_bajar_telemetria(cliente, openf1, a, b):
    assert codigo_y_estado(pedir(cliente, a, b)) == (404, "piloto_no_encontrado")
    assert pedidos_de_telemetria(openf1) == 0


def test_dos_veces_el_mismo_piloto_da_422_parametro_invalido(cliente, openf1):
    assert codigo_y_estado(pedir(cliente, LEC, LEC)) == (422, "parametro_invalido")
    assert openf1.pedidos == []


def test_una_sesion_sin_terminar_da_409(openf1, tmp_path):
    # La clasificación de Monza termina el 2024-08-31 a las 15:00 UTC.
    cargador = crear_cargador(tmp_path, datetime(2024, 8, 31, 14, 30, tzinfo=UTC))

    respuesta = pedir(crear_cliente(cargador))

    assert codigo_y_estado(respuesta) == (409, "sesion_no_terminada")
    assert pedidos_de_telemetria(openf1) == 0


def test_un_circuito_que_no_esta_en_circuitos_json_se_compara_sin_curvas(cliente, monkeypatch):
    # Se simula un circuito nuevo con las vueltas de Monza.
    monkeypatch.setattr(
        "f1analytics.api.rutas.telemetria.circuito_o_sin_datos", lambda *_: SIN_DATOS
    )

    respuesta = pedir(cliente)

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["curvas"] == []
    # La comparación entera sigue ahí: el delta, los 25 minisectores y el resumen.
    assert datos["resumen"]["delta_final_s"] == pytest.approx(0.201, abs=0.001)
    assert len(datos["minisectores"]) == 25
    assert len(datos["canales"]["delta_s"]) == len(datos["canales"]["distancia_m"])
    # El largo es el de las vueltas alineadas (no hay oficial).
    assert datos["longitud_m"] == pytest.approx(datos["canales"]["distancia_m"][-1], abs=0.1)


def test_un_circuito_sin_datos_no_gira_el_mapa_de_la_comparacion(cliente, monkeypatch):
    monkeypatch.setattr(
        "f1analytics.api.rutas.telemetria.circuito_o_sin_datos", lambda *_: SIN_DATOS
    )

    canales = pedir(cliente).json()["canales"]

    ancho = max(canales["x"]) - min(canales["x"])
    alto = max(canales["y"]) - min(canales["y"])
    # Con los 95° de la transmisión Monza queda apaisado; sin girar es más alto que ancho.
    assert alto > ancho


def test_un_segmento_de_clasificacion_en_una_carrera_da_422_sin_bajar_telemetria(cliente, openf1):
    respuesta = pedir(cliente, sesion=CARRERA, params={"segmento": "Q1"})

    assert codigo_y_estado(respuesta) == (422, "analisis_no_disponible")
    assert pedidos_de_telemetria(openf1) == 0


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"sesion": CLASIFICACION, "piloto_a": LEC},
        {"sesion": CLASIFICACION, "piloto_b": VER},
        {"piloto_a": LEC, "piloto_b": VER},
        {"sesion": "abc", "piloto_a": LEC, "piloto_b": VER},
        {"sesion": 0, "piloto_a": LEC, "piloto_b": VER},
        {"sesion": CLASIFICACION, "piloto_a": -4, "piloto_b": VER},
        {"sesion": CLASIFICACION, "piloto_a": LEC, "piloto_b": VER, "segmento": "Q4"},
        {"sesion": CLASIFICACION, "piloto_a": LEC, "piloto_b": VER, "segmento": "q3"},
    ],
)
def test_parametros_que_faltan_o_no_valen_dan_422_parametro_invalido(cliente, params):
    respuesta = cliente.get(RUTA, params=params)

    assert codigo_y_estado(respuesta) == (422, "parametro_invalido")


# --- límites -------------------------------------------------------------------------


def con_limite(cliente, maximo: int):
    limitador = LimitadorPorIp(maximo=maximo)
    cliente.app.dependency_overrides[obtener_limitador_ip] = lambda: limitador
    return cliente


def test_sin_cupo_responde_429_sin_pedir_telemetria(cliente, openf1):
    respuesta = pedir(con_limite(cliente, 0))

    assert codigo_y_estado(respuesta) == (429, "limite_peticiones")
    assert pedidos_de_telemetria(openf1) == 0


def test_un_analisis_que_pide_cuatro_canales_cuenta_una_sola_vez(cliente, openf1):
    # car_data y location de cada piloto son 4 pedidos pesados, pero un solo cupo.
    respuesta = pedir(con_limite(cliente, 1))

    assert respuesta.status_code == 200
    assert pedidos_de_telemetria(openf1) == 4


def test_las_respuestas_en_cache_no_cuentan_para_el_limite(cliente, openf1):
    con_limite(cliente, 1)
    assert pedir(cliente).status_code == 200  # pide a OpenF1: gasta el único cupo
    antes = pedidos_de_telemetria(openf1)

    for _ in range(3):
        assert pedir(cliente).status_code == 200  # sale de la caché

    assert pedidos_de_telemetria(openf1) == antes


def test_un_analisis_que_falla_antes_de_pedir_telemetria_no_gasta_cupo(cliente):
    con_limite(cliente, 1)
    assert pedir(cliente, 99, VER).status_code == 404

    assert pedir(cliente).status_code == 200


def test_el_analisis_pasa_por_el_limitador_de_concurrencia(cliente):
    entradas = []

    class Registrador(LimitadorConcurrencia):
        def turno(self):
            entradas.append("turno")
            return super().turno()

    cliente.app.dependency_overrides[obtener_limitador_concurrencia] = lambda: Registrador(1)

    assert pedir(cliente).status_code == 200
    assert entradas == ["turno"]
