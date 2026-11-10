from datetime import UTC, datetime

import pytest
from conftest import CLASIFICACION, LEC, VER, crear_cargador, crear_cliente

from f1analytics.api.dependencias import obtener_limitador_concurrencia, obtener_limitador_ip
from f1analytics.api.limites import LimitadorConcurrencia, LimitadorPorIp
from f1analytics.datos.telemetria_vuelta import telemetria_de_vuelta

RUTA = "/api/analisis/circuito"


def pedir(cliente, piloto=LEC, sesion=CLASIFICACION, **extra):
    return cliente.get(RUTA, params={"sesion": sesion, "piloto": piloto}, **extra)


def pedidos_de_telemetria(openf1) -> int:
    return sum(1 for url in openf1.pedidos if url.path.endswith(("/car_data", "/location")))


# --- el análisis ---------------------------------------------------------------------


def test_devuelve_la_vuelta_mas_rapida_con_curvas_frenadas_y_resumen(cliente):
    respuesta = pedir(cliente)

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert set(datos) == {
        "sesion",
        "piloto",
        "vuelta",
        "tiempo_vuelta_s",
        "longitud_m",
        "puntos",
        "curvas",
        "frenadas",
        "resumen",
    }
    assert datos["sesion"] == CLASIFICACION
    assert datos["piloto"]["codigo"] == "LEC"
    assert datos["piloto"]["numero"] == LEC
    assert datos["vuelta"] == 20
    assert 70 < datos["tiempo_vuelta_s"] < 90
    assert datos["longitud_m"] == pytest.approx(5764.7)
    assert len(datos["puntos"]) > 200
    assert set(datos["puntos"][0]) == {"x", "y", "velocidad", "marcha", "distancia_m"}
    assert [c["etiqueta"] for c in datos["curvas"]] == [str(n) for n in range(1, 12)]


def test_las_frenadas_incluyen_la_curva_1_y_el_resumen_la_marca_como_la_mas_fuerte(cliente):
    datos = pedir(cliente).json()

    curvas_con_frenada = [f["curva"] for f in datos["frenadas"]]
    assert 1 in curvas_con_frenada
    assert datos["resumen"]["frenada_mas_fuerte"]["curva"] == 1
    assert datos["resumen"]["vel_maxima"]["kmh"] == 351
    assert 60 < datos["resumen"]["pct_a_fondo"] < 95


def test_las_velocidades_van_enteras_en_el_json(cliente):
    datos = pedir(cliente).json()

    frenada = datos["frenadas"][0]
    assert isinstance(frenada["vel_entrada"], int)
    assert isinstance(datos["resumen"]["vel_maxima"]["kmh"], int)
    assert isinstance(datos["puntos"][0]["velocidad"], int)


def test_el_mapa_llega_girado_como_en_la_transmision(cliente):
    puntos = pedir(cliente).json()["puntos"]

    ancho = max(p["x"] for p in puntos) - min(p["x"] for p in puntos)
    alto = max(p["y"] for p in puntos) - min(p["y"] for p in puntos)
    # Sin girar, Monza es más alto que ancho; con los 95° de la transmisión queda apaisado.
    assert ancho > alto


def test_las_curvas_y_los_puntos_comparten_el_mismo_sistema_de_coordenadas(cliente):
    datos = pedir(cliente).json()

    xs = [p["x"] for p in datos["puntos"]]
    ys = [p["y"] for p in datos["puntos"]]
    for curva in datos["curvas"]:
        assert min(xs) - 1000 <= curva["x"] <= max(xs) + 1000
        assert min(ys) - 1000 <= curva["y"] <= max(ys) + 1000


def test_la_respuesta_va_comprimida_con_gzip(cliente):
    respuesta = pedir(cliente, headers={"Accept-Encoding": "gzip"})

    assert respuesta.headers["content-encoding"] == "gzip"
    assert respuesta.json()["piloto"]["codigo"] == "LEC"


def test_otro_piloto_de_la_misma_sesion(cliente):
    datos = pedir(cliente, piloto=VER).json()

    assert datos["piloto"]["codigo"] == "VER"


# --- errores -------------------------------------------------------------------------


def codigo_y_estado(respuesta):
    return respuesta.status_code, respuesta.json()["codigo"]


def test_una_sesion_que_no_existe_da_404(cliente):
    assert codigo_y_estado(pedir(cliente, sesion=1)) == (404, "sesion_no_encontrada")


def test_un_piloto_que_no_corrio_da_404(cliente):
    assert codigo_y_estado(pedir(cliente, piloto=99)) == (404, "piloto_no_encontrado")


