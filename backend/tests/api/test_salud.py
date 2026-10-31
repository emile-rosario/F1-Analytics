from fastapi.testclient import TestClient

from f1analytics.api.main import app

cliente = TestClient(app)


def test_salud_responde_ok():
    respuesta = cliente.get("/api/salud")

    assert respuesta.status_code == 200
    assert respuesta.json()["estado"] == "ok"


def test_salud_incluye_la_version():
    respuesta = cliente.get("/api/salud")

    assert respuesta.json()["version"]
