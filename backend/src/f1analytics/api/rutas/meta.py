"""Calendario, sesiones y pilotos: lo que la web necesita para armar el selector."""

from typing import Annotated

from fastapi import APIRouter, Depends

from f1analytics.api.dependencias import obtener_cargador, validar_anio
from f1analytics.api.esquemas import ErrorApi, Evento, Piloto, Sesion
from f1analytics.datos.cargador import Cargador

router = APIRouter(
    prefix="/api",
    responses={
        404: {"model": ErrorApi},
        422: {"model": ErrorApi},
        429: {"model": ErrorApi},
        503: {"model": ErrorApi},
    },
)

CargadorDep = Annotated[Cargador, Depends(obtener_cargador)]


@router.get("/calendario/{anio}")
def calendario(anio: int, cargador: CargadorDep) -> list[Evento]:
    """Grandes Premios del año, sin las pruebas de pretemporada."""
    validar_anio(anio)
    return [Evento(**fila) for fila in cargador.calendario(anio).to_dict("records")]


# Los convertidores `:int` hacen que esta ruta no se coma a /sesiones/{sesion}/pilotos.
@router.get("/sesiones/{anio:int}/{evento:int}")
def sesiones(anio: int, evento: int, cargador: CargadorDep) -> list[Sesion]:
    """Sesiones de un Gran Premio. Lista vacía si el evento no existe."""
    validar_anio(anio)
    return [Sesion(**fila) for fila in cargador.sesiones(anio, evento).to_dict("records")]


@router.get("/sesiones/{sesion:int}/pilotos")
def pilotos(sesion: int, cargador: CargadorDep) -> list[Piloto]:
    """Pilotos que corrieron la sesión, con su equipo y color."""
    return [Piloto(**fila) for fila in cargador.pilotos(sesion).to_dict("records")]
