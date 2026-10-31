"""Traduce las respuestas de OpenF1 a DataFrames con columnas en español."""

from collections.abc import Callable
from datetime import UTC, datetime

import pandas as pd

from f1analytics.datos.cliente import ClienteOpenF1
from f1analytics.datos.errores import ErrorDatos

# Sesiones que ofrece la web. Las de pretemporada ("Day 1"...) no se analizan.
NOMBRES_SESION_ANALIZABLES = {
    "Practice 1",
    "Practice 2",
    "Practice 3",
    "Qualifying",
    "Sprint Qualifying",
    "Sprint Shootout",
    "Sprint",
    "Race",
}


def _fecha(serie: pd.Series) -> pd.Series:
    return pd.to_datetime(serie, utc=True, format="ISO8601")


def _vacio(columnas: list[str]) -> pd.DataFrame:
    return pd.DataFrame(columns=columnas)


class Cargador:
    """Lee calendario, sesiones, pilotos y vueltas desde OpenF1."""

    def __init__(
        self,
        cliente: ClienteOpenF1,
        *,
        ahora: Callable[[], datetime] = lambda: datetime.now(UTC),
    ):
        self.cliente = cliente
        self._ahora = ahora
        self._terminadas: dict[int, bool] = {}

    # --- Calendario y sesiones -------------------------------------------------

    def calendario(self, anio: int) -> pd.DataFrame:
        """Grandes Premios del año, sin las pruebas de pretemporada."""
        crudo = self.cliente.obtener("meetings", {"year": anio}, cachear=anio < self._ahora().year)
        columnas = [
            "evento",
            "nombre",
            "nombre_oficial",
            "pais",
            "circuito",
            "circuito_clave",
            "inicio",
        ]
        if crudo.empty:
            return _vacio(columnas)

        tabla = pd.DataFrame(
            {
                "evento": crudo["meeting_key"],
                "nombre": crudo["meeting_name"],
                "nombre_oficial": crudo["meeting_official_name"],
                "pais": crudo["country_name"],
                "circuito": crudo["circuit_short_name"],
                "circuito_clave": crudo["circuit_key"],
                "inicio": _fecha(crudo["date_start"]),
            }
        )
        sin_pruebas = ~tabla["nombre"].str.contains("Testing", case=False)
        return tabla[sin_pruebas].sort_values("inicio").reset_index(drop=True)

    def sesiones(self, anio: int, evento: int) -> pd.DataFrame:
        """Sesiones de un Gran Premio, de la más antigua a la más nueva."""
        crudo = self.cliente.obtener(
            "sessions", {"year": anio, "meeting_key": evento}, cachear=anio < self._ahora().year
        )
        columnas = ["sesion", "nombre", "tipo", "inicio", "fin", "evento", "anio", "terminada"]
        if crudo.empty:
            return _vacio(columnas)

        if "is_cancelled" in crudo:
            crudo = crudo[~crudo["is_cancelled"].fillna(False).astype(bool)]
        crudo = crudo[crudo["session_name"].isin(NOMBRES_SESION_ANALIZABLES)]
        if crudo.empty:
            return _vacio(columnas)

        fin = _fecha(crudo["date_end"])
        tabla = pd.DataFrame(
            {
                "sesion": crudo["session_key"],
                "nombre": crudo["session_name"],
                "tipo": crudo["session_type"],
                "inicio": _fecha(crudo["date_start"]),
                "fin": fin,
                "evento": crudo["meeting_key"],
                "anio": crudo["year"],
                "terminada": fin < pd.Timestamp(self._ahora()),
            }
        )
        return tabla.sort_values("inicio").reset_index(drop=True)

    def info_sesion(self, sesion: int) -> pd.Series:
        """Datos de una sesión por su ``session_key``. Lanza ``sesion_no_encontrada``."""
        crudo = self.cliente.obtener("sessions", {"session_key": sesion})
        if crudo.empty:
            raise ErrorDatos("sesion_no_encontrada")
        fila = crudo.iloc[0]
        return pd.Series(
            {
                "sesion": int(fila["session_key"]),
                "nombre": fila["session_name"],
                "tipo": fila["session_type"],
                "inicio": pd.Timestamp(fila["date_start"]),
                "fin": pd.Timestamp(fila["date_end"]),
                "evento": int(fila["meeting_key"]),
                "anio": int(fila["year"]),
            }
        )

    def buscar_sesion(self, anio: int, evento: int, nombre: str) -> int:
        """``session_key`` de la sesión con ese nombre (``"Qualifying"``, ``"Race"``...)."""
        tabla = self.sesiones(anio, evento)
        coincide = tabla[tabla["nombre"] == nombre]
        if coincide.empty:
            raise ErrorDatos("sesion_no_encontrada")
        return int(coincide.iloc[0]["sesion"])

    def sesion_terminada(self, sesion: int) -> bool:
        """Solo las sesiones terminadas se guardan en caché."""
        if self._terminadas.get(sesion):
            return True
        terminada = pd.Timestamp(self.info_sesion(sesion)["fin"]) < pd.Timestamp(self._ahora())
        if terminada:
            self._terminadas[sesion] = True
        return terminada

    # --- Datos de una sesión -----------------------------------------------------

    def pilotos(self, sesion: int) -> pd.DataFrame:
        crudo = self.cliente.obtener(
            "drivers", {"session_key": sesion}, cachear=self.sesion_terminada(sesion)
        )
        columnas = ["numero", "codigo", "nombre", "equipo", "color"]
        if crudo.empty:
            return _vacio(columnas)
        return pd.DataFrame(
            {
                "numero": crudo["driver_number"],
                "codigo": crudo["name_acronym"],
                "nombre": crudo["full_name"],
                "equipo": crudo["team_name"],
                "color": "#" + crudo["team_colour"].fillna("FFFFFF"),
            }
        )

    def vueltas(self, sesion: int, piloto: int | None = None) -> pd.DataFrame:
        filtros: dict[str, object] = {"session_key": sesion}
        if piloto is not None:
            filtros["driver_number"] = piloto
        crudo = self.cliente.obtener("laps", filtros, cachear=self.sesion_terminada(sesion))
        columnas = [
            "piloto",
            "vuelta",
            "inicio",
            "tiempo_vuelta_s",
            "sector_1_s",
            "sector_2_s",
            "sector_3_s",
            "salida_pits",
        ]
        if crudo.empty:
            return _vacio(columnas)

        tabla = pd.DataFrame(
            {
                "piloto": crudo["driver_number"],
                "vuelta": crudo["lap_number"],
                "inicio": _fecha(crudo["date_start"]),
                "tiempo_vuelta_s": crudo["lap_duration"],
                "sector_1_s": crudo["duration_sector_1"],
                "sector_2_s": crudo["duration_sector_2"],
                "sector_3_s": crudo["duration_sector_3"],
                "salida_pits": crudo["is_pit_out_lap"].fillna(False).astype(bool),
            }
        )
        return tabla.sort_values(["piloto", "vuelta"]).reset_index(drop=True)

    def stints(self, sesion: int) -> pd.DataFrame:
        crudo = self.cliente.obtener(
            "stints", {"session_key": sesion}, cachear=self.sesion_terminada(sesion)
        )
        columnas = ["piloto", "stint", "compuesto", "vuelta_inicio", "vuelta_fin", "edad_inicial"]
        if crudo.empty:
            return _vacio(columnas)
        tabla = pd.DataFrame(
            {
                "piloto": crudo["driver_number"],
                "stint": crudo["stint_number"],
                "compuesto": crudo["compound"],
                "vuelta_inicio": crudo["lap_start"],
                "vuelta_fin": crudo["lap_end"],
                "edad_inicial": crudo["tyre_age_at_start"],
            }
        )
        return tabla.sort_values(["piloto", "stint"]).reset_index(drop=True)

    def paradas(self, sesion: int) -> pd.DataFrame:
        crudo = self.cliente.obtener(
            "pit", {"session_key": sesion}, cachear=self.sesion_terminada(sesion)
        )
        columnas = ["piloto", "vuelta", "fecha", "duracion_s"]
        if crudo.empty:
            return _vacio(columnas)
        tabla = pd.DataFrame(
            {
                "piloto": crudo["driver_number"],
                "vuelta": crudo["lap_number"],
                "fecha": _fecha(crudo["date"]),
                # OpenF1 solo mide la parada desde el GP de EE. UU. 2024.
                "duracion_s": crudo["stop_duration"] if "stop_duration" in crudo else None,
            }
        )
        return tabla.sort_values(["piloto", "vuelta"]).reset_index(drop=True)

    def direccion_carrera(self, sesion: int) -> pd.DataFrame:
        crudo = self.cliente.obtener(
            "race_control", {"session_key": sesion}, cachear=self.sesion_terminada(sesion)
        )
        columnas = [
            "fecha",
            "vuelta",
            "categoria",
            "bandera",
            "ambito",
            "sector",
            "piloto",
            "fase_clasificacion",
            "mensaje",
        ]
        if crudo.empty:
            return _vacio(columnas)
        tabla = pd.DataFrame(
            {
                "fecha": _fecha(crudo["date"]),
                "vuelta": crudo["lap_number"],
                "categoria": crudo["category"],
                "bandera": crudo["flag"],
                "ambito": crudo["scope"],
                "sector": crudo["sector"],
                "piloto": crudo["driver_number"],
                "fase_clasificacion": crudo["qualifying_phase"]
                if "qualifying_phase" in crudo
                else None,
                "mensaje": crudo["message"],
            }
        )
        return tabla.sort_values("fecha").reset_index(drop=True)
