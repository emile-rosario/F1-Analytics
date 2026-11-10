"""Los análisis de cada proyecto. Cargan los datos, llaman a ``analisis/`` y arman la respuesta."""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from f1analytics.analisis.circuito import (
    orientar_circuito,
    posicion_curvas,
    resumen_circuito,
    zonas_frenado,
)
from f1analytics.api.esquemas import (
    AnalisisCircuito,
    CurvaMapa,
    Piloto,
    PuntoMapa,
    ResumenCircuito,
    ZonaFrenado,
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

# Lo que pesa del análisis del circuito es la telemetría; lo demás son consultas chicas.
ENDPOINTS_PESADOS = frozenset({"car_data", "location"})


def _construir_analisis_circuito(cargador: Cargador, sesion: int, piloto: int) -> AnalisisCircuito:
    info = cargador.info_sesion(sesion)
    if not cargador.sesion_terminada(sesion):
        raise ErrorDatos("sesion_no_terminada")

    anio = int(info["anio"])
    calendario = cargador.calendario(anio)
    evento = calendario[calendario["evento"] == info["evento"]]
    if evento.empty:
        raise ErrorDatos("analisis_no_disponible")
    # Un circuito nuevo, que no está en circuitos.json, se analiza sin curvas numeradas.
    trazado = circuito_o_sin_datos(int(evento.iloc[0]["circuito_clave"]), anio)

    pilotos = cargador.pilotos(sesion)
    datos_piloto = pilotos[pilotos["numero"] == piloto]
    if datos_piloto.empty:
        raise ErrorDatos("piloto_no_encontrado")

    vuelta = vuelta_rapida(cargador, sesion, piloto)
    vueltas = cargador.vueltas(sesion, piloto).set_index("vuelta")
    tel = telemetria_de_vuelta(cargador, sesion, piloto, vuelta)
    tel = orientar_circuito(tel, trazado.rotacion)
    curvas = posicion_curvas(trazado.curvas, trazado.rotacion)
    zonas = zonas_frenado(tel, curvas)
    resumen = resumen_circuito(tel, zonas)

    return AnalisisCircuito(
        sesion=sesion,
        piloto=Piloto(**datos_piloto.iloc[0].to_dict()),
        vuelta=vuelta,
        tiempo_vuelta_s=float(vueltas.loc[vuelta, "tiempo_vuelta_s"]),
        # Sin datos del circuito el largo no se conoce: se usa el medido (integrando la velocidad).
        longitud_m=trazado.longitud_m or float(tel["distancia_m"].iloc[-1]),
        puntos=[
            PuntoMapa(
                x=round(fila.x, 1),
                y=round(fila.y, 1),
                velocidad=int(fila.velocidad),
                marcha=int(fila.marcha),
                distancia_m=round(fila.distancia_m, 1),
            )
            for fila in tel.itertuples()
        ],
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
        frenadas=[
            ZonaFrenado(
                **{
                    **fila,
                    "vel_entrada": int(fila["vel_entrada"]),
                    "vel_salida": int(fila["vel_salida"]),
                }
            )
            for fila in zonas.round(1).to_dict("records")
        ],
        resumen=ResumenCircuito(**_enteros(resumen)),
    )


def _enteros(resumen: dict) -> dict:
    """Las velocidades llegan como decimales de la telemetría; en la API van enteras (km/h)."""
    frenada = resumen["frenada_mas_fuerte"]
    return {
        **resumen,
        "pct_a_fondo": round(resumen["pct_a_fondo"], 1),
        "vel_maxima": {**resumen["vel_maxima"], "kmh": int(resumen["vel_maxima"]["kmh"])},
        "vel_minima": {**resumen["vel_minima"], "kmh": int(resumen["vel_minima"]["kmh"])},
        "frenada_mas_fuerte": None
        if frenada is None
        else {
            **frenada,
            "vel_entrada": int(frenada["vel_entrada"]),
            "vel_salida": int(frenada["vel_salida"]),
        },
    }


@router.get("/circuito")
def analisis_circuito(
    sesion: Annotated[int, Query(ge=1)],
    piloto: Annotated[int, Query(ge=1)],
    peticion: Request,
    cargador: CargadorDep,
    limitador_ip: LimitadorIpDep,
    concurrencia: ConcurrenciaDep,
) -> AnalisisCircuito:
    """Mapa de la vuelta más rápida del piloto: velocidad, marchas, curvas y frenadas.

    Solo para sesiones terminadas. En los circuitos que todavía no están en ``circuitos.json``
    ``curvas`` y ``frenadas`` llegan vacías (no hay números de curva), el mapa no se gira y
    ``longitud_m`` es la medida en la telemetría.
    """
    gancho = limitar_por_ip(limitador_ip, ip_del_cliente(peticion), ENDPOINTS_PESADOS)
    with concurrencia.turno(), cargador.cliente.antes_de_pedir(gancho):
        return _construir_analisis_circuito(cargador, sesion, piloto)
