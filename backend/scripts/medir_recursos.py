"""Mide la memoria y el tiempo de los análisis en las condiciones de Render Free.

Uso (desde backend/, con Docker corriendo e internet):

    uv run python scripts/medir_recursos.py
    uv run python scripts/medir_recursos.py --sin-build --salida medicion.md

Construye la imagen del ``Dockerfile`` y la corre con los mismos límites que el plan Free de
Render (512 MB de RAM, sin swap y 0,1 CPU). Mide tres cosas:

1. Cada análisis por separado, en un contenedor nuevo: la primera petición (en frío, sin caché
   de disco ni de memoria, como tras despertar la API) y la segunda (en caliente).
2. Todos los análisis seguidos en el mismo contenedor, para ver cuánta memoria se acumula.
3. Varios análisis a la vez, para ver qué hace el límite de concurrencia.

La memoria es ``memory.peak`` del cgroup del contenedor: el máximo desde que arrancó, y es lo
que el sistema compara con el límite para matar el proceso (OOM). No corre en CI: necesita
internet, Docker y que no haya una sesión de F1 en vivo.
"""

import argparse
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

import httpx

IMAGEN = "f1analytics-medir"
NOMBRE = "f1analytics-medir"
PUERTO = 8001
LIMITE_MB = 512
CPUS = "0.1"
BASE = f"http://localhost:{PUERTO}"
ESPERA_ARRANQUE_S = 120
ESPERA_PETICION_S = 900
RUTA_PICO = "/sys/fs/cgroup/memory.peak"
RUTA_ACTUAL = "/sys/fs/cgroup/memory.current"


@dataclass(frozen=True)
class Caso:
    """Un análisis concreto: un nombre para la tabla y la ruta con sus parámetros."""

    nombre: str
    ruta: str


CASOS = [
    Caso("circuito · Monza 2024, clasificación", "/api/analisis/circuito?sesion=9586&piloto=4"),
    Caso("gomas · España 2024, carrera (66 vueltas)", "/api/analisis/gomas?sesion=9539"),
    Caso("gomas · Mónaco 2024, carrera (78 vueltas)", "/api/analisis/gomas?sesion=9523"),
    Caso(
        "telemetría · Bahréin 2024, Q3, VER y LEC",
        "/api/analisis/telemetria?sesion=9468&piloto_a=1&piloto_b=16&segmento=Q3",
    ),
    Caso(
        "telemetría · España 2024, carrera, VER y NOR",
        "/api/analisis/telemetria?sesion=9539&piloto_a=1&piloto_b=4",
    ),
]


@dataclass
class Medicion:
    """Resultado de una petición: estado HTTP, tiempo, tamaño y memoria pico al terminar."""

    estado: int
    segundos: float
    kb: float
    pico_mb: float


@dataclass
class Resultado:
    """Todo lo medido para un caso (o para una prueba conjunta)."""

    nombre: str
    base_mb: float
    mediciones: dict[str, Medicion] = field(default_factory=dict)
    oom: bool = False


# --- Partes puras (con prueba unitaria) ---------------------------------------------------


def a_mb(bytes_: int) -> float:
    """Pasa bytes a MB (1 MB = 1024 * 1024 bytes), que es como Docker cuenta el límite."""
    return bytes_ / (1024 * 1024)


def leer_bytes(texto: str) -> int:
    """Lee el entero de un archivo del cgroup (``memory.peak`` o ``memory.current``)."""
    contenido = texto.strip()
    if not contenido.isdigit():
        raise ValueError(f"No es un número de bytes: {contenido!r}")
    return int(contenido)


def tabla_markdown(resultados: list[Resultado]) -> str:
    """Una fila por medición de cada resultado, como tabla de Markdown."""
    filas = [
        "| Prueba | Petición | Estado | Tiempo (s) | Respuesta (KB) | Memoria pico (MB) |",
        "|---|---|---|---|---|---|",
    ]
    for resultado in resultados:
        filas.append(f"| {resultado.nombre} | arranque | | | | {resultado.base_mb:.0f} |")
        for etiqueta, medicion in resultado.mediciones.items():
            filas.append(
                f"| | {etiqueta} | {medicion.estado} | {medicion.segundos:.1f} "
                f"| {medicion.kb:.0f} | {medicion.pico_mb:.0f} |"
            )
        if resultado.oom:
            filas.append("| | **¡El contenedor se quedó sin memoria (OOM)!** | | | | |")
    return "\n".join(filas)


def pico_maximo_mb(resultados: list[Resultado]) -> float:
    """La memoria pico más alta de todas las mediciones."""
    return max(
        (m.pico_mb for r in resultados for m in r.mediciones.values()),
        default=0.0,
    )


# --- Docker -------------------------------------------------------------------------------


