from datetime import UTC, datetime
from functools import lru_cache

from f1analytics.api.limites import LimitadorConcurrencia, LimitadorPorIp
from f1analytics.datos.cargador import Cargador
from f1analytics.datos.cliente import ClienteOpenF1
from f1analytics.datos.errores import ErrorDatos

PRIMER_ANIO = 2023  # OpenF1 solo tiene datos históricos desde 2023


@lru_cache(maxsize=1)
def obtener_cargador() -> Cargador:
    """Un solo cargador por proceso, para que la caché sirva entre peticiones."""
    return Cargador(ClienteOpenF1())


@lru_cache(maxsize=1)
def obtener_limitador_ip() -> LimitadorPorIp:
    return LimitadorPorIp()


@lru_cache(maxsize=1)
def obtener_limitador_concurrencia() -> LimitadorConcurrencia:
    return LimitadorConcurrencia()


def validar_anio(anio: int) -> None:
    if not PRIMER_ANIO <= anio <= datetime.now(UTC).year:
        raise ErrorDatos("parametro_invalido")
