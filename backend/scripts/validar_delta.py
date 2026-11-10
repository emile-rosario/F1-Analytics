"""Mide cuánto se equivoca el delta a mitad de vuelta contra los tiempos oficiales de sector.

Uso (desde backend/):  uv run python scripts/validar_delta.py

Para cada carrera elegida compara la vuelta más rápida de la Q3 del 1.º contra la del 2.º y la
del 3.º. OpenF1 da el tiempo de cada sector: la diferencia entre dos pilotos al terminar el
sector 1 (y el 2) es una verdad independiente de la telemetría. Se busca el punto de la pista
donde cada coche cruzó ese límite (según su reloj) y se compara el delta ahí.

Se calcula con el delta sin alisar y con el alisado de ``delta_tiempo``, para ver qué cambia el
alisado. Necesita internet y que no haya una sesión de F1 en vivo.
"""

import warnings

import numpy as np

from f1analytics.analisis.telemetria import VENTANA_SUAVIZADO_M, alinear_vueltas, delta_tiempo
from f1analytics.datos.cargador import Cargador
from f1analytics.datos.cliente import ClienteOpenF1
from f1analytics.datos.errores import ErrorDatos
from f1analytics.datos.telemetria_vuelta import telemetria_de_vuelta, vuelta_rapida

ANIO = 2024
CARRERAS = [
    "Bahrain Grand Prix",
    "Italian Grand Prix",
    "Monaco Grand Prix",
    "Spanish Grand Prix",
    "British Grand Prix",
]
VARIANTES = {"sin alisar": 0.0, f"alisado {VENTANA_SUAVIZADO_M:.0f} m": VENTANA_SUAVIZADO_M}


def mejores_de_q3(
    cargador: Cargador, sesion: int, cuantos: int = 3
) -> list[tuple[int, int, float]]:
    """Los ``cuantos`` pilotos más rápidos de la Q3: (número, vuelta, tiempo)."""
    filas = []
    for numero in cargador.pilotos(sesion)["numero"]:
        try:
            vuelta = vuelta_rapida(cargador, sesion, int(numero), "Q3")
        except ErrorDatos:
            continue
        datos = cargador.vueltas(sesion, int(numero)).set_index("vuelta").loc[vuelta]
        filas.append((int(numero), vuelta, float(datos["tiempo_vuelta_s"])))
    return sorted(filas, key=lambda fila: fila[2])[:cuantos]


def errores_de_pareja(cargador, sesion, a, b) -> dict[str, list[float]]:
    """Error (segundos) del delta en el fin del sector 1 y del 2, por variante."""
    vueltas = {p: cargador.vueltas(sesion, p).set_index("vuelta").loc[v] for p, v, _ in (a, b)}
    tels = {p: telemetria_de_vuelta(cargador, sesion, p, v) for p, v, _ in (a, b)}
    (pa, _, ta), (pb, _, tb) = a, b
    alineadas = alinear_vueltas(tels[pa], tels[pb])
    estiramiento = {
        p: alineadas["distancia_m"].iloc[-1] / tels[p]["distancia_m"].iloc[-1] for p in tels
    }

    resultado = {nombre: [] for nombre in VARIANTES}
    for corte in (1, 2):
        columnas = [f"sector_{i}_s" for i in range(1, corte + 1)]
        oficial = {p: vueltas[p][columnas].sum() for p in (pa, pb)}
        cruces = [
            np.interp(oficial[p], tels[p]["tiempo_s"], tels[p]["distancia_m"]) * estiramiento[p]
            for p in (pa, pb)
        ]
        punto = sum(cruces) / 2
        for nombre, ventana in VARIANTES.items():
            delta = delta_tiempo(alineadas, ta, tb, ventana_m=ventana)
            estimado = float(np.interp(punto, alineadas["distancia_m"], delta))
            resultado[nombre].append(estimado - float(oficial[pb] - oficial[pa]))
    return resultado


def main() -> None:
    warnings.filterwarnings("ignore")
    cargador = Cargador(ClienteOpenF1())
    calendario = cargador.calendario(ANIO)
    errores = {nombre: [] for nombre in VARIANTES}
    comparaciones = 0

    for carrera in CARRERAS:
        evento = int(calendario.loc[calendario["nombre"] == carrera, "evento"].iloc[0])
        sesion = cargador.buscar_sesion(ANIO, evento, "Qualifying")
        podio = mejores_de_q3(cargador, sesion)
        for rival in podio[1:]:
            try:
                parcial = errores_de_pareja(cargador, sesion, podio[0], rival)
            except ErrorDatos as error:
                print(f"{carrera}: {podio[0][0]} contra {rival[0]} no disponible ({error})")
                continue
            comparaciones += 1
            for nombre, lista in parcial.items():
                errores[nombre] += lista
            texto = "  ".join(
                f"{nombre}: S1 {v[0] * 1000:+4.0f} S2 {v[1] * 1000:+4.0f} ms"
                for nombre, v in parcial.items()
            )
            print(f"{carrera} ({podio[0][0]} contra {rival[0]}) -> {texto}")

    print(f"\n{comparaciones} comparaciones, {len(errores['sin alisar'])} cruces de sector")
    for nombre, lista in errores.items():
        absolutos = np.abs(lista)
        medio, maximo = absolutos.mean(), absolutos.max()
        print(f"  {nombre:16s} error medio {medio:.3f} s, máximo {maximo:.3f} s")


if __name__ == "__main__":
    main()
