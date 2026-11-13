import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Las fuentes de las tarjetas para compartir.
 *
 * `next/og` (Satori) solo acepta TTF, OTF o WOFF, no el WOFF2 que sirve Google Fonts, así que
 * los TTF de Saira Condensed (licencia OFL, ver `src/assets/fonts/OFL.txt`) viven en el repo. Se
 * leen con `fs` desde la raíz del proyecto: en Node `fetch` no sabe abrir una URL `file://`, y
 * `next.config.ts` pide a Vercel que incluya esa carpeta en la función (`outputFileTracingIncludes`).
 */

export type FuenteTarjeta = {
  name: string;
  data: ArrayBuffer;
  weight: 500 | 800;
  style: "normal";
};

export const CARPETA_FUENTES = "src/assets/fonts";

const archivos = [
  { weight: 800, nombre: "SairaCondensed-ExtraBold.ttf" },
  { weight: 500, nombre: "SairaCondensed-Medium.ttf" },
] as const;

let enMemoria: Promise<FuenteTarjeta[]> | null = null;

/** Las fuentes, leídas una sola vez por instancia de la función. */
export function cargarFuentes(): Promise<FuenteTarjeta[]> {
  enMemoria ??= Promise.all(
    archivos.map(async ({ weight, nombre }) => {
      const datos = await readFile(path.join(process.cwd(), CARPETA_FUENTES, nombre));
      return {
        name: "Saira Condensed",
        data: datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer,
        weight,
        style: "normal" as const,
      };
    }),
  ).catch((error) => {
    // Si falla no se queda guardado el fallo: la siguiente petición lo vuelve a intentar.
    enMemoria = null;
    throw error;
  });
  return enMemoria;
}
