"""Busca carreras buenas para el análisis de gomas entre 2023 y el año actual.

Uso (desde backend/):  uv run python scripts/buscar_carrera_gomas.py

Una carrera sirve de ejemplo si es seca, usó blanda, media y dura en cantidad, casi no tuvo
vueltas con safety car, VSC o bandera roja y deja muchos stints con vueltas limpias. El script
las puntúa todas y muestra las mejores. Necesita internet y que no haya una sesión de F1 en vivo.
"""

import warnings
from datetime import UTC, datetime

import pandas as pd

from f1analytics.analisis.gomas import degradacion_por_stint
from f1analytics.datos.cargador import Cargador
from f1analytics.datos.cliente import ClienteOpenF1
from f1analytics.datos.limpieza import (
    agregar_correccion_combustible,
    agregar_edad_goma,
    estado_pista_por_vuelta,
    limpiar_vueltas_carrera,
)

PRIMER_ANIO = 2023
MIN_STINTS_POR_COMPUESTO = 8
MAX_FRACCION_NEUTRALIZADA = 0.05


def evaluar(cargador: Cargador, anio: int, evento) -> dict | None:
    sesiones = cargador.sesiones(anio, evento.evento)
    carrera = sesiones[sesiones["nombre"] == "Race"]
    if carrera.empty or not carrera.iloc[0]["terminada"]:
        return None
    sesion = int(carrera.iloc[0]["sesion"])

    stints = cargador.stints(sesion)
    vueltas = cargador.vueltas(sesion)
    if stints.empty or vueltas.empty:
        return None

    n_vueltas = int(vueltas["vuelta"].max())
    estado = estado_pista_por_vuelta(cargador.direccion_carrera(sesion), n_vueltas)
    limpias = limpiar_vueltas_carrera(vueltas, cargador.paradas(sesion), estado)
    limpias = agregar_correccion_combustible(agregar_edad_goma(limpias, stints))
    degradacion = degradacion_por_stint(limpias)

    compuestos = stints["compuesto"].str.upper().value_counts()
    return {
        "anio": anio,
        "gran_premio": evento.nombre,
        "sesion": sesion,
        "blanda": int(compuestos.get("SOFT", 0)),
        "media": int(compuestos.get("MEDIUM", 0)),
        "dura": int(compuestos.get("HARD", 0)),
        "lluvia": int(compuestos.get("INTERMEDIATE", 0) + compuestos.get("WET", 0)),
        "no_verde_pct": round(100 * (estado != "verde").mean(), 1),
        "roja": bool((estado == "roja").any()),
        "stints_validos": int((~degradacion["insuficiente"]).sum()),
        "stints_total": len(degradacion),
    }


def main() -> None:
    warnings.filterwarnings("ignore")
    cargador = Cargador(ClienteOpenF1())
    filas = []
    for anio in range(PRIMER_ANIO, datetime.now(UTC).year + 1):
        for evento in cargador.calendario(anio).itertuples():
            fila = evaluar(cargador, anio, evento)
            if fila:
                filas.append(fila)
                print(f"{anio} {evento.nombre}: listo")

    tabla = pd.DataFrame(filas)
    tabla["minimo_compuesto"] = tabla[["blanda", "media", "dura"]].min(axis=1)
    elegibles = tabla[
        (tabla["lluvia"] == 0)
        & ~tabla["roja"]
        & (tabla["minimo_compuesto"] >= MIN_STINTS_POR_COMPUESTO)
        & (tabla["no_verde_pct"] <= 100 * MAX_FRACCION_NEUTRALIZADA)
    ].sort_values(["minimo_compuesto", "stints_validos"], ascending=False)

    pd.set_option("display.width", 200)
    print(f"\n{len(tabla)} carreras revisadas, {len(elegibles)} cumplen todo:\n")
    print(elegibles.drop(columns=["roja", "lluvia"]).to_string(index=False))


if __name__ == "__main__":
    main()
