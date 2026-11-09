import type { AnalisisTelemetria } from "@/lib/api";

/** Sesión destacada de telemetría: Bahréin 2024, clasificación, VER contra LEC en la Q3. */
export const SESION_DESTACADA_TELEMETRIA = {
  anio: "2024",
  evento: "1229",
  sesion: "9468",
  piloto_a: "1",
  piloto_b: "16",
  segmento: "Q3",
};

const SEGMENTOS_CLASIFICACION = ["Q1", "Q2", "Q3"];
const SEGMENTOS_SPRINT = ["SQ1", "SQ2", "SQ3"];

/**
 * Segmentos que se pueden elegir según la sesión: Q1, Q2 y Q3 en la clasificación, SQ1, SQ2 y
 * SQ3 en la clasificación sprint, y ninguno en las demás (se usa la mejor vuelta).
 */
export function segmentosDe(nombreSesion: string | undefined): string[] {
  if (nombreSesion === "Qualifying") return SEGMENTOS_CLASIFICACION;
  if (nombreSesion === "Sprint Qualifying" || nombreSesion === "Sprint Shootout") {
    return SEGMENTOS_SPRINT;
  }
  return [];
}

/** Índice del punto más cercano a `distancia` (las distancias van de menor a mayor). */
export function indiceMasCercano(distancias: number[], distancia: number): number {
  let bajo = 0;
  let alto = distancias.length - 1;
  while (bajo < alto) {
    const medio = (bajo + alto) >> 1;
    if (distancias[medio] < distancia) bajo = medio + 1;
    else alto = medio;
  }
  if (bajo > 0 && distancia - distancias[bajo - 1] <= distancias[bajo] - distancia) return bajo - 1;
  return bajo;
}

/**
 * Tramos `[desde, hasta]` (en metros) en que `activo` es verdadero. Un tramo llega hasta la
 * siguiente muestra, que es cuando se vio que el freno ya no estaba pisado.
 */
export function tramosActivos(activo: boolean[], distancias: number[]): [number, number][] {
  const tramos: [number, number][] = [];
  let inicio: number | null = null;
  activo.forEach((valor, i) => {
    if (valor && inicio === null) inicio = i;
    if (!valor && inicio !== null) {
      tramos.push([distancias[inicio], distancias[i]]);
      inicio = null;
    }
  });
  if (inicio !== null) tramos.push([distancias[inicio], distancias[distancias.length - 1]]);
  return tramos;
}

/** Piloto que va por delante en un delta (positivo = B pierde): `"a"`, `"b"` o `null` si es casi cero. */
export function pilotoPorDelante(delta: number, minimo = 0.0005): "a" | "b" | null {
  if (Math.abs(delta) < minimo) return null;
  return delta > 0 ? "a" : "b";
}

/** Número del minisector al que pertenece una distancia (o el último, si se pasa). */
export function sectorDe(minisectores: AnalisisTelemetria["minisectores"], distancia: number): number {
  const i = minisectores.findIndex((s) => distancia < s.fin_m);
  return i === -1 ? minisectores.length - 1 : i;
}
