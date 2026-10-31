import httpx
import pandas as pd
import pytest
import respx

from f1analytics.datos.cliente import ClienteOpenF1
from f1analytics.datos.errores import ErrorOpenF1

BASE = "https://api.openf1.org/v1"
URL = f"{BASE}/laps"
FILAS = [{"lap_number": 1, "lap_duration": 90.5}, {"lap_number": 2, "lap_duration": 89.9}]


@pytest.fixture
def esperas():
    return []


@pytest.fixture
def cliente(tmp_path, esperas):
    return ClienteOpenF1(dir_cache=tmp_path, dormir=esperas.append)


@respx.mock
def test_devuelve_un_dataframe_y_envia_los_filtros(cliente):
    ruta = respx.get(URL).mock(return_value=httpx.Response(200, json=FILAS))

    tabla = cliente.obtener("laps", {"session_key": 9586, "date>": "2024-08-31T15:00:00+00:00"})

    assert list(tabla["lap_number"]) == [1, 2]
    params = ruta.calls.last.request.url.params
    assert params["session_key"] == "9586"
    assert params["date>"] == "2024-08-31T15:00:00+00:00"


@respx.mock
def test_una_consulta_sin_resultados_da_un_dataframe_vacio(cliente):
    respx.get(URL).mock(return_value=httpx.Response(404, json={"detail": "No results found."}))

    assert cliente.obtener("laps", {"session_key": 1}).empty


@respx.mock
def test_reintenta_ante_un_429_y_devuelve_la_segunda_respuesta(cliente, esperas):
    respx.get(URL).mock(
        side_effect=[httpx.Response(429), httpx.Response(200, json=FILAS)],
    )

    tabla = cliente.obtener("laps")

    assert len(tabla) == 2
    assert len(esperas) == 1


@respx.mock
def test_respeta_retry_after_en_un_429(cliente, esperas):
    respx.get(URL).mock(
        side_effect=[
            httpx.Response(429, headers={"retry-after": "7"}),
            httpx.Response(200, json=FILAS),
        ],
    )

    cliente.obtener("laps")

    assert esperas == [7.0]


@respx.mock
def test_espera_cada_vez_mas_entre_reintentos_ante_5xx(cliente, esperas):
    respx.get(URL).mock(
        side_effect=[httpx.Response(503), httpx.Response(500), httpx.Response(200, json=FILAS)],
    )

    cliente.obtener("laps")

    assert esperas == [1.0, 2.0]


@respx.mock
def test_agotados_los_reintentos_por_429_lanza_limite_peticiones(cliente, esperas):
    ruta = respx.get(URL).mock(return_value=httpx.Response(429))

    with pytest.raises(ErrorOpenF1) as error:
        cliente.obtener("laps")

    assert error.value.codigo == "limite_peticiones"
    assert ruta.call_count == 5  # el intento inicial y 4 reintentos
    assert len(esperas) == 4


@respx.mock
def test_agotados_los_reintentos_por_5xx_lanza_fallo_openf1(cliente):
    respx.get(URL).mock(return_value=httpx.Response(502))

    with pytest.raises(ErrorOpenF1) as error:
        cliente.obtener("laps")

    assert error.value.codigo == "fallo_openf1"


@respx.mock
def test_un_error_de_red_se_reintenta_y_termina_en_fallo_openf1(cliente, esperas):
    respx.get(URL).mock(side_effect=httpx.ConnectError("sin red"))

    with pytest.raises(ErrorOpenF1) as error:
        cliente.obtener("laps")

    assert error.value.codigo == "fallo_openf1"
    assert len(esperas) == 4


@respx.mock
def test_un_error_del_cliente_no_se_reintenta(cliente, esperas):
    ruta = respx.get(URL).mock(return_value=httpx.Response(422))

    with pytest.raises(ErrorOpenF1) as error:
        cliente.obtener("laps")

    assert error.value.codigo == "fallo_openf1"
    assert error.value.estado_http == 422
    assert ruta.call_count == 1
    assert esperas == []


