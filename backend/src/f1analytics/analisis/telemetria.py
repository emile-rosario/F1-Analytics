"""Comparación de dos vueltas metro a metro: dónde gana tiempo un piloto sobre otro.

Son funciones puras: reciben la telemetría de dos vueltas (la que devuelve
``datos.telemetria_vuelta.telemetria_de_vuelta``) y devuelven tablas y diccionarios. No hablan
con OpenF1 ni con el disco.

El camino es siempre el mismo:

1. ``alinear_vueltas`` lleva las dos vueltas a una misma rejilla de distancia (cada 5 m), porque
   las muestras de OpenF1 (~3,7 por segundo) no caen en los mismos metros en las dos vueltas.
2. ``delta_tiempo`` calcula cuánto lleva de ventaja o de desventaja uno sobre el otro en cada
   metro.
3. ``ganador_por_minisector`` parte la vuelta en tramos iguales y dice quién fue más rápido en
   cada uno.
4. ``resumen_telemetria`` junta los datos de la conclusión.

Convención de signo: el piloto **A** es la referencia y el **B** el que se compara. Un delta
**positivo** significa que B va más lento que A (B ha perdido ese tiempo); uno negativo, que B
va por delante.
"""

import numpy as np
import pandas as pd

from f1analytics.analisis.circuito import ACELERADOR_A_FONDO

# Canales que se interpolan en línea recta entre dos muestras.
CANALES_CONTINUOS = ["tiempo_s", "x", "y", "velocidad", "acelerador", "rpm"]
# Canales que valen 0/100 o un entero (marcha, DRS): interpolar daría valores que no existen,
# así que se toma el de la muestra más cercana.
CANALES_DISCRETOS = ["freno", "marcha", "drs"]
CANALES = CANALES_CONTINUOS + CANALES_DISCRETOS

# Por debajo de esta velocidad (m/s) no se divide: con el coche casi parado ds / v se dispara.
VELOCIDAD_MINIMA_MS = 0.5
# Diferencias menores que esto (segundos) se consideran empate. Contra los tiempos oficiales de
# sector, el delta se equivoca 0,04 s de media (0,13 s como máximo) tras 1/3 de vuelta, así que
# una diferencia de un solo minisector por debajo de 0,01 s no se puede distinguir de ese error.
EMPATE_S = 0.01

# Ancho (metros) de la media móvil que alisa el delta. La velocidad llega cada ~20 m (3,7 Hz) y en
# las curvas lentas una sola muestra movida mueve el delta hasta 0,12 s en un tramo corto: un
# salto que no es una ventaja real. Medido en Bahréin 2024, con 105 m ese dentado baja de 124 a
# 23 ms (con 65 m quedaba de 51). No lo arregla todo: los lomos anchos que el delta hace en las
# frenadas fuertes solo bajan una mediana del 26 %. Y tiene un coste: el alisado también redondea
# cambios reales y el error contra los sectores oficiales sube de 0,035 a 0,042 s de media
# (0,107 a 0,132 s de máximo; 10 comparaciones, ``scripts/validar_delta.py``).
VENTANA_SUAVIZADO_M = 105.0

COLUMNAS_GANADORES = ["sector", "inicio_m", "fin_m", "diferencia_s", "ganador"]


def _validar(tel: pd.DataFrame) -> None:
    if len(tel) < 2:
        raise ValueError("Hacen falta al menos dos muestras para remuestrear una vuelta")


def _rejilla(largo_m: float, paso_m: float) -> np.ndarray:
    """Distancias 0, paso, 2·paso… y, al final, el largo exacto (el último paso puede ser corto)."""
    if paso_m <= 0:
        raise ValueError("El paso tiene que ser mayor que cero")
    puntos = np.arange(0.0, largo_m, paso_m)
    return np.append(puntos, largo_m)


