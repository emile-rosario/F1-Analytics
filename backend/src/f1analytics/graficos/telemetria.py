"""Gráficos de la comparación de telemetría con Matplotlib, para los notebooks y el README.

La web no usa esto: dibuja los suyos. Aquí los datos entran ya listos, con la forma que
devuelven ``analisis.telemetria.alinear_vueltas``, ``delta_tiempo`` y
``ganador_por_minisector``. El piloto A es la referencia y el B el que se compara.
"""

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.axes import Axes
from matplotlib.collections import LineCollection
from matplotlib.figure import Figure
from matplotlib.patches import Patch

# Reusa lo que ya dibuja el mapa del circuito, para que los dos mapas se vean igual.
from f1analytics.graficos.circuito import DISTANCIA_CIERRE_M, GROSOR_TRAZA, _curvas, _preparar
from f1analytics.graficos.estilo import COLORES, COLORES_PILOTOS

# Altura relativa de cada panel: velocidad, acelerador, freno y delta.
ALTURAS_PANELES = [3, 1.2, 0.8, 2]


def _linea_piloto(ax: Axes, distancia, valores, letra: str, nombre: str, *, escalon=False):
    ax.plot(
        distancia,
        valores,
        color=COLORES_PILOTOS[letra],
        linewidth=1.6,
        label=nombre,
        drawstyle="steps-post" if escalon else "default",
    )


def trazas(
    alineadas: pd.DataFrame,
    delta: pd.Series,
    *,
    nombre_a: str,
    nombre_b: str,
    titulo: str | None = None,
) -> Figure:
    """Velocidad, acelerador, freno y delta de las dos vueltas, apilados sobre la misma distancia.

    El delta es positivo cuando B va por detrás de A: sube cuando A le saca tiempo y baja cuando
    B se lo recupera. Su valor final es la diferencia de tiempo de vuelta.
    """
    fig, ejes = plt.subplots(
        4,
        1,
        sharex=True,
        figsize=(11, 9),
        gridspec_kw={"height_ratios": ALTURAS_PANELES, "hspace": 0.12},
    )
    velocidad, acelerador, freno, panel_delta = ejes
    distancia = alineadas["distancia_m"]

    for letra, nombre in (("a", nombre_a), ("b", nombre_b)):
        _linea_piloto(velocidad, distancia, alineadas[f"velocidad_{letra}"], letra, nombre)
        _linea_piloto(acelerador, distancia, alineadas[f"acelerador_{letra}"], letra, nombre)
        _linea_piloto(freno, distancia, alineadas[f"freno_{letra}"], letra, nombre, escalon=True)
    velocidad.set_ylabel("Velocidad (km/h)")
    velocidad.legend(loc="lower right", ncol=2)
    acelerador.set_ylabel("Acelerador (%)")
    freno.set_ylabel("Freno")
    freno.set_yticks([0, 100], ["No", "Sí"])

    panel_delta.axhline(0, color=COLORES["texto_suave"], linewidth=1)
    panel_delta.plot(distancia, delta, color=COLORES["texto"], linewidth=1.6)
    panel_delta.fill_between(
        distancia, 0, delta, where=delta >= 0, color=COLORES_PILOTOS["a"], alpha=0.35
    )
    panel_delta.fill_between(
        distancia, 0, delta, where=delta <= 0, color=COLORES_PILOTOS["b"], alpha=0.35
    )
    panel_delta.set_ylabel(f"Delta (s)\n↑ gana {nombre_a}   ↓ gana {nombre_b}")
    panel_delta.set_xlabel("Distancia desde la meta (m)")
    panel_delta.set_xlim(distancia.iloc[0], distancia.iloc[-1])

    if titulo:
        fig.suptitle(titulo, x=0.125, ha="left", fontsize=14, fontweight="bold")
    return fig


def mapa_minisectores(
    alineadas: pd.DataFrame,
    ganadores: pd.DataFrame,
    *,
    nombre_a: str,
    nombre_b: str,
    curvas: pd.DataFrame | None = None,
    titulo: str | None = None,
    ax: Axes | None = None,
) -> Figure:
    """Circuito pintado por minisectores: del color del piloto que fue más rápido en cada uno.

    Usa la posición ``x_a``/``y_a`` de la vuelta de A. Si ``curvas`` viene, tiene que estar en el
    mismo sistema de coordenadas que la telemetría (ver ``analisis.circuito``).
    """
    fig, ax = _preparar(ax, titulo)
    puntos = np.column_stack([alineadas["x_a"], alineadas["y_a"]])
    distancia = alineadas["distancia_m"].to_numpy()
    if np.hypot(*(puntos[0] - puntos[-1])) / 10 < DISTANCIA_CIERRE_M:
        puntos = np.vstack([puntos, puntos[:1]])
        distancia = np.append(distancia, distancia[-1])

    segmentos = np.stack([puntos[:-1], puntos[1:]], axis=1)
    # Cada tramo de la línea pertenece al minisector donde cae su punto medio.
    medios = (distancia[:-1] + distancia[1:]) / 2
    sector = np.clip(np.searchsorted(ganadores["fin_m"], medios), 0, len(ganadores) - 1)
    colores = [COLORES_PILOTOS[g] for g in ganadores["ganador"].to_numpy()[sector]]
    con_largo = (segmentos[:, 0] != segmentos[:, 1]).any(axis=1)
    ax.add_collection(
        LineCollection(
            segmentos[con_largo],
            colors=np.array(colores)[con_largo],
            linewidth=GROSOR_TRAZA,
            capstyle="round",
        )
    )
    ax.autoscale_view()

    cuenta = ganadores["ganador"].value_counts()
    leyenda = [
        Patch(color=COLORES_PILOTOS["a"], label=f"{nombre_a} ({cuenta.get('a', 0)})"),
        Patch(color=COLORES_PILOTOS["b"], label=f"{nombre_b} ({cuenta.get('b', 0)})"),
    ]
    if cuenta.get("empate", 0):
        leyenda.append(Patch(color=COLORES_PILOTOS["empate"], label=f"Empate ({cuenta['empate']})"))
    ax.legend(
        handles=leyenda,
        ncol=len(leyenda),
        loc="upper center",
        bbox_to_anchor=(0.5, 0.0),
        frameon=False,
        title="Minisectores ganados",
    )
    if curvas is not None:
        _curvas(ax, curvas)
    return fig
