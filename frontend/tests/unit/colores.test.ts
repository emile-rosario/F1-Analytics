import { describe, expect, it } from "vitest";

import { COLORES_MARCHA, colorVelocidad } from "@/lib/colores";

describe("colorVelocidad", () => {
  it("la más lenta es azul, la media amarilla y la más rápida naranja", () => {
    expect(colorVelocidad(100, 100, 300)).toBe("rgb(61 123 255)");
    expect(colorVelocidad(200, 100, 300)).toBe("rgb(242 193 78)");
    expect(colorVelocidad(300, 100, 300)).toBe("rgb(255 90 54)");
  });

  it("mezcla de forma continua entre los colores", () => {
    expect(colorVelocidad(150, 100, 300)).not.toBe(colorVelocidad(100, 100, 300));
    expect(colorVelocidad(150, 100, 300)).not.toBe(colorVelocidad(200, 100, 300));
  });

  it("una velocidad fuera del rango se queda en el extremo", () => {
    expect(colorVelocidad(50, 100, 300)).toBe(colorVelocidad(100, 100, 300));
    expect(colorVelocidad(400, 100, 300)).toBe(colorVelocidad(300, 100, 300));
  });

  it("si todas las velocidades son iguales no divide entre cero", () => {
    expect(colorVelocidad(200, 200, 200)).toBe("rgb(61 123 255)");
  });
});

describe("COLORES_MARCHA", () => {
  it("hay ocho marchas, cada una de un color distinto", () => {
    expect(Object.keys(COLORES_MARCHA)).toHaveLength(8);
    expect(new Set(Object.values(COLORES_MARCHA)).size).toBe(8);
  });
});
