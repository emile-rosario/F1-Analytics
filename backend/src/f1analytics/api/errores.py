"""Convierte los errores de la capa de datos en respuestas HTTP con un código.

La API nunca manda textos para el usuario: solo ``{"codigo": "..."}``. El frontend lo traduce.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from f1analytics.datos.errores import ErrorDatos, ErrorOpenF1

ESTADO_POR_CODIGO = {
    "parametro_invalido": 422,
    "analisis_no_disponible": 422,
    "telemetria_incompleta": 422,
    "sesion_no_encontrada": 404,
    "piloto_no_encontrado": 404,
    "sin_telemetria": 404,
    "sesion_no_terminada": 409,
    "limite_peticiones": 429,
    # 503 y no 502: el frontend reintenta los 502 porque Render los da al despertar.
    "fallo_openf1": 503,
    "openf1_en_vivo": 503,
}


def respuesta_de_error(codigo: str) -> JSONResponse:
    return JSONResponse({"codigo": codigo}, status_code=ESTADO_POR_CODIGO.get(codigo, 500))


def registrar_manejadores(app: FastAPI) -> None:
    @app.exception_handler(ErrorDatos)
    @app.exception_handler(ErrorOpenF1)
    async def _error_conocido(_: Request, error: ErrorDatos | ErrorOpenF1) -> JSONResponse:
        return respuesta_de_error(error.codigo)

    @app.exception_handler(RequestValidationError)
    async def _parametro_invalido(_: Request, __: RequestValidationError) -> JSONResponse:
        return respuesta_de_error("parametro_invalido")
