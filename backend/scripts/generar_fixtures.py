"""Guarda en tests/fixtures/openf1/ respuestas reales de OpenF1, recortadas para que pesen poco.

Uso (desde backend/):  uv run python scripts/generar_fixtures.py

Los tests no llaman a OpenF1: leen estos archivos. Hay que volver a correr el script solo
si se quieren otras sesiones o si cambia el formato de OpenF1.
"""

import json
import time
from datetime import timedelta
from pathlib import Path

import httpx
import pandas as pd

BASE = "https://api.openf1.org/v1"
DESTINO = Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "openf1"

ANIO = 2024
EVENTO_MONZA = 1244
PRETEMPORADA = 1228
CLASIFICACION = 9586  # Monza 2024, clasificación
CARRERA = 9590  # Monza 2024, carrera
LEC, VER = 16, 1

# España 2024, carrera: seca, con blanda, media y dura y sin safety car. Es la carrera destacada
# de gomas. Se guardan las vueltas de unos pocos pilotos con estrategias distintas.
CARRERA_ESPANA = 9539
PILOTOS_ESPANA = [1, 4, 16, 44, 55, 81]  # VER, NOR, LEC, HAM, SAI, PIA


def pedir(endpoint: str, **filtros) -> list[dict]:
    for intento in range(4):
        respuesta = httpx.get(f"{BASE}/{endpoint}", params=filtros, timeout=60)
        if respuesta.status_code == 404:
            return []
        if respuesta.status_code == 200:
            time.sleep(0.5)  # sin prisa: OpenF1 no documenta límites
            return respuesta.json()
        time.sleep(2**intento)
    respuesta.raise_for_status()
    return []


def formato(fecha: pd.Timestamp) -> str:
    return fecha.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"


def mejor_vuelta(vueltas: list[dict]) -> dict:
    validas = [v for v in vueltas if v["lap_duration"] and not v["is_pit_out_lap"]]
    return min(validas, key=lambda v: v["lap_duration"])


def main() -> None:
    DESTINO.mkdir(parents=True, exist_ok=True)
    tablas: dict[str, list[dict]] = {}

    tablas["meetings"] = pedir("meetings", year=ANIO)
    tablas["sessions"] = (
        pedir("sessions", year=ANIO, meeting_key=EVENTO_MONZA)
        + pedir("sessions", year=ANIO, meeting_key=PRETEMPORADA)
        + pedir("sessions", session_key=CARRERA_ESPANA)
    )

    tablas["drivers"] = (
        pedir("drivers", session_key=CLASIFICACION)
        + pedir("drivers", session_key=CARRERA)
        + pedir("drivers", session_key=CARRERA_ESPANA)
    )
    tablas["laps"] = (
        pedir("laps", session_key=CLASIFICACION, driver_number=LEC)
        + pedir("laps", session_key=CLASIFICACION, driver_number=VER)
        + pedir("laps", session_key=CARRERA, driver_number=LEC)
    )
    for piloto in PILOTOS_ESPANA:
        tablas["laps"] += pedir("laps", session_key=CARRERA_ESPANA, driver_number=piloto)
    tablas["stints"] = pedir("stints", session_key=CARRERA) + pedir(
        "stints", session_key=CARRERA_ESPANA
    )
    tablas["pit"] = pedir("pit", session_key=CARRERA) + pedir("pit", session_key=CARRERA_ESPANA)
    tablas["race_control"] = (
        pedir("race_control", session_key=CLASIFICACION)
        + pedir("race_control", session_key=CARRERA)
        + pedir("race_control", session_key=CARRERA_ESPANA)
    )
    tablas["session_result"] = pedir("session_result", session_key=CARRERA) + pedir(
        "session_result", session_key=CARRERA_ESPANA
    )

    # Telemetría solo de la mejor vuelta de cada piloto en la clasificación.
    coche, posicion = [], []
    for piloto in (LEC, VER):
        propias = [
            v
            for v in tablas["laps"]
            if v["session_key"] == CLASIFICACION and v["driver_number"] == piloto
        ]
        vuelta = mejor_vuelta(propias)
        inicio = pd.Timestamp(vuelta["date_start"])
        fin = inicio + timedelta(seconds=vuelta["lap_duration"])
        filtros = dict(
            session_key=CLASIFICACION,
            driver_number=piloto,
            **{"date>": formato(inicio), "date<": formato(fin)},
        )
        coche += pedir("car_data", **filtros)
        posicion += pedir("location", **filtros)
        print(f"piloto {piloto}: mejor vuelta {vuelta['lap_number']} = {vuelta['lap_duration']} s")
    tablas["car_data"], tablas["location"] = coche, posicion

    for nombre, filas in tablas.items():
        (DESTINO / f"{nombre}.json").write_text(
            json.dumps(filas, separators=(",", ":")), encoding="utf-8"
        )
        print(f"{nombre}.json: {len(filas)} filas")


if __name__ == "__main__":
    main()
