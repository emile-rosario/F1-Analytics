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


class StintEstrategia(BaseModel):
    """Un tramo de la carrera con la misma goma, tal como lo registra OpenF1."""

    stint: int
    compuesto: str
    vuelta_inicio: int
    vuelta_fin: int
    edad_inicial: int


class EstrategiaPiloto(BaseModel):
    """La carrera de un piloto: dónde acabó y con qué gomas."""

    piloto: Piloto
    posicion: int | None  # vacío en quien abandonó o no salió
    vueltas: int
    abandono: bool
    stints: list[StintEstrategia]


class VueltaGoma(BaseModel):
    """Una vuelta limpia con la edad de su goma, con y sin corrección por combustible."""

    piloto: int
    vuelta: int
    stint: int
    compuesto: str
    edad_goma: int
    tiempo_s: float
    tiempo_corregido_s: float


class AjusteRecta(BaseModel):
    """Recta de tiempo contra edad de la goma: ``tiempo = intercepto + pendiente × edad``."""

    pendiente_s_por_vuelta: float
    intercepto: float
    r2: float


class DegradacionStint(BaseModel):
    """Cuánto se gasta la goma en un stint. Sin ajuste si el stint tiene muy pocas vueltas."""

    piloto: int
    stint: int
    compuesto: str
    n_vueltas: int
    edad_inicial: int
    edad_final: int
    insuficiente: bool
    corregido: AjusteRecta | None  # con la corrección por combustible
    sin_corregir: AjusteRecta | None


class DegradacionCompuesto(BaseModel):
    compuesto: str
    n_stints: int
    n_vueltas: int
    pendiente_s_por_vuelta: float  # con la corrección por combustible
    pendiente_sin_corregir_s_por_vuelta: float


class CompuestoPendiente(BaseModel):
    compuesto: str
    pendiente_s_por_vuelta: float


class StintMasLargo(BaseModel):
    piloto: int
    compuesto: str
    vueltas: int


class ResumenGomas(BaseModel):
    """Datos para la conclusión: la web los convierte en una frase."""

    n_stints_validos: int
    n_stints_insuficientes: int
    n_stints_sin_degradacion: int
    compuesto_mas_degradante: CompuestoPendiente | None
    compuesto_menos_degradante: CompuestoPendiente | None
    stint_mas_largo: StintMasLargo | None
    paradas_por_piloto: float


class AnalisisGomas(BaseModel):
    """Las estrategias de toda la carrera y la degradación de las gomas."""

    sesion: int
    n_vueltas: int
    segundos_combustible_por_vuelta: float
    estrategias: list[EstrategiaPiloto]  # todos los pilotos, por posición final
    pilotos_elegidos: list[int]
    vueltas: list[VueltaGoma]  # solo las de los pilotos elegidos
    degradacion: list[DegradacionStint]  # todos los stints de todos los pilotos
    compuestos: list[DegradacionCompuesto]
    resumen: ResumenGomas  # con la corrección por combustible
    resumen_sin_corregir: ResumenGomas
