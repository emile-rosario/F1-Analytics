"""Limpieza de las vueltas de una carrera para poder medir cómo se desgastan las gomas.

Una vuelta lenta no prueba que la goma esté gastada: puede ser la primera vuelta con la parrilla
llena, una entrada o salida de boxes, un safety car o tráfico. Aquí se quitan las que no sirven
y se agregan la edad de la goma y una corrección por el combustible que se va quemando.

Son funciones puras sobre las tablas del ``Cargador``: no hablan con OpenF1.
"""

import numpy as np
import pandas as pd

ESTADOS_PISTA = ("verde", "amarilla", "vsc", "sc", "roja")
# Cuánto más rápido se vuelve un coche por vuelta al quemar combustible. Es una aproximación
# (según el circuito y el equipo va de 0,03 a 0,07 s); se puede cambiar.
SEGUNDOS_POR_VUELTA = 0.06
# Una vuelta de más de este múltiplo de la mediana del piloto es tráfico, error o bandera.
UMBRAL_MEDIANA = 1.07

# Peso de cada estado cuando varios coinciden en la misma vuelta: manda el más serio.
_GRAVEDAD = {estado: i for i, estado in enumerate(ESTADOS_PISTA)}


def estado_pista_por_vuelta(direccion_carrera: pd.DataFrame, n_vueltas: int) -> pd.Series:
    """Estado de la pista en cada vuelta de la carrera, de 1 a ``n_vueltas``.

    Valores: ``verde``, ``amarilla`` (bandera amarilla en toda la pista; las de un solo sector
    no cuentan porque no se sabe dónde estaba cada piloto), ``vsc``, ``sc`` y ``roja``. Si en
    una vuelta pasan varias cosas manda la más seria.

    Las vueltas se toman del número de vuelta del líder que trae la dirección de carrera: un
    coche rezagado puede vivir el safety car una vuelta antes o después. Es una aproximación.
    """
    estados = np.zeros(n_vueltas + 2, dtype=int)  # índice = vuelta; 0 es «verde»

    def marcar(desde: int, hasta: int, estado: str) -> None:
        desde, hasta = max(desde, 1), min(hasta, n_vueltas)
        if desde > hasta:
            return
        tramo = estados[desde : hasta + 1]
        np.maximum(tramo, _GRAVEDAD[estado], out=tramo)

    inicio_sc = inicio_vsc = inicio_roja = None
    eventos = direccion_carrera.sort_values("fecha", kind="stable")
    for fila in eventos.itertuples():
        vuelta = int(fila.vuelta) if pd.notna(fila.vuelta) else 1
        mensaje = str(fila.mensaje or "").upper()
        categoria = str(fila.categoria or "")

        if categoria == "SafetyCar":
            if mensaje == "SAFETY CAR DEPLOYED":
                inicio_sc = vuelta if inicio_sc is None else inicio_sc
            elif mensaje == "SAFETY CAR IN THIS LAP" and inicio_sc is not None:
                marcar(inicio_sc, vuelta, "sc")
                inicio_sc = None
            elif mensaje == "VIRTUAL SAFETY CAR DEPLOYED":
                inicio_vsc = vuelta if inicio_vsc is None else inicio_vsc
            elif mensaje == "VIRTUAL SAFETY CAR ENDING" and inicio_vsc is not None:
                marcar(inicio_vsc, vuelta, "vsc")
                inicio_vsc = None
        elif categoria == "Flag" and fila.ambito == "Track":
            if fila.bandera == "RED":
                inicio_roja = vuelta if inicio_roja is None else inicio_roja
            elif fila.bandera in ("YELLOW", "DOUBLE YELLOW"):
                marcar(vuelta, vuelta, "amarilla")
        elif categoria == "SessionStatus" and mensaje == "SESSION STARTED" and inicio_roja:
            marcar(inicio_roja, vuelta, "roja")
            inicio_roja = None

    # Lo que sigue abierto al final de la carrera dura hasta la última vuelta.
    for inicio, estado in ((inicio_sc, "sc"), (inicio_vsc, "vsc"), (inicio_roja, "roja")):
        if inicio is not None:
            marcar(inicio, n_vueltas, estado)

    vueltas = pd.RangeIndex(1, n_vueltas + 1, name="vuelta")
    return pd.Series(
        [ESTADOS_PISTA[i] for i in estados[1 : n_vueltas + 1]], index=vueltas, name="estado_pista"
    )


