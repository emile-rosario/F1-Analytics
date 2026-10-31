"""Errores de la capa de datos. Cada uno lleva un código que la API traduce para el usuario."""


class ErrorOpenF1(Exception):
    """OpenF1 no respondió como se esperaba.

    Códigos: ``limite_peticiones`` (429 agotando reintentos), ``openf1_en_vivo`` (hay una
    sesión en vivo y OpenF1 bloquea el acceso sin clave hasta que termine) y ``fallo_openf1``
    (caído, error 5xx, sin conexión o respuesta inesperada).
    """

    def __init__(self, codigo: str, estado_http: int | None = None):
        super().__init__(codigo)
        self.codigo = codigo
        self.estado_http = estado_http


class ErrorDatos(Exception):
    """Los datos existen, pero no sirven para el análisis pedido.

    Códigos: ``sesion_no_encontrada``, ``piloto_no_encontrado``, ``sin_telemetria``,
    ``telemetria_incompleta`` y ``analisis_no_disponible``.
    """

    def __init__(self, codigo: str):
        super().__init__(codigo)
        self.codigo = codigo
