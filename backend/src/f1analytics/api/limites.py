"""Límites para que la API pública no se sature: concurrencia máxima y peticiones por IP.

Solo cuentan los análisis que tienen que pedir telemetría a OpenF1: lo que sale de la
caché es instantáneo y no cuesta nada.
"""

import threading
import time
from collections import deque
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager

from fastapi import Request

from f1analytics.datos.errores import ErrorDatos

MAX_ANALISIS_A_LA_VEZ = 2
# Cuántos pueden esperar su turno. Con 2 a la vez, 5 peticiones simultáneas en frío tardaron hasta
# 59 s en Render Free (medido); con 2 corriendo y 4 esperando el peor caso queda por debajo de los
# 90 s que espera el frontend (extrapolado de esa medición, no medido).
MAX_ANALISIS_EN_ESPERA = 4
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
    """Deja correr como máximo ``maximo`` análisis a la vez.

    Los demás esperan su turno, pero solo hasta ``max_en_espera``: si ya hay tantos esperando,
    el siguiente recibe ``servidor_ocupado`` al instante en vez de quedarse más de lo que aguanta
    el frontend.
    """

    def __init__(
        self, maximo: int = MAX_ANALISIS_A_LA_VEZ, max_en_espera: int = MAX_ANALISIS_EN_ESPERA
    ):
        self._semaforo = threading.BoundedSemaphore(maximo)
        self._max_en_espera = max_en_espera
        self._en_espera = 0
        self._cerrojo = threading.Lock()

    @property
    def en_espera(self) -> int:
        """Cuántos análisis esperan su turno ahora mismo."""
        with self._cerrojo:
            return self._en_espera

    def turno(self) -> AbstractContextManager[bool]:
        return self._turno()

    @contextmanager
    def _turno(self) -> Iterator[bool]:
        # Primero se intenta entrar sin esperar; solo si no hay hueco se hace cola.
        if not self._semaforo.acquire(blocking=False):
            with self._cerrojo:
                if self._en_espera >= self._max_en_espera:
                    raise ErrorDatos("servidor_ocupado")
                self._en_espera += 1
            try:
                self._semaforo.acquire()
            finally:
                with self._cerrojo:
                    self._en_espera -= 1
        try:
            yield True
        finally:
            self._semaforo.release()


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
