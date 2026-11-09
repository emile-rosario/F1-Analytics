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

/** Tramo visible de la vuelta, en metros desde la meta. */
export type Rango = { desde: number; hasta: number };

/** Lo menos que se puede acercar: con muestras cada 5 m son unos 20 puntos. */
export const RANGO_MINIMO_M = 100;

const limitar = (valor: number, minimo: number, maximo: number) =>
  Math.min(maximo, Math.max(minimo, valor));

/** La vuelta entera. */
export const rangoCompleto = (largo: number): Rango => ({ desde: 0, hasta: largo });

export const esRangoCompleto = (rango: Rango, largo: number): boolean =>
  rango.desde <= 0 && rango.hasta >= largo;

/**
 * Deja el rango dentro de la vuelta y con al menos `RANGO_MINIMO_M` de ancho. `mueve` dice cuál
 * extremo tocó quien lo cambió: si se pasan, el que cede es el otro extremo.
 */
export function ajustarRango(rango: Rango, largo: number, mueve: keyof Rango): Rango {
  const minimo = Math.min(RANGO_MINIMO_M, largo);
  let desde = limitar(rango.desde, 0, largo);
  let hasta = limitar(rango.hasta, 0, largo);
  if (hasta - desde < minimo) {
    if (mueve === "desde") desde = Math.max(0, hasta - minimo);
    else hasta = Math.min(largo, desde + minimo);
    // Si se topó con el borde de la vuelta, cede el otro extremo.
    if (hasta - desde < minimo) {
      if (mueve === "desde") hasta = Math.min(largo, desde + minimo);
      else desde = Math.max(0, hasta - minimo);
    }
  }
  return { desde, hasta };
}

/** Rango que se elige arrastrando de `a` a `b` (en cualquier sentido). */
export function rangoDeArrastre(a: number, b: number, largo: number): Rango {
  return ajustarRango({ desde: Math.min(a, b), hasta: Math.max(a, b) }, largo, "hasta");
}

/** Primer y último índice cuya distancia cae dentro del rango (ambos incluidos). */
export function indicesDelRango(distancias: number[], rango: Rango): [number, number] {
  let primero = indiceMasCercano(distancias, rango.desde);
  if (distancias[primero] < rango.desde) primero += 1;
  let ultimo = indiceMasCercano(distancias, rango.hasta);
  if (distancias[ultimo] > rango.hasta) ultimo -= 1;
  primero = limitar(primero, 0, distancias.length - 1);
  ultimo = limitar(ultimo, 0, distancias.length - 1);
  return [primero, Math.max(primero, ultimo)];
}

/** Deja un índice dentro de `[primero, ultimo]`. */
export const indiceEnRango = (indice: number, [primero, ultimo]: [number, number]): number =>
  limitar(indice, primero, ultimo);
