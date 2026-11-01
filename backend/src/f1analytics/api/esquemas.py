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
