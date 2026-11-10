"""Análisis de telemetría: la vuelta rápida de dos pilotos comparada metro a metro."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request

from f1analytics.analisis.circuito import FRENO_ACTIVO, orientar_circuito, posicion_curvas
from f1analytics.analisis.telemetria import (
    alinear_vueltas,
    delta_tiempo,
    ganador_por_minisector,
    resumen_telemetria,
)
from f1analytics.api.esquemas import (
    AnalisisTelemetria,
    CanalesAlineados,
    CurvaMapa,
    Minisector,
    Piloto,
    ResumenTelemetria,
    VueltaComparada,
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
from f1analytics.datos.circuitos import circuito_o_sin_datos
from f1analytics.datos.errores import ErrorDatos
from f1analytics.datos.telemetria_vuelta import telemetria_de_vuelta, vuelta_rapida

router = APIRouter(prefix="/api/analisis", responses=RESPUESTAS_ERROR)

# Lo que pesa de este análisis es la telemetría de los dos pilotos; lo demás son consultas chicas.
ENDPOINTS_PESADOS = frozenset({"car_data", "location"})
PASO_M = 5.0

Segmento = Literal["Q1", "Q2", "Q3", "SQ1", "SQ2", "SQ3"]


def _piloto(pilotos, numero: int) -> Piloto:
    fila = pilotos[pilotos["numero"] == numero]
    if fila.empty:
        raise ErrorDatos("piloto_no_encontrado")
    return Piloto(**fila.iloc[0].to_dict())


def _resumen(resumen: dict) -> ResumenTelemetria:
    """Las velocidades llegan como decimales de la telemetría; en la API van enteras (km/h)."""

    def extremo(dato: dict) -> dict:
        return {"kmh": int(dato["kmh"]), "distancia_m": round(dato["distancia_m"], 1)}

    def ventaja(dato: dict | None) -> dict | None:
        if dato is None:
            return None
        return {
            "sector": dato["sector"],
            "inicio_m": round(dato["inicio_m"], 1),
            "fin_m": round(dato["fin_m"], 1),
            "ventaja_s": round(dato["ventaja_s"], 3),
        }

    return ResumenTelemetria(
        delta_final_s=round(resumen["delta_final_s"], 3),
        ganador=resumen["ganador"],
        sectores_ganados=resumen["sectores_ganados"],
        mayor_ventaja={letra: ventaja(v) for letra, v in resumen["mayor_ventaja"].items()},
        pct_a_fondo={letra: round(v, 1) for letra, v in resumen["pct_a_fondo"].items()},
        vel_maxima={letra: extremo(v) for letra, v in resumen["vel_maxima"].items()},
        vel_minima={letra: extremo(v) for letra, v in resumen["vel_minima"].items()},
    )


def _construir_analisis_telemetria(
    cargador: Cargador, sesion: int, piloto_a: int, piloto_b: int, segmento: str | None
) -> AnalisisTelemetria:
    info = cargador.info_sesion(sesion)
    if not cargador.sesion_terminada(sesion):
        raise ErrorDatos("sesion_no_terminada")

    anio = int(info["anio"])
    calendario = cargador.calendario(anio)
    evento = calendario[calendario["evento"] == info["evento"]]
    if evento.empty:
        raise ErrorDatos("analisis_no_disponible")
    # Un circuito nuevo, que no está en circuitos.json, se compara sin curvas numeradas.
    trazado = circuito_o_sin_datos(int(evento.iloc[0]["circuito_clave"]), anio)

    pilotos = cargador.pilotos(sesion)
    datos_a, datos_b = _piloto(pilotos, piloto_a), _piloto(pilotos, piloto_b)

    # Primero se eligen las dos vueltas (consultas chicas) y después se baja la telemetría.
    vueltas = {
        piloto: vuelta_rapida(cargador, sesion, piloto, segmento) for piloto in (piloto_a, piloto_b)
    }
    tiempos = {
        piloto: float(
            cargador.vueltas(sesion, piloto).set_index("vuelta").loc[vuelta, "tiempo_vuelta_s"]
        )
        for piloto, vuelta in vueltas.items()
    }
    tel_a = telemetria_de_vuelta(cargador, sesion, piloto_a, vueltas[piloto_a])
    tel_b = telemetria_de_vuelta(cargador, sesion, piloto_b, vueltas[piloto_b])

    # El mapa se gira como en la transmisión; las dos vueltas se alinean ya giradas.
    alineadas = alinear_vueltas(orientar_circuito(tel_a, trazado.rotacion), tel_b, paso_m=PASO_M)
    delta = delta_tiempo(alineadas, tiempos[piloto_a], tiempos[piloto_b])
    ganadores = ganador_por_minisector(alineadas, delta)
    resumen = resumen_telemetria(alineadas, delta, ganadores)
    curvas = posicion_curvas(trazado.curvas, trazado.rotacion)

    return AnalisisTelemetria(
        sesion=sesion,
        segmento=segmento,
        piloto_a=VueltaComparada(
            piloto=datos_a, vuelta=vueltas[piloto_a], tiempo_vuelta_s=tiempos[piloto_a]
        ),
        piloto_b=VueltaComparada(
            piloto=datos_b, vuelta=vueltas[piloto_b], tiempo_vuelta_s=tiempos[piloto_b]
        ),
        # Sin datos del circuito no hay largo oficial: se usa el de las vueltas alineadas.
        longitud_m=trazado.longitud_o(float(alineadas["distancia_m"].iloc[-1])),
        paso_m=PASO_M,
        canales=CanalesAlineados(
            distancia_m=alineadas["distancia_m"].round(1).tolist(),
            velocidad_a=alineadas["velocidad_a"].round().astype(int).tolist(),
            velocidad_b=alineadas["velocidad_b"].round().astype(int).tolist(),
            acelerador_a=alineadas["acelerador_a"].round().astype(int).tolist(),
            acelerador_b=alineadas["acelerador_b"].round().astype(int).tolist(),
            freno_a=(alineadas["freno_a"] > FRENO_ACTIVO).tolist(),
            freno_b=(alineadas["freno_b"] > FRENO_ACTIVO).tolist(),
            delta_s=delta.round(3).tolist(),
            x=alineadas["x_a"].round(1).tolist(),
            y=alineadas["y_a"].round(1).tolist(),
        ),
        curvas=[
            CurvaMapa(
                numero=fila.numero,
                letra=fila.letra,
                etiqueta=fila.etiqueta,
                x=round(fila.x, 1),
                y=round(fila.y, 1),
            )
            for fila in curvas.itertuples()
        ],
        minisectores=[
            Minisector(
                sector=int(fila.sector),
                inicio_m=round(fila.inicio_m, 1),
                fin_m=round(fila.fin_m, 1),
                diferencia_s=round(fila.diferencia_s, 3),
                ganador=fila.ganador,
            )
            for fila in ganadores.itertuples()
        ],
        resumen=_resumen(resumen),
    )


@router.get("/telemetria")
def analisis_telemetria(
    sesion: Annotated[int, Query(ge=1)],
    piloto_a: Annotated[int, Query(ge=1)],
    piloto_b: Annotated[int, Query(ge=1)],
    peticion: Request,
    cargador: CargadorDep,
    limitador_ip: LimitadorIpDep,
    concurrencia: ConcurrenciaDep,
    segmento: Segmento | None = None,
) -> AnalisisTelemetria:
    """Compara la vuelta más rápida de dos pilotos: velocidad, pedales y delta metro a metro.

    El piloto A es la referencia y el B el que se compara. Sin ``segmento`` se usa la mejor
    vuelta de la sesión; con él, la mejor de Q1, Q2 o Q3 (SQ1, SQ2 o SQ3 en la clasificación
    sprint), que solo existe en esas sesiones. Solo para sesiones terminadas. En los circuitos
    que todavía no están en ``circuitos.json`` ``curvas`` llega vacío, el mapa no se gira y
    ``longitud_m`` es la medida en las vueltas.
    """
    if piloto_a == piloto_b:
        raise ErrorDatos("parametro_invalido")

    gancho = limitar_por_ip(limitador_ip, ip_del_cliente(peticion), ENDPOINTS_PESADOS)
    with concurrencia.turno(), cargador.cliente.antes_de_pedir(gancho):
        return _construir_analisis_telemetria(cargador, sesion, piloto_a, piloto_b, segmento)
