"""Cliente HTTP de OpenF1, con reintentos y caché en memoria y en disco."""

import hashlib
import json
import time
from collections import OrderedDict
from collections.abc import Callable, Mapping
from pathlib import Path

import httpx
import pandas as pd

from f1analytics import config
from f1analytics.datos.errores import ErrorOpenF1

ESPERA_MAXIMA_S = 30.0


def _espera_retry_after(respuesta: httpx.Response) -> float | None:
    """Segundos que pide esperar el servidor en un 429, si los indica."""
    try:
        return min(float(respuesta.headers["retry-after"]), ESPERA_MAXIMA_S)
    except (KeyError, ValueError):
        return None


class ClienteOpenF1:
    """Trae datos de OpenF1 como DataFrames.

    Solo guarda en caché lo que el llamador marca con ``cachear=True``: así una sesión
    en curso, que sigue cambiando, nunca queda congelada.
    """

    def __init__(
        self,
        base_url: str = config.URL_OPENF1,
        *,
        timeout: float = 60.0,
        reintentos: int = 4,
        espera_base_s: float = 1.0,
        dir_cache: Path | None = config.DIR_CACHE,
        max_bytes_memoria: int = config.MAX_BYTES_CACHE_MEMORIA,
        cliente_http: httpx.Client | None = None,
        dormir: Callable[[float], None] = time.sleep,
    ):
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._reintentos = reintentos
        self._espera_base_s = espera_base_s
        self._dir_cache = dir_cache
        self._max_bytes = max_bytes_memoria
        self._http = cliente_http or httpx.Client()
        self._dormir = dormir
        self._memoria: OrderedDict[str, tuple[pd.DataFrame, int]] = OrderedDict()
        self._bytes_memoria = 0

    def obtener(
        self,
        endpoint: str,
        filtros: Mapping[str, object] | None = None,
        *,
        cachear: bool = False,
    ) -> pd.DataFrame:
        """Pide un endpoint con sus filtros (``{"date>": "2024-..."}`` incluidos).

        Una consulta sin resultados devuelve un DataFrame vacío: OpenF1 responde 404.
        """
        filtros = dict(filtros or {})
        clave = self._clave(endpoint, filtros)

        if cachear:
            guardado = self._leer_cache(endpoint, clave)
            if guardado is not None:
                return guardado

        tabla = pd.DataFrame(self._pedir(endpoint, filtros))
        if cachear and not tabla.empty:
            self._guardar_cache(endpoint, clave, tabla)
        return tabla

    def _pedir(self, endpoint: str, filtros: dict[str, object]) -> list[dict]:
        url = f"{self._base_url}/{endpoint}"
        codigo = "fallo_openf1"

        for intento in range(self._reintentos + 1):
            espera = None
            try:
                respuesta = self._http.get(url, params=filtros, timeout=self._timeout)
            except httpx.TransportError:
                codigo = "fallo_openf1"
            else:
                if respuesta.status_code == 200:
                    return respuesta.json()
                if respuesta.status_code == 404:
                    return []
                if respuesta.status_code == 429:
                    codigo, espera = "limite_peticiones", _espera_retry_after(respuesta)
                elif respuesta.status_code >= 500:
                    codigo = "fallo_openf1"
                else:
                    raise ErrorOpenF1("fallo_openf1", respuesta.status_code)

            if intento < self._reintentos:
                if espera is None:
                    espera = min(self._espera_base_s * 2**intento, ESPERA_MAXIMA_S)
                self._dormir(espera)

        raise ErrorOpenF1(codigo)

    @staticmethod
    def _clave(endpoint: str, filtros: dict[str, object]) -> str:
        canonico = json.dumps([endpoint, sorted(filtros.items())], default=str)
        return hashlib.sha1(canonico.encode()).hexdigest()

    def _ruta_disco(self, endpoint: str, clave: str) -> Path | None:
        return self._dir_cache / endpoint / f"{clave}.parquet" if self._dir_cache else None

    def _leer_cache(self, endpoint: str, clave: str) -> pd.DataFrame | None:
        if clave in self._memoria:
            self._memoria.move_to_end(clave)
            return self._memoria[clave][0].copy()

        ruta = self._ruta_disco(endpoint, clave)
        if ruta is not None and ruta.exists():
            try:
                tabla = pd.read_parquet(ruta)
            except (OSError, ValueError):
                return None  # archivo dañado: se vuelve a pedir
            self._poner_en_memoria(clave, tabla)
            return tabla.copy()
        return None

    def _guardar_cache(self, endpoint: str, clave: str, tabla: pd.DataFrame) -> None:
        self._poner_en_memoria(clave, tabla)

        ruta = self._ruta_disco(endpoint, clave)
        if ruta is None:
            return
        try:
            ruta.parent.mkdir(parents=True, exist_ok=True)
            temporal = ruta.with_suffix(".tmp")
            tabla.to_parquet(temporal)
            temporal.replace(ruta)
        except OSError:
            pass  # sin disco escribible se sigue solo con la memoria

    def _poner_en_memoria(self, clave: str, tabla: pd.DataFrame) -> None:
        peso = int(tabla.memory_usage(deep=True).sum())
        if peso > self._max_bytes:
            return
        if clave in self._memoria:
            self._bytes_memoria -= self._memoria.pop(clave)[1]
        self._memoria[clave] = (tabla.copy(), peso)
        self._bytes_memoria += peso
        while self._bytes_memoria > self._max_bytes:
            _, (_, liberado) = self._memoria.popitem(last=False)
            self._bytes_memoria -= liberado
