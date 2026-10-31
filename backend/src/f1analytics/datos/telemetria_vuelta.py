"""Telemetría de una vuelta: velocidad, pedales y posición X/Y en el tiempo y la distancia."""

import numpy as np
import pandas as pd

from f1analytics.datos.cargador import Cargador
from f1analytics.datos.errores import ErrorDatos

# car_data y location llegan con relojes distintos: se unen si distan menos que esto.
TOLERANCIA_UNION = pd.Timedelta(milliseconds=300)

# Con menos muestras por segundo o con huecos largos la vuelta no sirve para comparar.
MIN_MUESTRAS_POR_S = 2.0
HUECO_MAXIMO_S = 2.0

COLUMNAS = [
    "tiempo_s",
    "distancia_m",
    "x",
    "y",
    "velocidad",
    "acelerador",
    "freno",
    "marcha",
    "rpm",
    "drs",
]

SEGMENTOS = {"Q1": 1, "Q2": 2, "Q3": 3}
SEGMENTOS_SPRINT = {"SQ1": 1, "SQ2": 2, "SQ3": 3}
SESIONES_SPRINT_CLASIFICACION = {"Sprint Qualifying", "Sprint Shootout"}


def _formato_fecha(fecha: pd.Timestamp) -> str:
    return fecha.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"


def _datos_de_vuelta(cargador: Cargador, sesion: int, piloto: int, vuelta: int) -> pd.Series:
    vueltas = cargador.vueltas(sesion, piloto)
    if vueltas.empty:
        raise ErrorDatos("piloto_no_encontrado")
    fila = vueltas[vueltas["vuelta"] == vuelta]
    if fila.empty or pd.isna(fila.iloc[0]["tiempo_vuelta_s"]):
        raise ErrorDatos("sin_telemetria")
    return fila.iloc[0]


def _canal(
    cargador: Cargador, endpoint: str, sesion: int, piloto: int, desde, hasta
) -> pd.DataFrame:
    crudo = cargador.cliente.obtener(
        endpoint,
        {
            "session_key": sesion,
            "driver_number": piloto,
            "date>": _formato_fecha(desde),
            "date<": _formato_fecha(hasta),
        },
        cachear=cargador.sesion_terminada(sesion),
    )
    if crudo.empty:
        raise ErrorDatos("sin_telemetria")
    crudo["date"] = pd.to_datetime(crudo["date"], utc=True, format="ISO8601")
    return crudo.sort_values("date").reset_index(drop=True)


def telemetria_de_vuelta(cargador: Cargador, sesion: int, piloto: int, vuelta: int) -> pd.DataFrame:
    """Telemetría de una vuelta, con ``tiempo_s`` y ``distancia_m`` desde la línea de meta.

    La distancia sale de integrar la velocidad: es más precisa que sumar tramos X/Y,
    que con ~3,7 muestras por segundo cortan las curvas.
    """
    datos = _datos_de_vuelta(cargador, sesion, piloto, vuelta)
    inicio = datos["inicio"]
    duracion = float(datos["tiempo_vuelta_s"])
    fin = inicio + pd.Timedelta(seconds=duracion)

    coche = _canal(cargador, "car_data", sesion, piloto, inicio, fin)
    posicion = _canal(cargador, "location", sesion, piloto, inicio, fin)

    if len(coche) < MIN_MUESTRAS_POR_S * duracion or len(posicion) < MIN_MUESTRAS_POR_S * duracion:
        raise ErrorDatos("telemetria_incompleta")
    if coche["date"].diff().dt.total_seconds().max() > HUECO_MAXIMO_S:
        raise ErrorDatos("telemetria_incompleta")

    unida = pd.merge_asof(
        coche,
        posicion[["date", "x", "y"]],
        on="date",
        direction="nearest",
        tolerance=TOLERANCIA_UNION,
    )
    unida[["x", "y"]] = unida[["x", "y"]].interpolate(limit_direction="both")

    tiempo_s = (unida["date"] - inicio).dt.total_seconds().to_numpy()
    velocidad_ms = unida["speed"].to_numpy(dtype=float) / 3.6
    # Regla del trapecio: distancia acumulada entre muestras consecutivas.
    tramos = np.diff(tiempo_s) * (velocidad_ms[1:] + velocidad_ms[:-1]) / 2
    distancia_m = np.concatenate([[0.0], np.cumsum(tramos)])

    return pd.DataFrame(
        {
            "tiempo_s": tiempo_s,
            "distancia_m": distancia_m,
            "x": unida["x"],
            "y": unida["y"],
            "velocidad": unida["speed"],
            "acelerador": unida["throttle"],
            "freno": unida["brake"],
            "marcha": unida["n_gear"],
            "rpm": unida["rpm"],
            "drs": unida["drs"],
        }
    )[COLUMNAS]


def _ventana_de_fase(direccion: pd.DataFrame, fase: int) -> tuple[pd.Timestamp, pd.Timestamp]:
    """Inicio y fin de Q1, Q2 o Q3 según los mensajes de la dirección de carrera."""
    estados = direccion[
        (direccion["categoria"] == "SessionStatus") & (direccion["fase_clasificacion"] == fase)
    ]
    if estados.empty:
        raise ErrorDatos("analisis_no_disponible")
    inicio = estados[estados["mensaje"] == "SESSION STARTED"]["fecha"].min()
    fin = estados[estados["mensaje"] == "SESSION FINISHED"]["fecha"].max()
    if pd.isna(inicio) or pd.isna(fin):
        raise ErrorDatos("analisis_no_disponible")
    return inicio, fin


def vuelta_rapida(cargador: Cargador, sesion: int, piloto: int, segmento: str | None = None) -> int:
    """Número de la vuelta más rápida del piloto en toda la sesión o en un segmento.

    ``segmento`` es ``None``, ``"Q1"``/``"Q2"``/``"Q3"`` (clasificación) o
    ``"SQ1"``/``"SQ2"``/``"SQ3"`` (clasificación sprint). Una vuelta pertenece al
    segmento en el que empezó.
    """
    vueltas = cargador.vueltas(sesion, piloto)
    if vueltas.empty:
        raise ErrorDatos("piloto_no_encontrado")

    if segmento is not None:
        nombre = cargador.info_sesion(sesion)["nombre"]
        if segmento in SEGMENTOS and nombre == "Qualifying":
            fase = SEGMENTOS[segmento]
        elif segmento in SEGMENTOS_SPRINT and nombre in SESIONES_SPRINT_CLASIFICACION:
            fase = SEGMENTOS_SPRINT[segmento]
        else:
            raise ErrorDatos("analisis_no_disponible")
        desde, hasta = _ventana_de_fase(cargador.direccion_carrera(sesion), fase)
        vueltas = vueltas[(vueltas["inicio"] >= desde) & (vueltas["inicio"] <= hasta)]

    validas = vueltas[vueltas["tiempo_vuelta_s"].notna() & ~vueltas["salida_pits"]]
    if validas.empty:
        raise ErrorDatos("sin_telemetria")
    return int(validas.loc[validas["tiempo_vuelta_s"].idxmin(), "vuelta"])
