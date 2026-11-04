"""Modelos de la API. De aquí sale el OpenAPI y, de ahí, los tipos TypeScript del frontend."""

from datetime import datetime

from pydantic import BaseModel


class Salud(BaseModel):
    estado: str
    version: str


class ErrorApi(BaseModel):
    """Todo error de la API. La web lo traduce según el código; la API no manda textos."""

    codigo: str


class Evento(BaseModel):
    """Un Gran Premio del calendario."""

    evento: int
    nombre: str
    nombre_oficial: str
    pais: str
    circuito: str
    circuito_clave: int
    inicio: datetime


class Sesion(BaseModel):
    """Una sesión de un Gran Premio (libres, clasificación, sprint o carrera)."""

    sesion: int
    nombre: str
    tipo: str
    inicio: datetime
    fin: datetime
    evento: int
    anio: int
    terminada: bool


class Piloto(BaseModel):
    numero: int
    codigo: str
    nombre: str
    equipo: str
    color: str


class PuntoMapa(BaseModel):
    """Una muestra de la vuelta, con la posición ya girada como en la transmisión."""

    x: float
    y: float
    velocidad: int
    marcha: int
    distancia_m: float


class CurvaMapa(BaseModel):
    numero: int
    letra: str
    etiqueta: str
    x: float
    y: float


class ZonaFrenado(BaseModel):
    """Un tramo con el freno pisado, asignado a la curva a la que se llega frenando."""

    curva: int
    letra: str
    inicio_m: float
    fin_m: float
    longitud_m: float
    vel_entrada: int
    vel_salida: int
    x_inicio: float
    y_inicio: float


class ExtremoVelocidad(BaseModel):
    kmh: int
    distancia_m: float


class FrenadaFuerte(BaseModel):
    curva: int
    letra: str
    vel_entrada: int
    vel_salida: int


class ResumenCircuito(BaseModel):
    """Datos para la conclusión: la web los convierte en una frase."""

    pct_a_fondo: float
    vel_maxima: ExtremoVelocidad
    vel_minima: ExtremoVelocidad
    frenada_mas_fuerte: FrenadaFuerte | None


class AnalisisCircuito(BaseModel):
    """La vuelta más rápida de un piloto sobre el mapa del circuito."""

    sesion: int
    piloto: Piloto
    vuelta: int
    tiempo_vuelta_s: float
    longitud_m: float
    puntos: list[PuntoMapa]
    curvas: list[CurvaMapa]
    frenadas: list[ZonaFrenado]
    resumen: ResumenCircuito
