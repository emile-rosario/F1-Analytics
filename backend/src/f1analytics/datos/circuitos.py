"""Datos propios de cada circuito que OpenF1 no trae: curvas numeradas y rotación del mapa.

Salen de ``circuitos.json``, una copia estática generada con
``scripts/generar_circuitos.py``. La app nunca consulta a MultiViewer mientras corre.
"""

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from f1analytics.datos.errores import ErrorDatos

RUTA = Path(__file__).with_name("circuitos.json")


@dataclass(frozen=True)
class Curva:
    numero: int
    letra: str  # "A" en curvas como la 1A de Hungaroring; vacío en el resto
    x: float
    y: float
    distancia_m: float  # desde la línea de meta


@dataclass(frozen=True)
class Circuito:
    nombre: str
    anios: tuple[int, ...]  # años en que el trazado fue este
    rotacion: float  # grados, para orientar el mapa como en la transmisión
    longitud_m: float
    curvas: tuple[Curva, ...]


@lru_cache(maxsize=1)
def _leer() -> dict:
    return json.loads(RUTA.read_text(encoding="utf-8"))


def claves_disponibles() -> set[int]:
    return {int(clave) for clave in _leer()["circuitos"]}


def circuito(circuit_key: int, anio: int) -> Circuito:
    """Trazado del circuito en ese año; si no hay datos de ese año, el más cercano.

    Lanza ``ErrorDatos("analisis_no_disponible")`` si el circuito no está en el archivo
    (por ejemplo, los circuitos nuevos que MultiViewer todavía no tiene).
    """
    entrada = _leer()["circuitos"].get(str(circuit_key))
    if entrada is None:
        raise ErrorDatos("analisis_no_disponible")

    def distancia_al_anio(diseno: dict) -> int:
        return min(abs(anio - a) for a in diseno["anios"])

    diseno = min(entrada["disenos"], key=distancia_al_anio)
    return Circuito(
        nombre=entrada["nombre"],
        anios=tuple(diseno["anios"]),
        rotacion=diseno["rotacion"],
        longitud_m=diseno["longitud_m"],
        curvas=tuple(Curva(**curva) for curva in diseno["curvas"]),
    )
