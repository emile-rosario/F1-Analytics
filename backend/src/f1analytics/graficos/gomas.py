"""Gráficos de gomas con Matplotlib, para los notebooks y las figuras del README.

La web no usa esto: dibuja los suyos. Aquí los datos entran ya listos (ver ``analisis.gomas`` y
``datos.limpieza``).
"""

import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.axes import Axes
from matplotlib.figure import Figure
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

from f1analytics.graficos.estilo import COLORES, COLORES_COMPUESTO

NOMBRE_COMPUESTO = {
    "SOFT": "Blanda",
    "MEDIUM": "Media",
    "HARD": "Dura",
    "INTERMEDIATE": "Intermedia",
    "WET": "Lluvia",
}
LETRA_COMPUESTO = {"SOFT": "B", "MEDIUM": "M", "HARD": "D", "INTERMEDIATE": "I", "WET": "LL"}
# Un marcador distinto por piloto: el color ya lo usa el compuesto.
MARCADORES = ["o", "s", "^"]
MAX_PILOTOS_DISPERSION = 3


def _leyenda_compuestos(compuestos) -> list[Patch]:
    return [
        Patch(facecolor=COLORES_COMPUESTO[c], label=NOMBRE_COMPUESTO[c])
        for c in COMPUESTO_ORDEN
        if c in set(compuestos)
    ]


COMPUESTO_ORDEN = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]


def _preparar(
    ax: Axes | None, titulo: str | None, figsize: tuple[float, float]
) -> tuple[Figure, Axes]:
    if ax is None:
        _, ax = plt.subplots(figsize=figsize)
    ax.set_axisbelow(True)  # la rejilla va debajo de las barras y los puntos
    if titulo:
        ax.set_title(titulo, loc="left", fontsize=14)
    return ax.figure, ax


def estrategias(
    stints: pd.DataFrame,
    resultado: pd.DataFrame,
    pilotos: pd.DataFrame,
    *,
    titulo: str | None = None,
    ax: Axes | None = None,
) -> Figure:
    """Una fila por piloto con una barra por stint, ordenadas por posición final.

    Cada barra lleva el color del compuesto y su letra con las vueltas que duró (B 15, M 20,
    D 22). Quien abandona termina con la barra cortada y una cruz.
    """
    codigos = pilotos.set_index("numero")["codigo"]
    orden = [p for p in resultado["piloto"] if p in set(stints["piloto"])]
    fig, ax = _preparar(ax, titulo, (10, 0.38 * max(len(orden), 1) + 1.5))

    for fila, piloto in enumerate(orden):
        propios = stints[stints["piloto"] == piloto]
        for s in propios.itertuples():
            vueltas = s.vuelta_fin - s.vuelta_inicio + 1
            ax.barh(
                fila,
                vueltas,
                left=s.vuelta_inicio - 1,
                height=0.7,
                color=COLORES_COMPUESTO.get(s.compuesto, COLORES["texto_suave"]),
                edgecolor=COLORES["asfalto"],
                linewidth=1.5,
            )
            ax.text(
                s.vuelta_inicio - 1 + vueltas / 2,
                fila,
                f"{LETRA_COMPUESTO.get(s.compuesto, '?')} {vueltas}",
                ha="center",
                va="center",
                fontsize=8,
                fontweight="bold",
                color=COLORES["asfalto"],
            )
        datos = resultado[resultado["piloto"] == piloto].iloc[0]
        if datos["abandono"] or datos["descalificado"]:
            ax.text(
                propios["vuelta_fin"].max() + 0.8,
                fila,
                "✕",
                va="center",
                fontsize=10,
                color=COLORES["texto_suave"],
            )

    ax.set_yticks(range(len(orden)), [codigos.get(p, str(p)) for p in orden])
    ax.invert_yaxis()
    ax.set_xlabel("Vuelta")
    ax.grid(axis="y", visible=False)
    ax.legend(
        handles=_leyenda_compuestos(stints["compuesto"]),
        loc="upper center",
        bbox_to_anchor=(0.5, -0.12),
        ncol=5,
        frameon=False,
    )
    return fig


