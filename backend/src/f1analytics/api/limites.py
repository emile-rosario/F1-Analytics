"""Límites para que la API pública no se sature: concurrencia máxima y peticiones por IP.

Solo cuentan los análisis que tienen que pedir telemetría a OpenF1: lo que sale de la
caché es instantáneo y no cuesta nada.
"""

import threading
import time
from collections import deque
from collections.abc import Callable
from contextlib import AbstractContextManager

from fastapi import Request

from f1analytics.datos.errores import ErrorDatos

MAX_ANALISIS_A_LA_VEZ = 2
MAX_ANALISIS_POR_IP = 10
VENTANA_S = 60.0
# Cada tantas IPs distintas se borran las que ya no tienen nada reciente.
LIMPIAR_TRAS_IPS = 1_000


class LimitadorPorIp:
    """Como máximo ``maximo`` consumos por IP en los últimos ``ventana_s`` segundos."""

    def __init__(
        self,
        maximo: int = MAX_ANALISIS_POR_IP,
        ventana_s: float = VENTANA_S,
        reloj: Callable[[], float] = time.monotonic,
    ):
        self._maximo = maximo
        self._ventana_s = ventana_s
        self._reloj = reloj
        self._consumos: dict[str, deque[float]] = {}
        self._cerrojo = threading.Lock()

    def consumir(self, ip: str) -> None:
        """Anota un análisis de esta IP. Lanza ``limite_peticiones`` si ya llegó al máximo."""
        with self._cerrojo:
            ahora = self._reloj()
            if len(self._consumos) > LIMPIAR_TRAS_IPS:
                self._limpiar(ahora)
            consumos = self._consumos.setdefault(ip, deque())
            self._descartar_viejos(consumos, ahora)
            if len(consumos) >= self._maximo:
                raise ErrorDatos("limite_peticiones")
            consumos.append(ahora)

    def _descartar_viejos(self, consumos: deque[float], ahora: float) -> None:
        while consumos and ahora - consumos[0] >= self._ventana_s:
            consumos.popleft()

    def _limpiar(self, ahora: float) -> None:
        for ip, consumos in list(self._consumos.items()):
            self._descartar_viejos(consumos, ahora)
            if not consumos:
                del self._consumos[ip]


class LimitadorConcurrencia:
    """Deja correr como máximo ``maximo`` análisis a la vez; los demás esperan su turno."""

    def __init__(self, maximo: int = MAX_ANALISIS_A_LA_VEZ):
        self._semaforo = threading.BoundedSemaphore(maximo)

    def turno(self) -> AbstractContextManager[bool]:
        return self._semaforo


def ip_del_cliente(peticion: Request) -> str:
    """IP de quien pide.

    En Render la API está detrás de un proxy y la IP viene en ``X-Forwarded-For``. Se toma la
    primera de la lista. Un cliente podría mandar una cabecera inventada para repartir sus
    peticiones entre varias IPs falsas; el límite de concurrencia sigue en pie.
    """
    reenviadas = peticion.headers.get("x-forwarded-for")
    if reenviadas:
        return reenviadas.split(",")[0].strip()
    return peticion.client.host if peticion.client else "desconocida"
