/** Colores de datos de docs/design.md. Los de marcha son los mismos de `graficos/estilo.py`. */

const VELOCIDAD = ["#3d7bff", "#f2c14e", "#ff5a36"] as const; // lenta → media → rápida

/** Un color por marcha, de la 1 a la 8 (viridis, apto para daltonismo). */
export const COLORES_MARCHA: Record<number, string> = {
  1: "#414487",
  2: "#33638d",
  3: "#277f8e",
  4: "#1f9a8a",
  5: "#32b67a",
  6: "#69cd5b",
  7: "#b2dd2d",
  8: "#fde725",
};

function aRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function mezclar(a: string, b: string, t: number): string {
  const [ra, ga, ba] = aRgb(a);
  const [rb, gb, bb] = aRgb(b);
  const canal = (x: number, y: number) => Math.round(x + (y - x) * t);
  return `rgb(${canal(ra, rb)} ${canal(ga, gb)} ${canal(ba, bb)})`;
}

/** Color de una velocidad dentro del rango de la vuelta: azul lenta, amarillo media, naranja rápida. */
export function colorVelocidad(velocidad: number, minima: number, maxima: number): string {
  const t = maxima > minima ? Math.min(1, Math.max(0, (velocidad - minima) / (maxima - minima))) : 0;
  return t < 0.5
    ? mezclar(VELOCIDAD[0], VELOCIDAD[1], t * 2)
    : mezclar(VELOCIDAD[1], VELOCIDAD[2], (t - 0.5) * 2);
}

/** Degradado CSS de la escala de velocidad, para la leyenda. */
export const DEGRADADO_VELOCIDAD = `linear-gradient(to right, ${VELOCIDAD.join(", ")})`;
