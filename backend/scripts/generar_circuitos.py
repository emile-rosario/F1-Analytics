"""Arma src/f1analytics/datos/circuitos.json con una copia estática de datos de MultiViewer.

Uso (desde backend/):  uv run python scripts/generar_circuitos.py

OpenF1 no trae los números de curva ni la rotación del mapa. La API
pública de MultiViewer (https://multiviewer.app) sí. Se consulta UNA vez, aquí, y el
resultado se guarda en el repo: la app nunca llama a MultiViewer mientras corre.

Las coordenadas de MultiViewer y las de OpenF1 `location` están en el mismo sistema
(décimas de metro), lo que se comprueba en tests/unit/test_circuitos.py.
"""

import json
import math
import time
from pathlib import Path

import httpx

OPENF1 = "https://api.openf1.org/v1"
MULTIVIEWER = "https://api.multiviewer.app/api/v1/circuits"
ANIOS = (2023, 2024, 2025, 2026)
DESTINO = Path(__file__).resolve().parents[1] / "src" / "f1analytics" / "datos" / "circuitos.json"
PAUSA_S = 0.7  # MultiViewer es un servicio comunitario: sin prisa

FUENTE = (
    "Copia estática de la API pública de MultiViewer (https://multiviewer.app), "
    "generada con scripts/generar_circuitos.py. Coordenadas en décimas de metro, "
    "las mismas de la telemetría de OpenF1."
)


def pedir(url: str, **params) -> dict | list | None:
    for intento in range(4):
        try:
            respuesta = httpx.get(url, params=params, timeout=60)
        except httpx.TransportError:
            time.sleep(2**intento)
            continue
        time.sleep(PAUSA_S)
        if respuesta.status_code == 200:
            return respuesta.json()
        if respuesta.status_code in (403, 404):
            return None
        time.sleep(2**intento)
    return None


def circuitos_por_anio() -> dict[int, dict[int, str]]:
    """{circuit_key: {anio: nombre}} para todos los GP desde 2023."""
    encontrados: dict[int, dict[int, str]] = {}
    for anio in ANIOS:
        reuniones = pedir(f"{OPENF1}/meetings", year=anio) or []
        for reunion in reuniones:
            if "Testing" in reunion["meeting_name"]:
                continue
            encontrados.setdefault(reunion["circuit_key"], {})[anio] = reunion["circuit_short_name"]
    return encontrados


def distancias_acumuladas(xs: list[float], ys: list[float]) -> list[float]:
    """Distancia recorrida hasta cada punto del trazado, en décimas de metro."""
    acumulada = [0.0]
    for i in range(1, len(xs)):
        acumulada.append(acumulada[-1] + math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]))
    return acumulada


def convertir(crudo: dict) -> dict:
    """Se queda con lo que usa la app: curvas numeradas, rotación del mapa y largo."""
    acumulada = distancias_acumuladas(crudo["x"], crudo["y"])
    return {
        "rotacion": crudo["rotation"],
        "longitud_m": round(acumulada[-1] / 10, 1),
        "curvas": [
            {
                "numero": curva["number"],
                "letra": curva.get("letter") or "",
                "x": round(curva["trackPosition"]["x"], 1),
                "y": round(curva["trackPosition"]["y"], 1),
                "distancia_m": round(curva["length"] / 10, 1),
            }
            for curva in sorted(
                crudo["corners"], key=lambda c: (c["number"], c.get("letter") or "")
            )
        ],
    }


def main() -> None:
    resultado: dict[str, dict] = {}
    for clave, anios in sorted(circuitos_por_anio().items()):
        disenos: list[dict] = []
        for anio in sorted(anios):
            crudo = pedir(f"{MULTIVIEWER}/{clave}/{anio}")
            if not crudo or not crudo.get("corners") or not crudo.get("x"):
                print(f"  {clave} {anios[anio]} {anio}: sin datos en MultiViewer")
                continue
            diseno = convertir(crudo)
            # Si el trazado no cambió respecto al diseño anterior, solo se suma el año.
            if disenos and {k: v for k, v in disenos[-1].items() if k != "anios"} == diseno:
                disenos[-1]["anios"].append(anio)
            else:
                disenos.append({"anios": [anio], **diseno})
        if disenos:
            nombre = anios[max(anios)]
            resultado[str(clave)] = {"nombre": nombre, "disenos": disenos}
            resumen = ", ".join(
                f"{d['anios'][0]}-{d['anios'][-1]}: {len(d['curvas'])} curvas" for d in disenos
            )
            print(f"{clave:>4} {nombre}: {resumen}")

    DESTINO.write_text(
        json.dumps(
            {"fuente": FUENTE, "circuitos": resultado}, ensure_ascii=False, separators=(",", ":")
        ),
        encoding="utf-8",
    )
    print(
        f"\n{len(resultado)} circuitos guardados en {DESTINO} ({DESTINO.stat().st_size // 1024} KB)"
    )


if __name__ == "__main__":
    main()