def test_una_sesion_sin_terminar_da_409(openf1, tmp_path):
    # La clasificación de Monza termina el 2024-08-31 a las 15:00 UTC.
    cargador = crear_cargador(tmp_path, datetime(2024, 8, 31, 14, 30, tzinfo=UTC))

    respuesta = pedir(crear_cliente(cargador))

    assert codigo_y_estado(respuesta) == (409, "sesion_no_terminada")
    assert pedidos_de_telemetria(openf1) == 0


@pytest.fixture
def sin_circuitos(monkeypatch):
    """Un circuitos.json vacío: el circuito del calendario (Monza) pasa a ser uno desconocido.

    Así se recorre la búsqueda real (clave entera del calendario contra claves de texto del JSON),
    en vez de sustituir la función de las rutas.
    """
    monkeypatch.setattr("f1analytics.datos.circuitos._leer", lambda: {"circuitos": {}})


def test_un_circuito_que_no_esta_en_circuitos_json_se_analiza_sin_curvas(cliente, sin_circuitos):
    # Se simula un circuito nuevo con la telemetría de Monza.

    respuesta = pedir(cliente)

    assert respuesta.status_code == 200
    datos = respuesta.json()
    assert datos["curvas"] == []
    assert datos["frenadas"] == []
    assert datos["resumen"]["frenada_mas_fuerte"] is None
    # Lo que no depende de las curvas sigue ahí.
    assert datos["resumen"]["vel_maxima"]["kmh"] == 351
    assert 60 < datos["resumen"]["pct_a_fondo"] < 95
    assert len(datos["puntos"]) > 200
    # El largo es el medido en la telemetría (no hay oficial).
    assert datos["longitud_m"] == pytest.approx(datos["puntos"][-1]["distancia_m"], abs=0.1)


def test_un_circuito_sin_datos_no_gira_el_mapa(cliente, cargador, sin_circuitos):
    puntos = pedir(cliente).json()["puntos"]

    crudo = telemetria_de_vuelta(cargador, CLASIFICACION, LEC, 20)
    # Las coordenadas llegan tal como las manda OpenF1, sin la rotación de la transmisión.
    assert [p["x"] for p in puntos] == pytest.approx(crudo["x"].round(1).tolist(), abs=0.05)
    assert [p["y"] for p in puntos] == pytest.approx(crudo["y"].round(1).tolist(), abs=0.05)


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"sesion": CLASIFICACION},
        {"piloto": LEC},
        {"sesion": "abc", "piloto": LEC},
        {"sesion": 0, "piloto": LEC},
        {"sesion": CLASIFICACION, "piloto": -4},
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


def test_pasado_el_limite_por_ip_responde_429_sin_pedir_mas_telemetria(con_limite_de_uno, openf1):
    assert pedir(con_limite_de_uno).status_code == 200
    antes = pedidos_de_telemetria(openf1)

    respuesta = pedir(con_limite_de_uno, piloto=VER)

    assert codigo_y_estado(respuesta) == (429, "limite_peticiones")
    assert pedidos_de_telemetria(openf1) == antes


def test_las_respuestas_en_cache_no_cuentan_para_el_limite(con_limite_de_uno, openf1):
    assert pedir(con_limite_de_uno).status_code == 200  # pide a OpenF1: gasta el único cupo
    antes = pedidos_de_telemetria(openf1)

    for _ in range(3):
        assert pedir(con_limite_de_uno).status_code == 200  # sale de la caché

    assert pedidos_de_telemetria(openf1) == antes


def test_un_analisis_que_pide_varios_canales_cuenta_una_sola_vez(cliente, openf1):
    limitador = LimitadorPorIp(maximo=2)
    cliente.app.dependency_overrides[obtener_limitador_ip] = lambda: limitador

    assert pedir(cliente).status_code == 200  # car_data y location: un solo cupo
    assert pedir(cliente, piloto=VER).status_code == 200


def test_cada_ip_tiene_su_cupo(con_limite_de_uno):
    primera = {"X-Forwarded-For": "203.0.113.7"}
    segunda = {"X-Forwarded-For": "198.51.100.9"}

    assert pedir(con_limite_de_uno, headers=primera).status_code == 200  # gasta el cupo de 1ª

    # La telemetría de VER no está en caché: si el cupo fuera compartido, daría 429.
    assert pedir(con_limite_de_uno, piloto=VER, headers=segunda).status_code == 200


def test_un_analisis_que_falla_antes_de_pedir_telemetria_no_gasta_cupo(con_limite_de_uno):
    assert pedir(con_limite_de_uno, piloto=99).status_code == 404

    assert pedir(con_limite_de_uno).status_code == 200


def test_el_analisis_pasa_por_el_limitador_de_concurrencia(cliente):
    entradas = []

    class Registrador(LimitadorConcurrencia):
        def turno(self):
            entradas.append("turno")
            return super().turno()

    cliente.app.dependency_overrides[obtener_limitador_concurrencia] = lambda: Registrador(1)

    assert pedir(cliente).status_code == 200
    assert entradas == ["turno"]
