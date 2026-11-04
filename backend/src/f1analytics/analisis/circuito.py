"""Análisis de una vuelta sobre el circuito: dónde se frena, dónde se va a fondo y cuán rápido.

Son funciones puras: reciben la telemetría de una vuelta (la que devuelve
``datos.telemetria_vuelta.telemetria_de_vuelta``) y las curvas del circuito, y devuelven
tablas y diccionarios. No hablan con OpenF1 ni con el disco.

``x`` e ``y`` van en décimas de metro, el sistema de OpenF1 ``location``. La telemetría y las
curvas tienen que estar en el **mismo** sistema: si se gira el mapa con ``orientar_circuito``,
las curvas se giran con ``posicion_curvas`` y el mismo ángulo.
"""

import math
from collections.abc import Sequence

import numpy as np
import pandas as pd

from f1analytics.datos.circuitos import Curva

# Con el acelerador por encima de este valor (0–100) se considera «a fondo».
ACELERADOR_A_FONDO = 98
# Con el freno por encima de este valor (OpenF1 manda 0 o 100) se considera «frenando».
FRENO_ACTIVO = 50

COLUMNAS_CURVAS = ["numero", "letra", "etiqueta", "x", "y", "distancia_m"]
COLUMNAS_ZONAS_FRENADO = [
    "curva",
    "letra",
    "inicio_m",
    "fin_m",
    "longitud_m",
    "vel_entrada",
    "vel_salida",
    "x_inicio",
    "y_inicio",
]
COLUMNAS_ZONAS_ALTA_VELOCIDAD = [
    "inicio_m",
    "fin_m",
    "longitud_m",
    "vel_maxima",
    "x_inicio",
    "y_inicio",
    "x_fin",
    "y_fin",
]


def _rotar(x: pd.Series | np.ndarray, y: pd.Series | np.ndarray, grados: float):
    """Gira puntos ``grados`` en sentido antihorario alrededor del origen (``y`` hacia arriba)."""
    angulo = math.radians(grados)
    coseno, seno = math.cos(angulo), math.sin(angulo)
    return x * coseno - y * seno, x * seno + y * coseno


def orientar_circuito(tel: pd.DataFrame, rotacion: float) -> pd.DataFrame:
    """Copia de la telemetría con ``x`` e ``y`` girados ``rotacion`` grados.

    La rotación sale de ``datos.circuitos`` y deja el mapa como en la transmisión.
    """
    orientada = tel.copy()
    orientada["x"], orientada["y"] = _rotar(tel["x"], tel["y"], rotacion)
    return orientada


def posicion_curvas(curvas: Sequence[Curva], rotacion: float = 0.0) -> pd.DataFrame:
    """Tabla de curvas con su posición girada ``rotacion`` grados, lista para dibujar.

    ``etiqueta`` junta número y letra (``"1"``, ``"1A"``). Con ``rotacion=0`` las coordenadas
    quedan como vienen, que es lo que hace falta para usarlas con una telemetría sin girar.
    """
    filas = [
        {
            "numero": curva.numero,
            "letra": curva.letra,
            "etiqueta": f"{curva.numero}{curva.letra}",
            "x": curva.x,
            "y": curva.y,
            "distancia_m": curva.distancia_m,
        }
        for curva in curvas
    ]
    tabla = pd.DataFrame(filas, columns=COLUMNAS_CURVAS)
    if len(tabla):
        tabla["x"], tabla["y"] = _rotar(tabla["x"], tabla["y"], rotacion)
    return tabla


def _tramos(activo: np.ndarray) -> list[tuple[int, int]]:
    """Índices (inicio, fin), ambos incluidos, de cada racha seguida de ``True``."""
    if not activo.any():
        return []
    cambios = np.diff(activo.astype(int), prepend=0, append=0)
    inicios = np.flatnonzero(cambios == 1)
    fines = np.flatnonzero(cambios == -1) - 1
    return list(zip(inicios.tolist(), fines.tolist(), strict=True))


def _curva_mas_cercana(x: float, y: float, curvas: pd.DataFrame, distancia_max_m: float):
    """Fila de la curva más cercana al punto, o ``None`` si todas quedan más lejos que el máximo."""
    if curvas.empty:
        return None
    # x e y van en décimas de metro.
    distancias_m = np.hypot(curvas["x"] - x, curvas["y"] - y) / 10
    mas_cercana = distancias_m.idxmin()
    if distancias_m[mas_cercana] > distancia_max_m:
        return None
    return curvas.loc[mas_cercana]


