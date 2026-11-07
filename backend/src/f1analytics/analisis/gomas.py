"""Análisis de gomas de una carrera: qué estrategia hizo cada piloto y cuánto se gastó cada goma.

Son funciones puras. Reciben las vueltas ya limpias (``datos.limpieza``) con la edad de la goma
y, si hace falta, la tabla de stints del ``Cargador``.

**Qué se mide:** la pendiente de una recta que ajusta el tiempo de vuelta contra la edad de la
goma dentro de cada stint, en segundos por vuelta de uso. Una pendiente de 0,08 quiere decir que
la goma pierde unos 8 centésimas por vuelta. No es el desgaste «real» de la goma: también se
mezclan el tráfico, la temperatura de la pista y la evolución del asfalto, que no se pueden
corregir con estos datos.
"""

import numpy as np
import pandas as pd

# Con menos vueltas limpias que esto un stint no da una pendiente fiable.
MINIMO_VUELTAS = 5
# De la más blanda a la más dura, y después las de lluvia.
ORDEN_COMPUESTOS = ["SOFT", "MEDIUM", "HARD", "INTERMEDIATE", "WET"]

COLUMNAS_STINTS = [
    "piloto",
    "stint",
    "compuesto",
    "vuelta_inicio",
    "vuelta_fin",
    "n_vueltas",
    "edad_inicial",
    "edad_final",
    "tiempo_medio_s",
]
COLUMNAS_DEGRADACION = [
    "piloto",
    "stint",
    "compuesto",
    "n_vueltas",
    "edad_inicial",
    "edad_final",
    "pendiente_s_por_vuelta",
    "intercepto",
    "r2",
    "insuficiente",
]
COLUMNAS_COMPUESTOS = ["compuesto", "n_stints", "n_vueltas", "pendiente_s_por_vuelta", "mediana"]


def _con_edad(vueltas: pd.DataFrame) -> pd.DataFrame:
    """Solo las vueltas que cayeron dentro de un stint conocido."""
    return vueltas[vueltas["edad_goma"].notna() & vueltas["compuesto"].notna()]


def resumen_stints(vueltas: pd.DataFrame) -> pd.DataFrame:
    """Un renglón por stint con las vueltas limpias que tuvo.

    Columnas: ``piloto``, ``stint``, ``compuesto``, ``vuelta_inicio`` y ``vuelta_fin`` (la
    primera y la última vuelta limpia), ``n_vueltas``, ``edad_inicial`` y ``edad_final`` de la
    goma en esas vueltas y ``tiempo_medio_s``.
    """
    vueltas = _con_edad(vueltas)
    if vueltas.empty:
        return pd.DataFrame(columns=COLUMNAS_STINTS)

    grupos = vueltas.groupby(["piloto", "stint", "compuesto"], sort=True)
    resumen = grupos.agg(
        vuelta_inicio=("vuelta", "min"),
        vuelta_fin=("vuelta", "max"),
        n_vueltas=("vuelta", "size"),
        edad_inicial=("edad_goma", "min"),
        edad_final=("edad_goma", "max"),
        tiempo_medio_s=("tiempo_vuelta_s", "mean"),
    )
    resumen[["edad_inicial", "edad_final"]] = resumen[["edad_inicial", "edad_final"]].astype(int)
    return resumen.reset_index()[COLUMNAS_STINTS]


def _recta(edad: np.ndarray, tiempo: np.ndarray) -> tuple[float, float, float]:
    """Pendiente, intercepto y R² de ajustar ``tiempo`` contra ``edad`` por mínimos cuadrados."""
    pendiente, intercepto = np.polyfit(edad, tiempo, 1)
    residuos = tiempo - (pendiente * edad + intercepto)
    total = ((tiempo - tiempo.mean()) ** 2).sum()
    r2 = 1 - (residuos**2).sum() / total if total > 0 else 0.0
    return float(pendiente), float(intercepto), float(r2)


def degradacion_por_stint(
    vueltas: pd.DataFrame,
    columna: str = "tiempo_corregido_s",
    minimo_vueltas: int = MINIMO_VUELTAS,
) -> pd.DataFrame:
    """Cuánto se gasta la goma en cada stint: la pendiente del tiempo de vuelta contra su edad.

    ``columna`` es el tiempo a ajustar: ``tiempo_corregido_s`` (con la corrección por combustible)
    o ``tiempo_vuelta_s`` (sin corregir). Los stints con menos de ``minimo_vueltas`` vueltas
    limpias, o cuya goma no cambió de edad, quedan con ``insuficiente=True`` y sin pendiente.

    Columnas: ``piloto``, ``stint``, ``compuesto``, ``n_vueltas``, ``edad_inicial``,
    ``edad_final``, ``pendiente_s_por_vuelta`` (positiva: la goma pierde tiempo al gastarse),
    ``intercepto``, ``r2`` e ``insuficiente``.
    """
    filas = []
    for (piloto, stint, compuesto), grupo in _con_edad(vueltas).groupby(
        ["piloto", "stint", "compuesto"], sort=True
    ):
        edad = grupo["edad_goma"].to_numpy(dtype=float)
        suficiente = len(grupo) >= minimo_vueltas and np.ptp(edad) > 0
        pendiente, intercepto, r2 = (
            _recta(edad, grupo[columna].to_numpy(dtype=float))
            if (suficiente)
            else (np.nan, np.nan, np.nan)
        )
        filas.append(
            {
                "piloto": piloto,
                "stint": stint,
                "compuesto": compuesto,
                "n_vueltas": len(grupo),
                "edad_inicial": int(edad.min()),
                "edad_final": int(edad.max()),
                "pendiente_s_por_vuelta": pendiente,
                "intercepto": intercepto,
                "r2": r2,
                "insuficiente": not suficiente,
            }
        )
    return pd.DataFrame(filas, columns=COLUMNAS_DEGRADACION).astype({"insuficiente": bool})


