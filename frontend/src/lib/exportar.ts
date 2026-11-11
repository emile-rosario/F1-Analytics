import { toCanvas } from "html-to-image";

/** Fondo de la web (`--color-asfalto`, docs/design.md): el PNG sale oscuro como la página. */
const FONDO = "#1a1c23";
const COLOR_CREDITO = "#a3a9b7"; // --color-suave
/** El PNG sale al doble de resolución para que se lea bien al compartirlo o proyectarlo. */
const ESCALA = 2;
const ALTO_CREDITO = 36; // px de la web, antes de multiplicar por la escala
/** Aire alrededor del gráfico: sin él, los textos que empiezan en el borde del nodo quedan pegados. */
const MARGEN = 20;
/** Cuánto se conserva el enlace del archivo antes de liberarlo. */
const REVOCAR_TRAS_MS = 30_000;

/**
 * Nombre de archivo a partir de partes sueltas: sin tildes, en minúsculas y con guiones.
 * `nombreArchivo("telemetria", 9468, "VER", "LEC")` → `f1analytics-telemetria-9468-ver-lec.png`
 */
export function nombreArchivo(...partes: (string | number)[]): string {
  const limpias = partes
    .map((p) =>
      String(p)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean);
  return `f1analytics-${limpias.join("-")}.png`;
}

/**
 * Los elementos con `data-no-exportar` (cursor, tooltip, banda de zoom) no salen en el PNG.
 *
 * La opción `filter` de html-to-image no sirve para esto: dentro de un SVG la librería clona todo
 * el subárbol de una vez y nunca llama al filtro. Por eso se esconden en la página mientras dura
 * la captura y se devuelven a su estado después.
 */
export async function sinElementosInteractivos<T>(nodo: HTMLElement, tarea: () => Promise<T>): Promise<T> {
  const ocultos = [...nodo.querySelectorAll<HTMLElement | SVGElement>("[data-no-exportar]")];
  const antes = ocultos.map((elemento) => elemento.style.visibility);
  // Sin puntero mientras dura la captura: si el mouse entra al gráfico a mitad, no se monta un
  // tooltip ni una banda de zoom que acabarían en la imagen.
  const punteroAntes = nodo.style.pointerEvents;
  nodo.style.pointerEvents = "none";
  for (const elemento of ocultos) elemento.style.visibility = "hidden";
  try {
    return await tarea();
  } finally {
    ocultos.forEach((elemento, i) => (elemento.style.visibility = antes[i]));
    nodo.style.pointerEvents = punteroAntes;
  }
}

/** Lleva todas las animaciones del nodo a su estado final, para no capturar un gráfico a medio dibujar. */
function terminarAnimaciones(nodo: HTMLElement) {
  for (const animacion of nodo.getAnimations?.({ subtree: true }) ?? []) {
    try {
      animacion.finish();
    } catch (error) {
      // Las animaciones infinitas no se pueden terminar (InvalidStateError): no están en los
      // gráficos. Cualquier otro error sí se avisa.
      if (!(error instanceof DOMException && error.name === "InvalidStateError")) throw error;
    }
  }
}

/**
 * La imagen del gráfico con margen alrededor y una franja de crédito debajo, dibujadas sobre el
 * lienzo (sin tocar la página).
 */
function conCredito(imagen: HTMLCanvasElement, credito: string, fuente: string): HTMLCanvasElement {
  const alto = ALTO_CREDITO * ESCALA;
  const margen = MARGEN * ESCALA;
  const lienzo = document.createElement("canvas");
  lienzo.width = imagen.width + 2 * margen;
  lienzo.height = margen + imagen.height + alto;
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("sin_canvas");

  ctx.fillStyle = FONDO;
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(imagen, margen, margen);
  ctx.fillStyle = COLOR_CREDITO;
  ctx.font = `${14 * ESCALA}px ${fuente}`;
  ctx.textBaseline = "middle";
  ctx.fillText(credito, margen, margen + imagen.height + alto / 2);
  return lienzo;
}

function aBlob(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rechazar) =>
    lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error("sin_imagen"))), "image/png"),
  );
}

/** Convierte el nodo en un PNG con su crédito y lo descarga con ese nombre. */
export async function descargarPng(nodo: HTMLElement, nombre: string, credito: string) {
  terminarAnimaciones(nodo);
  const imagen = await sinElementosInteractivos(nodo, () =>
    toCanvas(nodo, { pixelRatio: ESCALA, backgroundColor: FONDO }),
  );
  const blob = await aBlob(conCredito(imagen, credito, getComputedStyle(nodo).fontFamily));

  const direccion = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = direccion;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // No se revoca al instante: en Safari y Firefox la descarga arranca en otro momento y un enlace
  // ya revocado da un archivo vacío.
  setTimeout(() => URL.revokeObjectURL(direccion), REVOCAR_TRAS_MS);
}
