/**
 * Términos del glosario, en el orden en que se muestran, y los números del análisis que sus
 * definiciones citan.
 *
 * Las definiciones viven en `messages/*.json` (`Glosario.terminos.<clave>`). Las claves son las
 * mismas que el `id` del ancla en `/glosario#<clave>`.
 *
 * Los números se repiten de los del backend (`analisis/` y `datos/limpieza.py`) porque la página
 * es estática y no llama a la API. `tests/unit/glosario.test.ts` los compara con el código de
 * Python: si alguien cambia uno allí, ese test falla hasta que se cambie aquí también.
 */
export const TERMINOS = [
  "stint",
  "compuesto",
  "edadGoma",
  "vueltaLimpia",
  "degradacion",
  "combustible",
  "r2",
  "safetyCar",
  "telemetria",
  "delta",
  "tramo",
  "frenada",
] as const;

export type Termino = (typeof TERMINOS)[number];

/** Parámetros ICU que usan las definiciones; los nombres coinciden con los de `messages/*.json`. */
export const VALORES_GLOSARIO = {
  /** `SEGUNDOS_POR_VUELTA` de `datos/limpieza.py`. */
  segundos: 0.06,
  /** `UMBRAL_MEDIANA` de `datos/limpieza.py` (1,07), como porcentaje por encima de la mediana. */
  umbral: 7,
  /** `MINIMO_VUELTAS` de `analisis/gomas.py`. */
  minimo: 5,
  /** `n_sectores` de `ganador_por_minisector` en `analisis/telemetria.py`. */
  tramos: 25,
  /** `longitud_min_m` de `zonas_frenado` en `analisis/circuito.py`. */
  metros: 20,
} as const;