@respx.mock
def test_con_cachear_la_segunda_consulta_no_sale_a_internet(cliente):
    ruta = respx.get(URL).mock(return_value=httpx.Response(200, json=FILAS))

    primera = cliente.obtener("laps", {"session_key": 1}, cachear=True)
    segunda = cliente.obtener("laps", {"session_key": 1}, cachear=True)

    assert ruta.call_count == 1
    pd.testing.assert_frame_equal(primera, segunda)


@respx.mock
def test_sin_cachear_cada_consulta_sale_a_internet(cliente):
    ruta = respx.get(URL).mock(return_value=httpx.Response(200, json=FILAS))

    cliente.obtener("laps", {"session_key": 1})
    cliente.obtener("laps", {"session_key": 1})

    assert ruta.call_count == 2


@respx.mock
def test_filtros_distintos_no_comparten_cache(cliente):
    ruta = respx.get(URL).mock(return_value=httpx.Response(200, json=FILAS))

    cliente.obtener("laps", {"session_key": 1}, cachear=True)
    cliente.obtener("laps", {"session_key": 2}, cachear=True)

    assert ruta.call_count == 2


@respx.mock
def test_la_cache_en_disco_sobrevive_a_un_cliente_nuevo(tmp_path, esperas):
    ruta = respx.get(URL).mock(return_value=httpx.Response(200, json=FILAS))
    ClienteOpenF1(dir_cache=tmp_path, dormir=esperas.append).obtener("laps", cachear=True)

    otro = ClienteOpenF1(dir_cache=tmp_path, dormir=esperas.append)
    tabla = otro.obtener("laps", cachear=True)

    assert ruta.call_count == 1
    assert len(tabla) == 2


@respx.mock
def test_no_guarda_en_cache_las_respuestas_vacias(cliente):
    ruta = respx.get(URL).mock(return_value=httpx.Response(404))

    cliente.obtener("laps", cachear=True)
    cliente.obtener("laps", cachear=True)

    assert ruta.call_count == 2


@respx.mock
def test_un_archivo_de_cache_danado_se_vuelve_a_pedir(tmp_path, esperas):
    ruta = respx.get(URL).mock(return_value=httpx.Response(200, json=FILAS))
    ClienteOpenF1(dir_cache=tmp_path, dormir=esperas.append).obtener("laps", cachear=True)
    for archivo in tmp_path.rglob("*.parquet"):
        archivo.write_bytes(b"no es parquet")

    tabla = ClienteOpenF1(dir_cache=tmp_path, dormir=esperas.append).obtener("laps", cachear=True)

    assert ruta.call_count == 2
    assert len(tabla) == 2


@respx.mock
def test_la_memoria_descarta_lo_mas_antiguo_al_pasarse_del_tope(esperas):
    ruta = respx.get(URL).mock(return_value=httpx.Response(200, json=FILAS))
    # Sin disco y con espacio para una sola tabla: la segunda desaloja a la primera.
    peso = int(pd.DataFrame(FILAS).memory_usage(deep=True).sum())
    cliente = ClienteOpenF1(dir_cache=None, max_bytes_memoria=peso + 10, dormir=esperas.append)

    cliente.obtener("laps", {"session_key": 1}, cachear=True)
    cliente.obtener("laps", {"session_key": 2}, cachear=True)
    cliente.obtener("laps", {"session_key": 1}, cachear=True)

    assert ruta.call_count == 3


@respx.mock
def test_una_tabla_mas_grande_que_el_tope_no_entra_en_memoria(esperas):
    ruta = respx.get(URL).mock(return_value=httpx.Response(200, json=FILAS))
    cliente = ClienteOpenF1(dir_cache=None, max_bytes_memoria=1, dormir=esperas.append)

    cliente.obtener("laps", cachear=True)
    cliente.obtener("laps", cachear=True)

    assert ruta.call_count == 2
