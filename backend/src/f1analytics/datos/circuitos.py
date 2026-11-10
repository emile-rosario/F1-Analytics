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
    # False solo en ``SIN_DATOS``: el circuito no está en el archivo y el resto de campos son
    # relleno (nombre vacío, largo 0...), no datos reales.
    conocido: bool = True

    def longitud_o(self, medida_m: float) -> float:
        """El largo oficial si se conoce el circuito y, si no, el medido en la telemetría."""
        return self.longitud_m if self.conocido else medida_m


# Para un circuito que no está en ``circuitos.json`` (uno nuevo que MultiViewer todavía no tiene):
# sin curvas y sin girar el mapa.
SIN_DATOS = Circuito(nombre="", anios=(), rotacion=0.0, longitud_m=0.0, curvas=(), conocido=False)


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


def circuito_o_sin_datos(circuit_key: int, anio: int) -> Circuito:
    """Como ``circuito``, pero un circuito que no está en el archivo da ``SIN_DATOS``.

    El análisis sigue adelante sin números de curva ni tabla de frenadas, en vez de fallar. Cuando
    MultiViewer tenga el circuito basta volver a correr ``scripts/generar_circuitos.py``.
    """
    try:
        return circuito(circuit_key, anio)
    except ErrorDatos:  # ``circuito`` solo lanza este error cuando el circuito no está
        return SIN_DATOS
