"""Análisis de gomas: estrategias de toda la carrera y degradación de cada stint."""

from typing import Annotated

import pandas as pd
from fastapi import APIRouter, Query, Request

from f1analytics.analisis.gomas import (
    comparar_compuestos,
    degradacion_por_stint,
    resumen_gomas,
)
from f1analytics.api.esquemas import (
    AjusteRecta,
    AnalisisGomas,
    DegradacionCompuesto,
    DegradacionStint,
    EstrategiaPiloto,
    Piloto,
    ResumenGomas,
    StintEstrategia,
    VueltaGoma,
)
from f1analytics.api.limites import ip_del_cliente
from f1analytics.api.rutas.comunes import (
    RESPUESTAS_ERROR,
    CargadorDep,
    ConcurrenciaDep,
    LimitadorIpDep,
    limitar_por_ip,
)
from f1analytics.datos.cargador import Cargador
from f1analytics.datos.errores import ErrorDatos
from f1analytics.datos.limpieza import (
    SEGUNDOS_POR_VUELTA,
    agregar_correccion_combustible,
    agregar_edad_goma,
    estado_pista_por_vuelta,
    limpiar_vueltas_carrera,
)

router = APIRouter(prefix="/api/analisis", responses=RESPUESTAS_ERROR)

# En gomas pesan las vueltas de los 20 pilotos (`laps`); lo demás son consultas chicas.
ENDPOINTS_PESADOS = frozenset({"laps"})
SESIONES_CON_GOMAS = {"Race", "Sprint"}
MAX_PILOTOS = 3
PILOTOS_POR_DEFECTO = 3  # el podio


def _redondeado(valor: float, decimales: int) -> float | None:
    return None if pd.isna(valor) else round(float(valor), decimales)


def _ajuste(fila) -> AjusteRecta | None:
    if fila.insuficiente:
        return None
    return AjusteRecta(
        pendiente_s_por_vuelta=round(float(fila.pendiente_s_por_vuelta), 4),
        intercepto=round(float(fila.intercepto), 3),
        r2=round(float(fila.r2), 3),
    )


def _estrategias(
    stints: pd.DataFrame, resultado: pd.DataFrame, pilotos: pd.DataFrame, n_vueltas: int
) -> list[EstrategiaPiloto]:
    """Todos los pilotos con sus stints, por posición final; los que abandonan, al final."""
    datos_piloto = pilotos.set_index("numero")
    orden = [p for p in resultado["piloto"] if p in set(stints["piloto"])]
    orden += [p for p in stints["piloto"].unique() if p not in orden]
    por_resultado = resultado.set_index("piloto")

    estrategias = []
    for numero in orden:
        if numero not in datos_piloto.index:
            continue
        propios = stints[stints["piloto"] == numero]
        fila = datos_piloto.loc[numero]
        final = por_resultado.loc[numero] if numero in por_resultado.index else None
        estrategias.append(
            EstrategiaPiloto(
                piloto=Piloto(
                    numero=int(numero),
                    codigo=fila["codigo"],
                    nombre=fila["nombre"],
                    equipo=fila["equipo"],
                    color=fila["color"],
                ),
                posicion=None
                if final is None or pd.isna(final["posicion"])
                else int(final["posicion"]),
                vueltas=int(final["vueltas"]) if final is not None else n_vueltas,
                abandono=bool(final is not None and (final["abandono"] or final["descalificado"])),
                stints=[
                    StintEstrategia(
                        stint=int(s.stint),
                        compuesto=s.compuesto,
                        vuelta_inicio=int(s.vuelta_inicio),
                        vuelta_fin=int(n_vueltas if pd.isna(s.vuelta_fin) else s.vuelta_fin),
                        edad_inicial=0 if pd.isna(s.edad_inicial) else int(s.edad_inicial),
                    )
                    for s in propios.itertuples()
                ],
            )
        )
    return estrategias


def _resumen(degradacion: pd.DataFrame, stints: pd.DataFrame) -> ResumenGomas:
    resumen = resumen_gomas(degradacion, stints)
    for clave in ("compuesto_mas_degradante", "compuesto_menos_degradante"):
        if resumen[clave]:
            resumen[clave]["pendiente_s_por_vuelta"] = round(
                resumen[clave]["pendiente_s_por_vuelta"], 4
            )
    resumen["paradas_por_piloto"] = round(resumen["paradas_por_piloto"], 2)
    return ResumenGomas(**resumen)


