"""Las partes puras de ``scripts/medir_recursos.py``: leer el cgroup y armar la tabla."""

import importlib.util
from pathlib import Path

import pytest

RUTA = Path(__file__).resolve().parents[1] / "scripts" / "medir_recursos.py"


@pytest.fixture(scope="module")
def medir():
    especificacion = importlib.util.spec_from_file_location("medir_recursos", RUTA)
    modulo = importlib.util.module_from_spec(especificacion)
    especificacion.loader.exec_module(modulo)
    return modulo


def test_leer_bytes_acepta_el_salto_de_linea_del_cgroup(medir):
    assert medir.leer_bytes("5468160\n") == 5468160


@pytest.mark.parametrize("texto", ["", "max", "-3", "1.5"])
def test_leer_bytes_rechaza_lo_que_no_es_un_entero(medir, texto):
    with pytest.raises(ValueError):
        medir.leer_bytes(texto)


def test_a_mb_usa_1024_al_cuadrado(medir):
    assert medir.a_mb(512 * 1024 * 1024) == 512
    assert medir.a_mb(1024 * 1024 // 2) == pytest.approx(0.5)


def test_la_tabla_tiene_una_fila_por_medicion_y_avisa_del_oom(medir):
    resultado = medir.Resultado("gomas", base_mb=60.0, oom=True)
    resultado.mediciones["en frío"] = medir.Medicion(200, 12.34, 51.2, 180.4)
    resultado.mediciones["en caliente"] = medir.Medicion(200, 0.5, 51.2, 181.0)

    lineas = medir.tabla_markdown([resultado]).splitlines()

    assert lineas[0].startswith("| Prueba | Petición | Estado")
    assert lineas[1] == "|---|---|---|---|---|---|"
    assert lineas[2] == "| gomas | arranque | | | | 60 |"
    assert lineas[3] == "| | en frío | 200 | 12.3 | 51 | 180 |"
    assert lineas[4] == "| | en caliente | 200 | 0.5 | 51 | 181 |"
    assert "OOM" in lineas[5]
    assert len(lineas) == 6


def test_la_tabla_no_menciona_oom_si_no_lo_hubo(medir):
    resultado = medir.Resultado("circuito", base_mb=60.0)
    resultado.mediciones["en frío"] = medir.Medicion(200, 3.0, 20.0, 100.0)

    assert "OOM" not in medir.tabla_markdown([resultado])


def test_el_pico_maximo_es_el_mayor_de_todas_las_mediciones(medir):
    a = medir.Resultado("a", 50.0)
    a.mediciones["x"] = medir.Medicion(200, 1.0, 1.0, 120.0)
    b = medir.Resultado("b", 50.0)
    b.mediciones["x"] = medir.Medicion(200, 1.0, 1.0, 310.5)
    b.mediciones["y"] = medir.Medicion(200, 1.0, 1.0, 200.0)

    assert medir.pico_maximo_mb([a, b]) == 310.5
    assert medir.pico_maximo_mb([]) == 0.0


def test_los_casos_tienen_nombre_y_ruta_de_analisis(medir):
    assert len(medir.CASOS) == 5
    for caso in medir.CASOS:
        assert caso.ruta.startswith("/api/analisis/")
    assert len({caso.nombre for caso in medir.CASOS}) == 5
