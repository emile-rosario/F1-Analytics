"""Lo que comparten las rutas de análisis: dependencias, respuestas de error y el límite por IP."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends

from f1analytics.api.dependencias import (
    obtener_cargador,
    obtener_limitador_concurrencia,
    obtener_limitador_ip,
)
from f1analytics.api.esquemas import ErrorApi
from f1analytics.api.limites import LimitadorConcurrencia, LimitadorPorIp
from f1analytics.datos.cargador import Cargador

RESPUESTAS_ERROR = {
    404: {"model": ErrorApi},
    409: {"model": ErrorApi},
    422: {"model": ErrorApi},
    429: {"model": ErrorApi},
    503: {"model": ErrorApi},
}

CargadorDep = Annotated[Cargador, Depends(obtener_cargador)]
LimitadorIpDep = Annotated[LimitadorPorIp, Depends(obtener_limitador_ip)]
ConcurrenciaDep = Annotated[LimitadorConcurrencia, Depends(obtener_limitador_concurrencia)]


def limitar_por_ip(
    limitador: LimitadorPorIp, ip: str, endpoints_pesados: frozenset[str]
) -> Callable[[str], None]:
    """Gancho para el cliente de OpenF1: el primer pedido pesado de la petición cuenta como uno.

    Qué es «pesado» depende del análisis: en el del circuito, la telemetría (``car_data`` y
    ``location``); en el de gomas, las vueltas de toda la carrera (``laps``). Lo que sale de la
    caché no llega a la red y por eso no cuenta.
    """
    contado = False

    def gancho(endpoint: str) -> None:
        nonlocal contado
        if endpoint in endpoints_pesados and not contado:
            limitador.consumir(ip)
            contado = True

    return gancho