def docker(*argumentos: str, comprobar: bool = True) -> str:
    """Corre ``docker`` y devuelve su salida. Si falla y ``comprobar``, para con el error."""
    proceso = subprocess.run(
        ["docker", *argumentos], capture_output=True, text=True, encoding="utf-8", check=False
    )
    if comprobar and proceso.returncode != 0:
        raise SystemExit(f"docker {' '.join(argumentos)} falló:\n{proceso.stderr.strip()}")
    return proceso.stdout


def construir_imagen(carpeta_backend: Path) -> None:
    print("Construyendo la imagen (la primera vez tarda unos minutos)…", flush=True)
    docker("build", "-t", IMAGEN, str(carpeta_backend))


def iniciar_contenedor() -> None:
    """Contenedor nuevo con los límites de Render Free; sin caché de disco ni de memoria."""
    docker("rm", "-f", NOMBRE, comprobar=False)
    docker(
        "run",
        "-d",
        "--name",
        NOMBRE,
        f"--memory={LIMITE_MB}m",
        f"--memory-swap={LIMITE_MB}m",
        f"--cpus={CPUS}",
        "-p",
        f"{PUERTO}:8000",
        IMAGEN,
    )
    limite = time.monotonic() + ESPERA_ARRANQUE_S
    while time.monotonic() < limite:
        try:
            if httpx.get(f"{BASE}/api/salud", timeout=5).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        time.sleep(1)
    raise SystemExit("La API no arrancó a tiempo.")


def parar_contenedor() -> bool:
    """Borra el contenedor y dice si el sistema lo había matado por falta de memoria."""
    oom = docker("inspect", "-f", "{{.State.OOMKilled}}", NOMBRE, comprobar=False).strip()
    docker("rm", "-f", NOMBRE, comprobar=False)
    return oom == "true"


def memoria_mb(ruta: str) -> float:
    return a_mb(leer_bytes(docker("exec", NOMBRE, "cat", ruta)))


# --- Mediciones ---------------------------------------------------------------------------


def pedir(ruta: str) -> Medicion:
    """Una petición al contenedor, con su tiempo, su tamaño y la memoria pico al terminar."""
    inicio = time.monotonic()
    try:
        respuesta = httpx.get(
            BASE + ruta, timeout=ESPERA_PETICION_S, headers={"Accept-Encoding": "gzip"}
        )
        estado, kb = respuesta.status_code, len(respuesta.content) / 1024
    except httpx.HTTPError as error:
        print(f"  error de red: {error}", file=sys.stderr)
        estado, kb = 0, 0.0
    segundos = time.monotonic() - inicio
    try:
        pico = memoria_mb(RUTA_PICO)
    except SystemExit:
        pico = float("nan")
    return Medicion(estado, segundos, kb, pico)


def medir_caso(caso: Caso) -> Resultado:
    print(f"· {caso.nombre}", flush=True)
    iniciar_contenedor()
    resultado = Resultado(caso.nombre, memoria_mb(RUTA_PICO))
    resultado.mediciones["en frío"] = pedir(caso.ruta)
    resultado.mediciones["en caliente"] = pedir(caso.ruta)
    resultado.oom = parar_contenedor()
    return resultado


def medir_seguidos() -> Resultado:
    print("· todos seguidos en el mismo contenedor", flush=True)
    iniciar_contenedor()
    resultado = Resultado("todos seguidos, mismo contenedor", memoria_mb(RUTA_PICO))
    for caso in CASOS:
        resultado.mediciones[caso.nombre] = pedir(caso.ruta)
    resultado.oom = parar_contenedor()
    return resultado


def medir_a_la_vez() -> Resultado:
    print("· todos a la vez en un contenedor nuevo", flush=True)
    iniciar_contenedor()
    resultado = Resultado("todos a la vez, contenedor nuevo", memoria_mb(RUTA_PICO))
    with ThreadPoolExecutor(max_workers=len(CASOS)) as hilos:
        mediciones = list(hilos.map(lambda caso: pedir(caso.ruta), CASOS))
    for caso, medicion in zip(CASOS, mediciones, strict=True):
        resultado.mediciones[caso.nombre] = medicion
    resultado.oom = parar_contenedor()
    return resultado


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--sin-build", action="store_true", help="usa la imagen ya construida")
    parser.add_argument("--salida", type=Path, help="guarda la tabla en este archivo")
    argumentos = parser.parse_args()

    if not argumentos.sin_build:
        construir_imagen(Path(__file__).resolve().parents[1])
    resultados = [medir_caso(caso) for caso in CASOS]
    resultados.append(medir_seguidos())
    resultados.append(medir_a_la_vez())

    tabla = tabla_markdown(resultados)
    print(f"\nLímites: {LIMITE_MB} MB de RAM y {CPUS} CPU (como Render Free)\n")
    print(tabla)
    print(f"\nPico más alto: {pico_maximo_mb(resultados):.0f} MB de {LIMITE_MB} MB")
    if argumentos.salida:
        argumentos.salida.write_text(tabla + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
