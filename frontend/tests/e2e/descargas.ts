import { expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const FIRMA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Pulsa el botón de descarga y revisa lo que bajó: que de verdad sea un PNG, de qué tamaño y que no
 * esté en blanco. Devuelve el nombre del archivo, su ancho y alto y cuántos colores distintos tiene.
 */
export async function descargarYRevisar(page: Page, boton: RegExp | string) {
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: boton }).click(),
  ]);
  const bytes = readFileSync(await descarga.path());

  expect([...bytes.subarray(0, 8)]).toEqual(FIRMA_PNG);
  // En la cabecera IHDR el ancho y el alto son los bytes 16-19 y 20-23.
  const ancho = bytes.readUInt32BE(16);
  const alto = bytes.readUInt32BE(20);

  // Se dibuja la imagen en un lienzo pequeño y se cuentan los colores distintos: en blanco, uno solo.
  const colores = await page.evaluate(async (base64) => {
    const imagen = new Image();
    imagen.src = `data:image/png;base64,${base64}`;
    await imagen.decode();
    const lienzo = document.createElement("canvas");
    lienzo.width = 64;
    lienzo.height = 64;
    const ctx = lienzo.getContext("2d")!;
    ctx.drawImage(imagen, 0, 0, 64, 64);
    const datos = ctx.getImageData(0, 0, 64, 64).data;
    const distintos = new Set<string>();
    for (let i = 0; i < datos.length; i += 4) distintos.add(`${datos[i]},${datos[i + 1]},${datos[i + 2]}`);
    return distintos.size;
  }, bytes.toString("base64"));

  return { nombre: descarga.suggestedFilename(), ancho, alto, colores };
}