def comparar_compuestos(degradacion: pd.DataFrame) -> pd.DataFrame:
    """Degradación media de cada compuesto, sin contar los stints insuficientes.

    ``pendiente_s_por_vuelta`` es el promedio de los stints ponderado por sus vueltas (un stint
    largo pesa más que uno corto) y ``mediana`` la mediana de las pendientes. Ordenado de la
    goma más blanda a la más dura.
    """
    validos = degradacion[~degradacion["insuficiente"].astype(bool)]
    if validos.empty:
        return pd.DataFrame(columns=COLUMNAS_COMPUESTOS)

    filas = []
    for compuesto, grupo in validos.groupby("compuesto"):
        filas.append(
            {
                "compuesto": compuesto,
                "n_stints": len(grupo),
                "n_vueltas": int(grupo["n_vueltas"].sum()),
                "pendiente_s_por_vuelta": float(
                    np.average(grupo["pendiente_s_por_vuelta"], weights=grupo["n_vueltas"])
                ),
                "mediana": float(grupo["pendiente_s_por_vuelta"].median()),
            }
        )
    tabla = pd.DataFrame(filas, columns=COLUMNAS_COMPUESTOS)
    orden = {c: i for i, c in enumerate(ORDEN_COMPUESTOS)}
    tabla = tabla.sort_values("compuesto", key=lambda s: s.map(orden).fillna(len(orden)))
    return tabla.reset_index(drop=True)


def resumen_gomas(degradacion: pd.DataFrame, stints: pd.DataFrame) -> dict:
    """Datos para la conclusión. Solo datos, nunca texto.

    - ``n_stints_validos`` y ``n_stints_insuficientes``: cuántos stints tienen pendiente.
    - ``n_stints_sin_degradacion``: cuántos de los válidos tienen pendiente cero o negativa
      (el tráfico o la evolución de la pista taparon el desgaste).
    - ``compuesto_mas_degradante`` y ``compuesto_menos_degradante``: ``compuesto`` y
      ``pendiente_s_por_vuelta``; ``None`` si solo hay un compuesto con datos.
    - ``stint_mas_largo``: ``piloto``, ``compuesto`` y ``vueltas`` (de la tabla completa de
      stints, no solo de las vueltas limpias); ``None`` si no hay stints.
    - ``paradas_por_piloto``: promedio de paradas (stints menos uno) por piloto.
    """
    validos = degradacion[~degradacion["insuficiente"].astype(bool)]
    comparacion = comparar_compuestos(degradacion)

    mas = menos = None
    if len(comparacion) >= 2:
        orden = comparacion.sort_values("pendiente_s_por_vuelta")
        menos_fila, mas_fila = orden.iloc[0], orden.iloc[-1]
        menos = {
            "compuesto": menos_fila["compuesto"],
            "pendiente_s_por_vuelta": float(menos_fila["pendiente_s_por_vuelta"]),
        }
        mas = {
            "compuesto": mas_fila["compuesto"],
            "pendiente_s_por_vuelta": float(mas_fila["pendiente_s_por_vuelta"]),
        }

    largo = None
    paradas = 0.0
    if not stints.empty:
        vueltas = stints["vuelta_fin"] - stints["vuelta_inicio"] + 1
        fila = stints.loc[vueltas.idxmax()]
        largo = {
            "piloto": int(fila["piloto"]),
            "compuesto": fila["compuesto"],
            "vueltas": int(vueltas.max()),
        }
        paradas = float(stints.groupby("piloto").size().sub(1).mean())

    return {
        "n_stints_validos": len(validos),
        "n_stints_insuficientes": int(degradacion["insuficiente"].sum()),
        "n_stints_sin_degradacion": int((validos["pendiente_s_por_vuelta"] <= 0).sum()),
        "compuesto_mas_degradante": mas,
        "compuesto_menos_degradante": menos,
        "stint_mas_largo": largo,
        "paradas_por_piloto": paradas,
    }