def limpiar_vueltas_carrera(
    vueltas: pd.DataFrame,
    paradas: pd.DataFrame,
    estado_pista: pd.Series,
    *,
    quitar_primera: bool = True,
    solo_verde: bool = True,
    quitar_pits: bool = True,
    umbral_mediana: float | None = UMBRAL_MEDIANA,
) -> pd.DataFrame:
    """Deja solo las vueltas que sirven para medir el desgaste de la goma.

    Siempre se quitan las vueltas sin tiempo. Cada filtro se puede apagar:

    - ``quitar_primera``: la vuelta 1, con la parrilla llena y salida parada.
    - ``solo_verde``: las vueltas con safety car, VSC, bandera roja o amarilla en pista.
    - ``quitar_pits``: la vuelta de entrada a boxes y la de salida.
    - ``umbral_mediana``: las que tardan más de este múltiplo de la mediana de las vueltas
      que le quedan a ese piloto (tráfico, errores). ``None`` lo apaga.

    Devuelve las columnas de ``vueltas`` más ``estado_pista``.
    """
    limpias = vueltas[vueltas["tiempo_vuelta_s"].notna()].copy()
    limpias["estado_pista"] = limpias["vuelta"].map(estado_pista).fillna("verde")

    if quitar_primera:
        limpias = limpias[limpias["vuelta"] != 1]
    if solo_verde:
        limpias = limpias[limpias["estado_pista"] == "verde"]
    if quitar_pits:
        limpias = limpias[~limpias["salida_pits"]]
        entradas = set(zip(paradas["piloto"], paradas["vuelta"], strict=True))
        en_boxes = [
            (p, v) in entradas for p, v in zip(limpias["piloto"], limpias["vuelta"], strict=True)
        ]
        limpias = limpias[~np.array(en_boxes, dtype=bool)]
    if umbral_mediana is not None and not limpias.empty:
        mediana = limpias.groupby("piloto")["tiempo_vuelta_s"].transform("median")
        limpias = limpias[limpias["tiempo_vuelta_s"] <= mediana * umbral_mediana]

    return limpias.reset_index(drop=True)


def agregar_edad_goma(vueltas: pd.DataFrame, stints: pd.DataFrame) -> pd.DataFrame:
    """Agrega ``stint``, ``compuesto`` y ``edad_goma`` a cada vuelta.

    La edad es la que traía la goma al salir (``edad_inicial``, mayor que 0 en gomas ya usadas)
    más las vueltas desde que empezó el stint. Una vuelta que no cae en ningún stint (OpenF1 a
    veces deja huecos) queda sin compuesto y sin edad.
    """
    if vueltas.empty:
        return vueltas.assign(stint=pd.NA, compuesto=pd.NA, edad_goma=np.nan)

    stints = stints.assign(
        edad_inicial=stints["edad_inicial"].fillna(0),
        vuelta_fin=stints["vuelta_fin"].fillna(np.inf),
    )
    unidas = pd.merge_asof(
        vueltas.sort_values("vuelta"),
        stints.sort_values("vuelta_inicio")[
            ["piloto", "stint", "compuesto", "vuelta_inicio", "vuelta_fin", "edad_inicial"]
        ],
        left_on="vuelta",
        right_on="vuelta_inicio",
        by="piloto",
        direction="backward",
    )
    fuera = unidas["vuelta"] > unidas["vuelta_fin"]
    unidas.loc[fuera, ["stint", "compuesto", "vuelta_inicio", "edad_inicial"]] = np.nan
    unidas["edad_goma"] = unidas["edad_inicial"] + (unidas["vuelta"] - unidas["vuelta_inicio"])
    unidas["stint"] = unidas["stint"].astype("Int64")
    resultado = unidas.drop(columns=["vuelta_inicio", "vuelta_fin", "edad_inicial"])
    return resultado.sort_values(["piloto", "vuelta"]).reset_index(drop=True)


def agregar_correccion_combustible(
    vueltas: pd.DataFrame, segundos_por_vuelta: float = SEGUNDOS_POR_VUELTA
) -> pd.DataFrame:
    """Agrega ``tiempo_corregido_s``: lo que habría tardado la vuelta con el combustible de la 1.

    A medida que se quema combustible el coche pesa menos y es más rápido, aunque la goma se
    gaste. Sin corregir eso, el desgaste se ve menor de lo que es. Se suma a cada vuelta lo que
    el coche ya había ganado por ser más ligero: ``segundos_por_vuelta`` por cada vuelta pasada.
    """
    return vueltas.assign(
        tiempo_corregido_s=vueltas["tiempo_vuelta_s"]
        + segundos_por_vuelta * (vueltas["vuelta"] - 1)
    )
