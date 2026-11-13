import type { AnalisisCircuito } from "@/lib/api";

/** Si la vuelta empieza y termina a menos de esto (décimas de metro) se cierra el circuito. */
const CIERRE_DECIMAS_M = 1_000;

type Punto = { x: number; y: number };

/**
 * Lo que hace falta para dibujar el mapa de una vuelta, sea en el navegador (`MapaCircuito`) o en
 * la tarjeta para compartir (`lib/og`): el cuadro, las funciones que pasan de coordenadas de la
 * pista a las del dibujo y los trazos de la pista.
 *
 * Los datos llegan con `y` hacia arriba y ya girados como en la transmisión; el SVG tiene `y`
 * hacia abajo, así que aquí solo se invierte.
 */
export function geometriaMapa({ puntos, curvas }: Pick<AnalisisCircuito, "puntos" | "curvas">) {
  const todos: Punto[] = [...puntos, ...curvas];
  const minX = Math.min(...todos.map((p) => p.x));
  const maxX = Math.max(...todos.map((p) => p.x));
  const minY = Math.min(...todos.map((p) => p.y));
  const maxY = Math.max(...todos.map((p) => p.y));
  const unidad = Math.max(maxX - minX, maxY - minY) / 100; // 1 % del lado mayor
  const margen = 6 * unidad;

  const velocidades = puntos.map((p) => p.velocidad);

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  const cierraVuelta = Math.hypot(primero.x - ultimo.x, primero.y - ultimo.y) < CIERRE_DECIMAS_M;
  const trazos = puntos
    .map((desde, i) => ({ desde, hasta: i < puntos.length - 1 ? puntos[i + 1] : primero }))
    .filter(
      ({ desde, hasta }, i) =>
        (i < puntos.length - 1 || cierraVuelta) && (desde.x !== hasta.x || desde.y !== hasta.y),
    );

  return {
    ancho: maxX - minX + 2 * margen,
    alto: maxY - minY + 2 * margen,
    unidad,
    px: (x: number) => x - minX + margen,
    py: (y: number) => maxY - y + margen,
    velMin: Math.min(...velocidades),
    velMax: Math.max(...velocidades),
    trazos,
  };
}
