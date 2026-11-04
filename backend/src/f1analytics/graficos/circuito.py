"""Mapas del circuito con Matplotlib, para los notebooks y las figuras del README.

La web no usa esto: dibuja sus propios mapas en SVG. Aquí los datos entran ya listos:
la telemetría y las curvas tienen que estar en el mismo sistema de coordenadas (ver
``analisis.circuito``).
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.axes import Axes
from matplotlib.collections import LineCollection
from matplotlib.colors import BoundaryNorm, ListedColormap, Normalize
from matplotlib.figure import Figure
from matplotlib.lines import Line2D

from f1analytics.graficos.estilo import COLORES, colores_marcha, escala_velocidad

GROSOR_TRAZA = 4.0
# Si el principio y el final de la vuelta están a menos de esto (metros), se unen en el mapa.
DISTANCIA_CIERRE_M = 100
# La leyenda va debajo del mapa para no tapar la pista.
_LEYENDA = {"loc": "upper center", "bbox_to_anchor": (0.5, 0.0), "frameon": False}


def _traza(ax: Axes, tel: pd.DataFrame, valores: np.ndarray, cmap, norm) -> LineCollection:
    """Dibuja la vuelta como una línea cuyo color sigue ``valores`` (uno por muestra)."""
    puntos = np.column_stack([tel["x"], tel["y"]])
    # La vuelta empieza y termina en la meta: si quedan cerca, se une para cerrar el circuito.
    if np.hypot(*(puntos[0] - puntos[-1])) / 10 < DISTANCIA_CIERRE_M:
        puntos = np.vstack([puntos, puntos[:1]])
        valores = np.append(valores, valores[-1])
    segmentos = np.stack([puntos[:-1], puntos[1:]], axis=1)
    # OpenF1 repite la posición en muestras seguidas; esos segmentos de largo 0 no se dibujan.
    con_largo = (segmentos[:, 0] != segmentos[:, 1]).any(axis=1)
    linea = LineCollection(
        segmentos[con_largo], cmap=cmap, norm=norm, linewidth=GROSOR_TRAZA, capstyle="round"
    )
    linea.set_array(valores[:-1][con_largo])
    ax.add_collection(linea)
    ax.autoscale_view()
    return linea


def _curvas(ax: Axes, curvas: pd.DataFrame) -> None:
    """Número de cada curva en un círculo blanco, como en la transmisión."""
    for curva in curvas.itertuples():
        ax.text(
            curva.x,
            curva.y,
            curva.etiqueta,
            ha="center",
            va="center",
            fontsize=7,
            fontweight="bold",
            color=COLORES["asfalto"],
            bbox={"boxstyle": "circle,pad=0.25", "fc": COLORES["texto"], "ec": "none"},
            zorder=5,
        )


def _frenadas(ax: Axes, zonas: pd.DataFrame) -> Line2D:
    """Marca con un rombo el punto donde empieza cada frenada."""
    ax.scatter(
        zonas["x_inicio"],
        zonas["y_inicio"],
        marker="D",
        s=36,
        c=COLORES["morado_claro"],
        edgecolors=COLORES["asfalto"],
        linewidths=1,
        zorder=4,
    )
    return Line2D(
        [],
        [],
        marker="D",
        linestyle="",
        markerfacecolor=COLORES["morado_claro"],
        markeredgecolor=COLORES["asfalto"],
        label="Inicio de frenada",
    )


def _preparar(ax: Axes | None, titulo: str | None) -> tuple[Figure, Axes]:
    if ax is None:
        _, ax = plt.subplots(figsize=(9, 6))
    ax.set_aspect("equal")
    ax.set_axis_off()
    ax.grid(False)
    if titulo:
        ax.set_title(titulo, loc="left", fontsize=14)
    return ax.figure, ax


def mapa_velocidad(
    tel: pd.DataFrame,
    curvas: pd.DataFrame | None = None,
    zonas: pd.DataFrame | None = None,
    *,
    titulo: str | None = None,
    ax: Axes | None = None,
) -> Figure:
    """Circuito coloreado por velocidad (azul lenta, amarillo media, naranja rápida)."""
    fig, ax = _preparar(ax, titulo)
    velocidad = tel["velocidad"].to_numpy()
    norm = Normalize(vmin=velocidad.min(), vmax=velocidad.max())
    linea = _traza(ax, tel, velocidad, escala_velocidad(), norm)
    barra = fig.colorbar(linea, ax=ax, shrink=0.6, pad=0.02)
    barra.set_label("km/h")
    barra.outline.set_edgecolor(COLORES["linea"])

    if zonas is not None and not zonas.empty:
        ax.legend(handles=[_frenadas(ax, zonas)], **_LEYENDA)
    if curvas is not None:
        _curvas(ax, curvas)
    return fig


def mapa_marchas(
    tel: pd.DataFrame,
    curvas: pd.DataFrame | None = None,
    zonas: pd.DataFrame | None = None,
    *,
    titulo: str | None = None,
    ax: Axes | None = None,
) -> Figure:
    """Circuito coloreado por la marcha engranada, con una leyenda de las marchas usadas."""
    fig, ax = _preparar(ax, titulo)
    paleta = colores_marcha()
    usadas = sorted(int(m) for m in tel["marcha"].unique() if int(m) in paleta)
    mapa = ListedColormap([paleta[m] for m in range(1, len(paleta) + 1)])
    norm = BoundaryNorm(np.arange(0.5, len(paleta) + 1.5), mapa.N)
    _traza(ax, tel, tel["marcha"].to_numpy(), mapa, norm)

    leyenda = [
        Line2D([], [], color=paleta[m], linewidth=GROSOR_TRAZA, label=f"Marcha {m}") for m in usadas
    ]
    if zonas is not None and not zonas.empty:
        leyenda.append(_frenadas(ax, zonas))
    ax.legend(handles=leyenda, ncol=len(leyenda), fontsize=8, **_LEYENDA)
    if curvas is not None:
        _curvas(ax, curvas)
    return fig
