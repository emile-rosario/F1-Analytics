"""Estilo de Matplotlib con la paleta de docs/design.md, para notebooks y figuras del README."""

import matplotlib as mpl
from matplotlib.colors import LinearSegmentedColormap

COLORES = {
    "asfalto": "#1A1C23",
    "panel": "#242731",
    "linea": "#343845",
    "texto": "#F2F3F6",
    "texto_suave": "#A3A9B7",
    "morado": "#B65CFF",
    "morado_claro": "#D7B3FF",
}

# Compuestos de goma, con los nombres que usa OpenF1.
COLORES_COMPUESTO = {
    "SOFT": "#F0434A",
    "MEDIUM": "#F2C14E",
    "HARD": "#F2F3F6",
    "INTERMEDIATE": "#3DDC84",
    "WET": "#3D7BFF",
}

# Los dos pilotos de la comparación de telemetría: morado (A, la referencia) y naranja (B).
# Se distinguen también con daltonismo y se leen sobre el fondo asfalto. El gris es el empate.
COLORES_PILOTOS = {"a": "#B65CFF", "b": "#FF8A3D", "empate": "#6B7285"}

# Escala de velocidad apta para daltonismo: lenta (azul) → media (amarillo) → rápida (naranja).
_VELOCIDAD = ("#3D7BFF", "#F2C14E", "#FF5A36")


def escala_velocidad() -> LinearSegmentedColormap:
    """Mapa de color para pintar la velocidad sobre el circuito."""
    return LinearSegmentedColormap.from_list("velocidad", _VELOCIDAD)


def colores_marcha(marchas: int = 8) -> dict[int, str]:
    """Un color por marcha, de la 1 a la ``marchas``: de oscuro (corta) a claro (larga).

    Sale de viridis, que se distingue bien con daltonismo y se lee sobre el fondo asfalto.
    """
    escala = mpl.colormaps["viridis"]
    return {
        marcha: mpl.colors.to_hex(escala(0.2 + 0.8 * (marcha - 1) / (marchas - 1)))
        for marcha in range(1, marchas + 1)
    }


def aplicar_estilo() -> None:
    """Deja los gráficos de Matplotlib con el fondo asfalto y los colores de F1 Analytics."""
    mpl.rcParams.update(
        {
            "figure.facecolor": COLORES["asfalto"],
            "figure.dpi": 120,
            "axes.facecolor": COLORES["panel"],
            "axes.edgecolor": COLORES["linea"],
            "axes.labelcolor": COLORES["texto_suave"],
            "axes.titlecolor": COLORES["texto"],
            "axes.titleweight": "bold",
            "axes.grid": True,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "grid.color": COLORES["linea"],
            "grid.linewidth": 0.8,
            "text.color": COLORES["texto"],
            "xtick.color": COLORES["texto_suave"],
            "ytick.color": COLORES["texto_suave"],
            "legend.facecolor": COLORES["panel"],
            "legend.edgecolor": COLORES["linea"],
            "savefig.facecolor": COLORES["asfalto"],
            "font.family": "sans-serif",
            "axes.prop_cycle": mpl.cycler(
                color=[COLORES["morado"], "#FF5A36", COLORES["texto"], "#F2C14E", "#3DDC84"]
            ),
        }
    )