def _construir_analisis_gomas(
    cargador: Cargador, sesion: int, elegidos: list[int]
) -> AnalisisGomas:
    info = cargador.info_sesion(sesion)
    if info["nombre"] not in SESIONES_CON_GOMAS:
        raise ErrorDatos("analisis_no_disponible")
    if not cargador.sesion_terminada(sesion):
        raise ErrorDatos("sesion_no_terminada")

    pilotos = cargador.pilotos(sesion)
    if set(elegidos) - set(pilotos["numero"]):
        raise ErrorDatos("piloto_no_encontrado")

    vueltas = cargador.vueltas(sesion)
    stints = cargador.stints(sesion)
    if vueltas.empty or stints.empty:
        raise ErrorDatos("analisis_no_disponible")
    resultado = cargador.resultado(sesion)
    n_vueltas = int(vueltas["vuelta"].max())

    estado = estado_pista_por_vuelta(cargador.direccion_carrera(sesion), n_vueltas)
    limpias = limpiar_vueltas_carrera(vueltas, cargador.paradas(sesion), estado)
    limpias = agregar_correccion_combustible(agregar_edad_goma(limpias, stints))
    con_edad = limpias[limpias["edad_goma"].notna() & limpias["compuesto"].notna()]

    corregida = degradacion_por_stint(limpias, "tiempo_corregido_s")
    sin_corregir = degradacion_por_stint(limpias, "tiempo_vuelta_s")

    if not elegidos:
        clasificados = resultado.dropna(subset=["posicion"])
        elegidos = [int(p) for p in clasificados["piloto"].head(PILOTOS_POR_DEFECTO)]

    degradacion = [
        DegradacionStint(
            piloto=int(c.piloto),
            stint=int(c.stint),
            compuesto=c.compuesto,
            n_vueltas=int(c.n_vueltas),
            edad_inicial=int(c.edad_inicial),
            edad_final=int(c.edad_final),
            insuficiente=bool(c.insuficiente),
            corregido=_ajuste(c),
            sin_corregir=_ajuste(s),
        )
        for c, s in zip(corregida.itertuples(), sin_corregir.itertuples(), strict=True)
    ]

    comparacion = comparar_compuestos(corregida).merge(
        comparar_compuestos(sin_corregir)[["compuesto", "pendiente_s_por_vuelta"]],
        on="compuesto",
        suffixes=("", "_sin_corregir"),
    )

    elegidas = con_edad[con_edad["piloto"].isin(elegidos)]
    elegidas = elegidas.assign(
        _orden=elegidas["piloto"].map({p: i for i, p in enumerate(elegidos)})
    )
    elegidas = elegidas.sort_values(["_orden", "vuelta"])

    return AnalisisGomas(
        sesion=sesion,
        n_vueltas=n_vueltas,
        segundos_combustible_por_vuelta=SEGUNDOS_POR_VUELTA,
        estrategias=_estrategias(stints, resultado, pilotos, n_vueltas),
        pilotos_elegidos=elegidos,
        vueltas=[
            VueltaGoma(
                piloto=int(v.piloto),
                vuelta=int(v.vuelta),
                stint=int(v.stint),
                compuesto=v.compuesto,
                edad_goma=int(v.edad_goma),
                tiempo_s=round(float(v.tiempo_vuelta_s), 3),
                tiempo_corregido_s=round(float(v.tiempo_corregido_s), 3),
            )
            for v in elegidas.itertuples()
        ],
        degradacion=degradacion,
        compuestos=[
            DegradacionCompuesto(
                compuesto=c.compuesto,
                n_stints=int(c.n_stints),
                n_vueltas=int(c.n_vueltas),
                pendiente_s_por_vuelta=round(float(c.pendiente_s_por_vuelta), 4),
                pendiente_sin_corregir_s_por_vuelta=round(
                    float(c.pendiente_s_por_vuelta_sin_corregir), 4
                ),
            )
            for c in comparacion.itertuples()
        ],
        resumen=_resumen(corregida, stints),
        resumen_sin_corregir=_resumen(sin_corregir, stints),
    )


@router.get("/gomas")
def analisis_gomas(
    sesion: Annotated[int, Query(ge=1)],
    peticion: Request,
    cargador: CargadorDep,
    limitador_ip: LimitadorIpDep,
    concurrencia: ConcurrenciaDep,
    pilotos: Annotated[list[int] | None, Query(max_length=MAX_PILOTOS)] = None,
) -> AnalisisGomas:
    """Estrategias de todos los pilotos y degradación de las gomas de una carrera o sprint.

    ``pilotos`` (hasta 3, repitiendo el parámetro) elige de quiénes se mandan las vueltas
    limpias para la dispersión; sin él se usa el podio. Solo para carreras y sprints terminados.
    """
    elegidos = list(dict.fromkeys(pilotos or []))
    if any(p < 1 for p in elegidos):
        raise ErrorDatos("parametro_invalido")

    gancho = limitar_por_ip(limitador_ip, ip_del_cliente(peticion), ENDPOINTS_PESADOS)
    with concurrencia.turno(), cargador.cliente.antes_de_pedir(gancho):
        return _construir_analisis_gomas(cargador, sesion, elegidos)