def _interpolar(tel: pd.DataFrame, rejilla: np.ndarray) -> pd.DataFrame:
    """Valor de cada canal en las distancias de ``rejilla``."""
    # La distancia sale de integrar una velocidad que puede ser 0: si se repite, se queda con la
    # última muestra para que ``np.interp`` reciba una distancia creciente.
    unica = tel.drop_duplicates("distancia_m", keep="last")
    distancia = unica["distancia_m"].to_numpy(dtype=float)

    remuestreada = {"distancia_m": rejilla}
    for canal in CANALES_CONTINUOS:
        remuestreada[canal] = np.interp(rejilla, distancia, unica[canal].to_numpy(dtype=float))
    # Muestra más cercana: la anterior o la siguiente a la distancia pedida.
    siguiente = np.clip(np.searchsorted(distancia, rejilla), 1, len(distancia) - 1)
    anterior = siguiente - 1
    mas_cerca = np.where(
        rejilla - distancia[anterior] <= distancia[siguiente] - rejilla, anterior, siguiente
    )
    for canal in CANALES_DISCRETOS:
        remuestreada[canal] = unica[canal].to_numpy()[mas_cerca]
    return pd.DataFrame(remuestreada)[["distancia_m", *CANALES]]


def remuestrear_por_distancia(tel: pd.DataFrame, paso_m: float = 5.0) -> pd.DataFrame:
    """Lleva una vuelta de «una fila por muestra en el tiempo» a «una fila cada ``paso_m`` metros».

    Los canales continuos (velocidad, acelerador, posición…) se interpolan en línea recta; los
    discretos (freno, marcha, DRS) toman el valor de la muestra más cercana.
    """
    _validar(tel)
    return _interpolar(tel, _rejilla(float(tel["distancia_m"].max()), paso_m))


def alinear_vueltas(tel_a: pd.DataFrame, tel_b: pd.DataFrame, paso_m: float = 5.0) -> pd.DataFrame:
    """Junta dos vueltas en una tabla con una fila por cada ``paso_m`` metros.

    Columnas: ``distancia_m`` y cada canal con sufijo ``_a`` o ``_b`` (``velocidad_a``,
    ``freno_b``…).

    La distancia de cada vuelta sale de integrar su velocidad, y ese cálculo se equivoca un poco
    (~1 %) y distinto en cada vuelta. Las dos vueltas recorren el mismo circuito, así que se
    estiran para que midan lo mismo (el promedio de las dos). Sin esto, el error se acumularía
    y al final de la vuelta se compararía un punto de la pista con otro a decenas de metros.
    """
    _validar(tel_a)
    _validar(tel_b)
    largo_a = float(tel_a["distancia_m"].max())
    largo_b = float(tel_b["distancia_m"].max())
    largo = (largo_a + largo_b) / 2
    rejilla = _rejilla(largo, paso_m)

    estirada_a = tel_a.assign(distancia_m=tel_a["distancia_m"] * (largo / largo_a))
    estirada_b = tel_b.assign(distancia_m=tel_b["distancia_m"] * (largo / largo_b))
    vuelta_a = _interpolar(estirada_a, rejilla).drop(columns="distancia_m").add_suffix("_a")
    vuelta_b = _interpolar(estirada_b, rejilla).drop(columns="distancia_m").add_suffix("_b")
    return pd.concat([pd.Series(rejilla, name="distancia_m"), vuelta_a, vuelta_b], axis=1)


def _tiempo_acumulado(distancia: np.ndarray, velocidad_kmh: np.ndarray) -> np.ndarray:
    """Segundos desde la meta hasta cada distancia, integrando ``ds / v`` (regla del trapecio)."""
    velocidad_ms = np.maximum(velocidad_kmh / 3.6, VELOCIDAD_MINIMA_MS)
    lentitud = 1 / velocidad_ms  # segundos por metro
    tramos = np.diff(distancia) * (lentitud[1:] + lentitud[:-1]) / 2
    return np.concatenate([[0.0], np.cumsum(tramos)])


