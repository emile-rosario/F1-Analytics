import matplotlib

matplotlib.use("Agg")  # sin ventanas: los tests corren en CI

import matplotlib.pyplot as plt  # noqa: E402
import pytest  # noqa: E402
from matplotlib.colors import to_hex  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402

from f1analytics.graficos.estilo import (  # noqa: E402
    COLORES,
    COLORES_COMPUESTO,
    aplicar_estilo,
    escala_velocidad,
)


@pytest.fixture(autouse=True)
def restaurar_estilo():
    yield
    plt.rcdefaults()
    plt.close("all")


def test_aplicar_estilo_pone_el_fondo_asfalto():
    aplicar_estilo()

    assert to_hex(matplotlib.rcParams["figure.facecolor"]).upper() == COLORES["asfalto"]
    assert to_hex(matplotlib.rcParams["axes.facecolor"]).upper() == COLORES["panel"]


def test_una_figura_con_el_estilo_aplicado_se_crea_sin_error():
    aplicar_estilo()

    figura, ejes = plt.subplots()
    ejes.plot([0, 1, 2], [300, 80, 250])

    assert isinstance(figura, Figure)


def test_la_escala_de_velocidad_va_de_azul_a_naranja_pasando_por_amarillo():
    escala = escala_velocidad()

    assert to_hex(escala(0.0)).upper() == "#3D7BFF"
    assert to_hex(escala(0.5)).upper() == "#F2C14E"
    assert to_hex(escala(1.0)).upper() == "#FF5A36"


def test_hay_un_color_para_cada_compuesto():
    assert set(COLORES_COMPUESTO) == {"SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"}