def zonas_frenado(
    tel: pd.DataFrame,
    curvas: pd.DataFrame,
    longitud_min_m: float = 20,
    distancia_max_m: float = 500,
) -> pd.DataFrame:
    """Zonas de frenada de la vuelta, una por curva.

    Una zona es un tramo seguido con el freno pisado y de al menos ``longitud_min_m``
    (los toques cortos no cuentan). Cada zona se asigna a la curva más cercana al punto donde
    se suelta el freno, que es la entrada de la curva; las que no tienen una curva a menos de
    ``distancia_max_m`` se descartan. Si dos zonas caen en la misma curva (una chicane) se
    queda la más larga.

    ``curvas`` es la tabla de ``posicion_curvas``, en el mismo sistema que ``tel``.
    Columnas: ``curva``, ``letra``, ``inicio_m``, ``fin_m``, ``longitud_m``, ``vel_entrada``
    (al empezar a frenar), ``vel_salida`` (al soltar el freno) y ``x_inicio``/``y_inicio``,
    el punto donde empieza la frenada. Ordenadas por distancia.
    """
    if tel.empty:
        return pd.DataFrame(columns=COLUMNAS_ZONAS_FRENADO)

    distancia = tel["distancia_m"].to_numpy()
    velocidad = tel["velocidad"].to_numpy()
    frenando = (tel["freno"] > FRENO_ACTIVO).to_numpy()

    zonas = []
    for inicio, fin in _tramos(frenando):
        longitud = distancia[fin] - distancia[inicio]
        if longitud < longitud_min_m:
            continue

        # Se frena hasta la entrada de la curva: ahí se suelta el freno.
        curva = _curva_mas_cercana(
            float(tel["x"].iloc[fin]), float(tel["y"].iloc[fin]), curvas, distancia_max_m
        )
        if curva is None:
            continue

        zonas.append(
            {
                "curva": int(curva["numero"]),
                "letra": curva["letra"],
                "inicio_m": float(distancia[inicio]),
                "fin_m": float(distancia[fin]),
                "longitud_m": float(longitud),
                "vel_entrada": float(velocidad[inicio]),
                "vel_salida": float(velocidad[fin]),
                "x_inicio": float(tel["x"].iloc[inicio]),
                "y_inicio": float(tel["y"].iloc[inicio]),
            }
        )

    resultado = pd.DataFrame(zonas, columns=COLUMNAS_ZONAS_FRENADO)
    if resultado.empty:
        return resultado
    mas_larga_por_curva = resultado.groupby(["curva", "letra"])["longitud_m"].idxmax()
    resultado = resultado.loc[mas_larga_por_curva]
    return resultado.sort_values("inicio_m").reset_index(drop=True)


def zonas_alta_velocidad(
    tel: pd.DataFrame, percentil: float = 90, longitud_min_m: float = 20
) -> pd.DataFrame:
    """Tramos seguidos en que la velocidad supera el ``percentil`` de la vuelta.

    Columnas: ``inicio_m``, ``fin_m``, ``longitud_m``, ``vel_maxima`` y las posiciones
    ``x_inicio``, ``y_inicio``, ``x_fin``, ``y_fin``. Ordenadas por distancia.
    """
    if tel.empty:
        return pd.DataFrame(columns=COLUMNAS_ZONAS_ALTA_VELOCIDAD)

    umbral = np.percentile(tel["velocidad"], percentil)
    distancia = tel["distancia_m"].to_numpy()
    zonas = []
    for inicio, fin in _tramos((tel["velocidad"] >= umbral).to_numpy()):
        longitud = distancia[fin] - distancia[inicio]
        if longitud < longitud_min_m:
            continue
        zonas.append(
            {
                "inicio_m": float(distancia[inicio]),
                "fin_m": float(distancia[fin]),
                "longitud_m": float(longitud),
                "vel_maxima": float(tel["velocidad"].iloc[inicio : fin + 1].max()),
                "x_inicio": float(tel["x"].iloc[inicio]),
                "y_inicio": float(tel["y"].iloc[inicio]),
                "x_fin": float(tel["x"].iloc[fin]),
                "y_fin": float(tel["y"].iloc[fin]),
            }
        )
    return pd.DataFrame(zonas, columns=COLUMNAS_ZONAS_ALTA_VELOCIDAD)


def _porcentaje_a_fondo(tel: pd.DataFrame) -> float:
    """Porcentaje de la distancia de la vuelta recorrido con el acelerador a fondo."""
    distancia = tel["distancia_m"].to_numpy()
    tramos = np.diff(distancia)
    total = distancia[-1] - distancia[0]
    if total <= 0:
        return 0.0
    # Cada tramo cuenta con el acelerador de la muestra con la que empieza.
    a_fondo = (tel["acelerador"].to_numpy()[:-1] >= ACELERADOR_A_FONDO).astype(float)
    return float(100 * (tramos * a_fondo).sum() / total)


def resumen_circuito(tel: pd.DataFrame, zonas: pd.DataFrame) -> dict:
    """Datos para la conclusión del análisis. Solo datos, nunca texto.

    - ``pct_a_fondo``: porcentaje de la distancia con el acelerador a fondo.
    - ``vel_maxima`` y ``vel_minima``: la velocidad (km/h) y la distancia (m) donde ocurren.
    - ``frenada_mas_fuerte``: la zona de ``zonas`` que más velocidad pierde, con su curva,
      ``vel_entrada`` y ``vel_salida``; ``None`` si no hubo frenadas.
    """
    mas_rapida = tel["velocidad"].idxmax()
    mas_lenta = tel["velocidad"].idxmin()

    frenada = None
    if not zonas.empty:
        perdida = zonas["vel_entrada"] - zonas["vel_salida"]
        fuerte = zonas.loc[perdida.idxmax()]
        frenada = {
            "curva": int(fuerte["curva"]),
            "letra": fuerte["letra"],
            "vel_entrada": float(fuerte["vel_entrada"]),
            "vel_salida": float(fuerte["vel_salida"]),
        }

    return {
        "pct_a_fondo": _porcentaje_a_fondo(tel),
        "vel_maxima": {
            "kmh": float(tel["velocidad"][mas_rapida]),
            "distancia_m": float(tel["distancia_m"][mas_rapida]),
        },
        "vel_minima": {
            "kmh": float(tel["velocidad"][mas_lenta]),
            "distancia_m": float(tel["distancia_m"][mas_lenta]),
        },
        "frenada_mas_fuerte": frenada,
    }
