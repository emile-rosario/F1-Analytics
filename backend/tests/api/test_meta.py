from datetime import UTC, datetime

from conftest import CLASIFICACION, EVENTO_MONZA


def test_calendario_2024_trae_los_24_grandes_premios(cliente):
    respuesta = cliente.get("/api/calendario/2024")

    assert respuesta.status_code == 200
    eventos = respuesta.json()
    assert len(eventos) == 24
    assert eventos[0]["nombre"] == "Bahrain Grand Prix"
    assert set(eventos[0]) == {
        "evento",
        "nombre",
        "nombre_oficial",
        "pais",
        "circuito",
        "circuito_clave",
        "inicio",
    }


def test_calendario_en_orden_cronologico_y_con_fechas_iso(cliente):
    inicios = [e["inicio"] for e in cliente.get("/api/calendario/2024").json()]

    assert inicios == sorted(inicios)
    assert inicios[0].startswith("2024-02-29")


def test_calendario_de_un_anio_sin_datos_es_una_lista_vacia(cliente):
    anio_actual = datetime.now(UTC).year

    assert cliente.get(f"/api/calendario/{anio_actual}").json() == []


def test_sesiones_de_monza_en_orden(cliente):
    respuesta = cliente.get(f"/api/sesiones/2024/{EVENTO_MONZA}")

    assert respuesta.status_code == 200
    sesiones = respuesta.json()
    assert [s["nombre"] for s in sesiones] == [
        "Practice 1",
        "Practice 2",
        "Practice 3",
        "Qualifying",
        "Race",
    ]
    assert sesiones[3]["sesion"] == CLASIFICACION
    assert all(s["terminada"] for s in sesiones)


def test_sesiones_de_un_evento_que_no_existe_es_una_lista_vacia(cliente):
    assert cliente.get("/api/sesiones/2024/1").json() == []


def test_pilotos_de_la_clasificacion(cliente):
    respuesta = cliente.get(f"/api/sesiones/{CLASIFICACION}/pilotos")

    assert respuesta.status_code == 200
    pilotos = respuesta.json()
    assert len(pilotos) == 20
    leclerc = next(p for p in pilotos if p["codigo"] == "LEC")
    assert leclerc == {
        "numero": 16,
        "codigo": "LEC",
        "nombre": "Charles LECLERC",
        "equipo": "Ferrari",
        "color": "#E80020",
    }


def test_la_ruta_de_pilotos_no_se_confunde_con_la_de_sesiones_de_un_evento(cliente):
    # /sesiones/{anio}/{evento} y /sesiones/{sesion}/pilotos tienen la misma forma.
    assert cliente.get(f"/api/sesiones/2024/{EVENTO_MONZA}").json()[0]["evento"] == EVENTO_MONZA
    assert cliente.get(f"/api/sesiones/{CLASIFICACION}/pilotos").json()[0]["numero"]


def test_pilotos_de_una_sesion_que_no_existe_da_404(cliente):
    respuesta = cliente.get("/api/sesiones/999999/pilotos")

    assert respuesta.status_code == 404
    assert respuesta.json() == {"codigo": "sesion_no_encontrada"}


def test_anios_fuera_de_rango_dan_parametro_invalido(cliente):
    futuro = datetime.now(UTC).year + 1

    for ruta in ["/api/calendario/2022", f"/api/calendario/{futuro}", "/api/sesiones/2022/1244"]:
        respuesta = cliente.get(ruta)

        assert respuesta.status_code == 422, ruta
        assert respuesta.json() == {"codigo": "parametro_invalido"}, ruta


def test_un_anio_que_no_es_numero_da_parametro_invalido(cliente):
    respuesta = cliente.get("/api/calendario/dosmilveinticuatro")

    assert respuesta.status_code == 422
    assert respuesta.json() == {"codigo": "parametro_invalido"}


def test_las_respuestas_de_error_llevan_la_cabecera_cors(cliente):
    respuesta = cliente.get("/api/calendario/2022", headers={"Origin": "http://localhost:3000"})

    assert respuesta.status_code == 422
    assert respuesta.headers["access-control-allow-origin"] == "http://localhost:3000"