def _alisar(valores: np.ndarray, distancia: np.ndarray, ventana_m: float) -> np.ndarray:
    """Media móvil centrada de ``ventana_m`` metros que respeta los dos extremos.

    En los bordes la serie se refleja *respecto al extremo* (reflexión impar), así la media de
    la ventana en el primer y en el último punto vale exactamente el valor del extremo: el delta
    sigue empezando en 0 y terminando en la diferencia oficial. Una recta queda igual.
    """
    paso = float(np.median(np.diff(distancia)))
    mitad = int(ventana_m / paso) // 2
    if mitad < 1 or len(valores) < 3:
        return valores
    relleno = np.pad(valores, mitad, mode="reflect", reflect_type="odd")
    alisados = np.convolve(relleno, np.ones(2 * mitad + 1) / (2 * mitad + 1), mode="valid")
    # Matemáticamente ya valen eso; se fijan para quitar el error de redondeo de la suma.
    alisados[[0, -1]] = valores[[0, -1]]
    return alisados


def delta_tiempo(
    alineadas: pd.DataFrame,
    duracion_a_s: float | None = None,
    duracion_b_s: float | None = None,
    ventana_m: float = VENTANA_SUAVIZADO_M,
) -> pd.Series:
    """Delta acumulado en cada metro: segundos que B lleva de más (positivo) o de menos sobre A.

    Se calcula el tiempo que cada piloto tarda en llegar a cada metro integrando ``ds / v`` y se
    restan: ``tiempo_b - tiempo_a``. Esa integración con ~3,7 muestras por segundo acumula
    error, y el tiempo total no cuadra con el cronometrado. Si se pasan las duraciones
    oficiales (``lap_duration``), el tiempo de cada vuelta se escala para terminar justo en su
    duración oficial, y el delta final queda igual a la diferencia oficial. El error que había
    se reparte a lo largo de la vuelta en proporción al tiempo, y el delta del medio sigue
    siendo una estimación: el final es el único punto exacto.

    Por último el delta se alisa con una media móvil de ``ventana_m`` metros (0 para no alisar),
    porque con una muestra cada ~20 m un salto de velocidad en una curva lenta deja un pico
    de decenas de milisegundos que no es una ventaja real. El alisado no mueve ni el inicio ni
    el final; a cambio redondea un poco los cambios reales y sube el error contra los tiempos
    oficiales de sector (ver ``VENTANA_SUAVIZADO_M``).

    Devuelve una serie con el mismo índice que ``alineadas``.
    """
    distancia = alineadas["distancia_m"].to_numpy(dtype=float)
    tiempo_a = _tiempo_acumulado(distancia, alineadas["velocidad_a"].to_numpy(dtype=float))
    tiempo_b = _tiempo_acumulado(distancia, alineadas["velocidad_b"].to_numpy(dtype=float))
    if duracion_a_s is not None:
        tiempo_a = tiempo_a * (duracion_a_s / tiempo_a[-1])
    if duracion_b_s is not None:
        tiempo_b = tiempo_b * (duracion_b_s / tiempo_b[-1])
    delta = _alisar(tiempo_b - tiempo_a, distancia, ventana_m)
    return pd.Series(delta, index=alineadas.index, name="delta_s")


def _quien_gana(diferencia_s: float, empate_s: float = EMPATE_S) -> str:
    """``"a"`` si B perdió tiempo, ``"b"`` si lo ganó y ``"empate"`` si casi no hay diferencia."""
    if diferencia_s > empate_s:
        return "a"
    if diferencia_s < -empate_s:
        return "b"
    return "empate"


def ganador_por_minisector(
    alineadas: pd.DataFrame, delta: pd.Series, n_sectores: int = 25
) -> pd.DataFrame:
    """Parte la vuelta en ``n_sectores`` tramos de igual longitud y dice quién ganó cada uno.

    En cada tramo, la diferencia es lo que cambió el delta entre su inicio y su fin: positiva
    si B perdió tiempo (gana A), negativa si lo ganó (gana B). Los minisectores oficiales se
    descartaron porque su cantidad cambia de un circuito a otro y casi la mitad no tiene.

    Columnas: ``sector`` (desde 0), ``inicio_m``, ``fin_m``, ``diferencia_s`` y ``ganador``
    (``"a"``, ``"b"`` o ``"empate"``).
    """
    if n_sectores < 1:
        raise ValueError("Tiene que haber al menos un sector")
    distancia = alineadas["distancia_m"].to_numpy(dtype=float)
    largo = distancia[-1]
    limites = np.linspace(0.0, largo, n_sectores + 1)
    # El delta en el límite exacto de cada sector, aunque no caiga en un punto de la rejilla.
    delta_en_limites = np.interp(limites, distancia, delta.to_numpy(dtype=float))

    filas = []
    for sector in range(n_sectores):
        diferencia = float(delta_en_limites[sector + 1] - delta_en_limites[sector])
        filas.append(
            {
                "sector": sector,
                "inicio_m": float(limites[sector]),
                "fin_m": float(limites[sector + 1]),
                "diferencia_s": diferencia,
                "ganador": _quien_gana(diferencia),
            }
        )
    return pd.DataFrame(filas, columns=COLUMNAS_GANADORES)


