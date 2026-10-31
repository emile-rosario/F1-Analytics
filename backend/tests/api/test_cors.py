from fastapi.testclient import TestClient

from f1analytics.api.main import crear_app

PRODUCCION = "https://f1-analytics.vercel.app"
REGEX_PREVIEW = r"https://f1-analytics-[a-z0-9]+-emile\.vercel\.app"


def cliente() -> TestClient:
    return TestClient(crear_app([PRODUCCION, "http://localhost:3000"], REGEX_PREVIEW))


def cabecera_cors(origen: str) -> str | None:
    respuesta = cliente().get("/api/salud", headers={"Origin": origen})
    return respuesta.headers.get("access-control-allow-origin")


def test_permite_el_dominio_de_produccion():
    assert cabecera_cors(PRODUCCION) == PRODUCCION


def test_permite_localhost_en_desarrollo():
    assert cabecera_cors("http://localhost:3000") == "http://localhost:3000"


def test_permite_las_previews_de_vercel():
    preview = "https://f1-analytics-abc123-emile.vercel.app"

    assert cabecera_cors(preview) == preview


def test_rechaza_otros_origenes():
    assert cabecera_cors("https://sitio-malicioso.example") is None


def test_rechaza_un_dominio_que_solo_se_parece_a_la_preview():
    assert cabecera_cors("https://f1-analytics-abc123-emile.vercel.app.malo.example") is None


def test_sin_regex_las_previews_no_pasan():
    app = crear_app([PRODUCCION])
    respuesta = TestClient(app).get(
        "/api/salud", headers={"Origin": "https://f1-analytics-abc123-emile.vercel.app"}
    )

    assert "access-control-allow-origin" not in respuesta.headers
