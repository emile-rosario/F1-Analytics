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
# 59 s en Render Free (medido); con 2 corriendo y 4 esperando el peor caso queda en unos 75 s
# (extrapolado de esa medición, no medido).
MAX_ANALISIS_EN_ESPERA = 4
# Cuánto puede esperar cada uno. El frontend se rinde a los 90 s contando también lo que tarda el
# análisis, así que esperar más de 60 s casi seguro terminaría en un tiempo agotado. Vale también
# para el servidor recién despertado, donde un solo análisis llegó a tardar 36–51 s (medido), y
# limita cuánto retiene su lugar quien ya se fue (no se puede cancelar un hilo que espera).
ESPERA_MAXIMA_S = 60.0
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


class _Lugar:
    """Un puesto en la cola de espera. ``concedido`` pasa a True cuando le toca correr."""

    __slots__ = ("concedido",)

    def __init__(self) -> None:
        self.concedido = False


class LimitadorConcurrencia:
    """Deja correr como máximo ``maximo`` análisis a la vez.

    Los demás esperan en una cola **en orden de llegada**, con dos topes: a lo sumo
    ``max_en_espera`` esperando y, a cada uno, ``espera_maxima_s`` segundos. Pasado cualquiera de
    los dos recibe ``servidor_ocupado`` en vez de quedarse más de lo que aguanta el frontend (90 s).

    Todo pasa bajo un solo cerrojo y, al terminar un análisis, el turno se **entrega** directo
    al primero de la cola: nadie que llegue después puede colarse por delante.
    """

    def __init__(
        self,
        maximo: int = MAX_ANALISIS_A_LA_VEZ,
        max_en_espera: int = MAX_ANALISIS_EN_ESPERA,
        espera_maxima_s: float = ESPERA_MAXIMA_S,
    ):
        self._maximo = maximo
        self._max_en_espera = max_en_espera
        self._espera_maxima_s = espera_maxima_s
        self._corriendo = 0
        self._cola: deque[_Lugar] = deque()
        self._condicion = threading.Condition()

    @property
    def en_espera(self) -> int:
        """Cuántos análisis esperan su turno ahora mismo."""
        with self._condicion:
            return len(self._cola)

    def turno(self) -> AbstractContextManager[bool]:
        return self._turno()

    @contextmanager
    def _turno(self) -> Iterator[bool]:
        self._entrar()
        try:
            yield True
        finally:
            with self._condicion:
                self._corriendo -= 1
                self._entregar_turnos()

    def _entrar(self) -> None:
        with self._condicion:
            # Hay hueco y nadie esperando: entra sin cola.
            if self._corriendo < self._maximo and not self._cola:
                self._corriendo += 1
                return
            if len(self._cola) >= self._max_en_espera:
                raise ErrorDatos("servidor_ocupado")

            lugar = _Lugar()
            self._cola.append(lugar)
            limite = time.monotonic() + self._espera_maxima_s
            try:
                while not lugar.concedido:
                    restante = limite - time.monotonic()
                    if restante <= 0:
                        raise ErrorDatos("servidor_ocupado")
                    self._condicion.wait(restante)
            except BaseException:
                if lugar.concedido:  # ya tenía el turno: se devuelve para que siga la cola
                    self._corriendo -= 1
                    self._entregar_turnos()
                else:
                    self._cola.remove(lugar)
                raise

    def _entregar_turnos(self) -> None:
        """Pasa el turno a los primeros de la cola mientras haya hueco. Con el cerrojo tomado."""
        while self._cola and self._corriendo < self._maximo:
            self._cola.popleft().concedido = True
            self._corriendo += 1
        self._condicion.notify_all()


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
