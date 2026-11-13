import { describe, expect, it } from "vitest";

import { geometriaMapa } from "@/lib/mapa";

import { crearAnalisis } from "./datos";

describe("geometriaMapa", () => {
  it("el cuadro envuelve la pista con un margen del 6 % del lado mayor y la y va hacia abajo", () => {
    const g = geometriaMapa(crearAnalisis());

    // La pista mide 4000 × 1500: el lado mayor da una unidad de 40 y un margen de 240.
    expect(g.unidad).toBe(40);
    expect(g.ancho).toBe(4000 + 480);
    expect(g.alto).toBe(1500 + 480);
    expect(g.px(0)).toBe(240);
    expect(g.py(1500)).toBe(240); // lo más alto de la pista queda arriba del dibujo
    expect(g.py(0)).toBe(1740);
  });

  it("da el rango de velocidades y un trazo por tramo, cerrando el circuito en la meta", () => {
    const g = geometriaMapa(crearAnalisis());

    expect([g.velMin, g.velMax]).toEqual([90, 320]);
    expect(g.trazos).toHaveLength(6);
  });
});