def dispersion_edad(
    vueltas: pd.DataFrame,
    degradacion: pd.DataFrame,
    pilotos: list[int],
    codigos: pd.Series | dict[int, str] | None = None,
    *,
    columna: str = "tiempo_corregido_s",
    titulo: str | None = None,
    ax: Axes | None = None,
) -> Figure:
    """Tiempo de vuelta contra edad de la goma, hasta con 3 pilotos y una recta por stint.

    Cada punto es una vuelta limpia: el color es el compuesto y el marcador, el piloto. Las rectas
    son las de ``degradacion_por_stint``, así que su inclinación es la degradación. ``codigos``
    traduce número de piloto a código (VER) para la leyenda.
    """
    if not 1 <= len(pilotos) <= MAX_PILOTOS_DISPERSION:
        raise ValueError(f"Se pueden comparar de 1 a {MAX_PILOTOS_DISPERSION} pilotos")
    fig, ax = _preparar(ax, titulo, (10, 5.5))
    codigos = codigos if codigos is not None else {}

    usados = []
    for piloto, marcador in zip(pilotos, MARCADORES, strict=False):
        propias = vueltas[(vueltas["piloto"] == piloto) & vueltas["edad_goma"].notna()]
        for compuesto, grupo in propias.groupby("compuesto"):
            ax.scatter(
                grupo["edad_goma"],
                grupo[columna],
                marker=marcador,
                s=28,
                color=COLORES_COMPUESTO.get(compuesto, COLORES["texto_suave"]),
                edgecolors=COLORES["asfalto"],
                linewidths=0.6,
                alpha=0.9,
                zorder=3,
            )
            usados.append(compuesto)
        rectas = degradacion[(degradacion["piloto"] == piloto) & ~degradacion["insuficiente"]]
        for r in rectas.itertuples():
            x = [r.edad_inicial, r.edad_final]
            ax.plot(
                x,
                [r.intercepto + r.pendiente_s_por_vuelta * e for e in x],
                color=COLORES_COMPUESTO.get(r.compuesto, COLORES["texto_suave"]),
                linewidth=2,
                zorder=2,
            )

    ax.set_xlabel("Edad de la goma (vueltas)")
    ax.set_ylabel(
        "Tiempo de vuelta corregido por combustible (s)"
        if columna == "tiempo_corregido_s"
        else "Tiempo de vuelta (s)"
    )
    pilotos_leyenda = [
        Line2D(
            [],
            [],
            marker=marcador,
            linestyle="",
            color=COLORES["texto"],
            markeredgecolor=COLORES["asfalto"],
            label=str(codigos.get(piloto, piloto)),
        )
        for piloto, marcador in zip(pilotos, MARCADORES, strict=False)
    ]
    ax.legend(handles=[*pilotos_leyenda, *_leyenda_compuestos(usados)], frameon=False, ncol=2)
    return fig


def degradacion_compuestos(
    comparacion: pd.DataFrame,
    *,
    titulo: str | None = None,
    ax: Axes | None = None,
) -> Figure:
    """Degradación media de cada compuesto (segundos que se pierden por vuelta de uso)."""
    fig, ax = _preparar(ax, titulo, (8, 0.9 * max(len(comparacion), 1) + 1.5))

    for fila, c in enumerate(comparacion.itertuples()):
        ax.barh(
            fila,
            c.pendiente_s_por_vuelta,
            height=0.6,
            color=COLORES_COMPUESTO.get(c.compuesto, COLORES["texto_suave"]),
        )
        ax.text(
            max(c.pendiente_s_por_vuelta, 0) + 0.003,
            fila,
            f"{c.pendiente_s_por_vuelta:.3f} s/vuelta · {c.n_stints} stints",
            va="center",
            fontsize=9,
        )

    ax.set_yticks(range(len(comparacion)), [NOMBRE_COMPUESTO[c] for c in comparacion["compuesto"]])
    ax.invert_yaxis()
    ax.set_xlabel("Segundos que pierde la goma por vuelta de uso")
    ax.grid(axis="y", visible=False)
    ax.set_xlim(0, max(comparacion["pendiente_s_por_vuelta"].max(), 0.01) * 1.6)
    return fig