def _porcentaje_a_fondo(distancia: np.ndarray, acelerador: np.ndarray) -> float:
    """Porcentaje de la distancia recorrido con el acelerador a fondo."""
    total = distancia[-1] - distancia[0]
    if total <= 0:
        return 0.0
    a_fondo = (acelerador[:-1] >= ACELERADOR_A_FONDO).astype(float)
    return float(100 * (np.diff(distancia) * a_fondo).sum() / total)


def _extremo(alineadas: pd.DataFrame, columna: str, maximo: bool) -> dict:
    velocidad = alineadas[columna]
    indice = velocidad.idxmax() if maximo else velocidad.idxmin()
    return {"kmh": float(velocidad[indice]), "distancia_m": float(alineadas["distancia_m"][indice])}


def _mayor_ventaja(ganadores: pd.DataFrame, quien: str) -> dict | None:
    """El minisector donde ``quien`` ("a" o "b") sacó más tiempo, o ``None`` si no ganó ninguno."""
    ganados = ganadores[ganadores["ganador"] == quien]
    if ganados.empty:
        return None
    fila = ganados.loc[ganados["diferencia_s"].abs().idxmax()]
    return {
        "sector": int(fila["sector"]),
        "inicio_m": float(fila["inicio_m"]),
        "fin_m": float(fila["fin_m"]),
        "ventaja_s": float(abs(fila["diferencia_s"])),
    }


def resumen_telemetria(alineadas: pd.DataFrame, delta: pd.Series, ganadores: pd.DataFrame) -> dict:
    """Datos para la conclusión de la comparación. Solo datos, nunca texto.

    - ``delta_final_s``: lo que B pierde (positivo) o gana (negativo) en toda la vuelta.
    - ``ganador``: ``"a"``, ``"b"`` o ``"empate"`` en la vuelta completa.
    - ``sectores_ganados``: cuántos minisectores ganó cada uno (``a``, ``b``, ``empate``).
    - ``mayor_ventaja``: para ``a`` y para ``b``, el minisector donde sacó más tiempo
      (``sector``, ``inicio_m``, ``fin_m``, ``ventaja_s``), o ``None`` si no ganó ninguno.
    - ``pct_a_fondo``, ``vel_maxima`` y ``vel_minima``: por piloto (``a`` y ``b``). La velocidad
      lleva ``kmh`` y la ``distancia_m`` donde ocurre.
    """
    delta_final = float(delta.iloc[-1])
    cuenta = ganadores["ganador"].value_counts()
    distancia = alineadas["distancia_m"].to_numpy(dtype=float)

    pilotos = ("a", "b")
    return {
        "delta_final_s": delta_final,
        "ganador": _quien_gana(delta_final),
        "sectores_ganados": {clave: int(cuenta.get(clave, 0)) for clave in ("a", "b", "empate")},
        "mayor_ventaja": {letra: _mayor_ventaja(ganadores, letra) for letra in pilotos},
        "pct_a_fondo": {
            letra: _porcentaje_a_fondo(
                distancia, alineadas[f"acelerador_{letra}"].to_numpy(dtype=float)
            )
            for letra in pilotos
        },
        "vel_maxima": {
            letra: _extremo(alineadas, f"velocidad_{letra}", maximo=True) for letra in pilotos
        },
        "vel_minima": {
            letra: _extremo(alineadas, f"velocidad_{letra}", maximo=False) for letra in pilotos
        },
    }
