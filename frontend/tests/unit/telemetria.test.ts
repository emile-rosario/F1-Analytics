import { describe, expect, it, vi } from "vitest";

import { pedirAnalisisTelemetria } from "@/lib/api";
import {
  ajustarRango,
  esRangoCompleto,
  indiceEnRango,
  indiceMasCercano,
  indicesDelRango,
  pilotoPorDelante,
  rangoCompleto,
  rangoDeArrastre,
  sectorDe,
  segmentosDe,
  tramosActivos,
} from "@/lib/telemetria";

import { crearAnalisisTelemetria } from "./datos";

describe("segmentosDe", () => {
  it("la clasificación tiene Q1, Q2 y Q3", () => {
    expect(segmentosDe("Qualifying")).toEqual(["Q1", "Q2", "Q3"]);
  });

  it("la clasificación sprint tiene SQ1, SQ2 y SQ3, con sus dos nombres", () => {
    expect(segmentosDe("Sprint Qualifying")).toEqual(["SQ1", "SQ2", "SQ3"]);
    expect(segmentosDe("Sprint Shootout")).toEqual(["SQ1", "SQ2", "SQ3"]);
  });

  it("las demás sesiones no tienen segmentos", () => {
    for (const nombre of ["Race", "Sprint", "Practice 1", undefined]) {
      expect(segmentosDe(nombre)).toEqual([]);
    }
  });
});

describe("indiceMasCercano", () => {
  const distancias = [0, 5, 10, 15, 20];

  it("encuentra la muestra exacta", () => {
    expect(indiceMasCercano(distancias, 10)).toBe(2);
  });

  it("redondea hacia la muestra más cercana", () => {
    expect(indiceMasCercano(distancias, 11)).toBe(2);
    expect(indiceMasCercano(distancias, 14)).toBe(3);
  });

  it("en un empate exacto se queda con la anterior", () => {
    expect(indiceMasCercano(distancias, 12.5)).toBe(2);
  });

  it("se queda en los extremos si la distancia se pasa", () => {
    expect(indiceMasCercano(distancias, -30)).toBe(0);
    expect(indiceMasCercano(distancias, 500)).toBe(4);
  });
});

describe("tramosActivos", () => {
  const distancias = [0, 5, 10, 15, 20, 25];

  it("saca cada racha de muestras verdaderas, hasta la siguiente muestra", () => {
    const activo = [false, true, true, false, true, false];

    expect(tramosActivos(activo, distancias)).toEqual([
      [5, 15],
      [20, 25],
    ]);
  });

  it("una racha que llega al final de la vuelta termina en la última distancia", () => {
    expect(tramosActivos([false, false, false, false, true, true], distancias)).toEqual([[20, 25]]);
  });

  it("sin ninguna muestra verdadera no hay tramos", () => {
    expect(tramosActivos([false, false, false, false, false, false], distancias)).toEqual([]);
  });
});

describe("pilotoPorDelante", () => {
  it("un delta positivo es de A (B pierde) y uno negativo, de B", () => {
    expect(pilotoPorDelante(0.2)).toBe("a");
    expect(pilotoPorDelante(-0.2)).toBe("b");
  });

  it("casi cero no es de nadie", () => {
    expect(pilotoPorDelante(0)).toBeNull();
    expect(pilotoPorDelante(0.0002)).toBeNull();
  });
});

describe("sectorDe", () => {
  const { minisectores } = crearAnalisisTelemetria();

  it("da el minisector al que pertenece una distancia", () => {
    expect(sectorDe(minisectores, 0)).toBe(0);
    expect(sectorDe(minisectores, 39.9)).toBe(0);
    expect(sectorDe(minisectores, 40)).toBe(1);
    expect(sectorDe(minisectores, 500)).toBe(12);
  });

  it("lo que se pasa del final cae en el último", () => {
    expect(sectorDe(minisectores, 1000)).toBe(24);
    expect(sectorDe(minisectores, 1500)).toBe(24);
  });
});

describe("rango visible", () => {
  const LARGO = 5344.8;

  it("la vuelta entera es de 0 al largo", () => {
    expect(rangoCompleto(LARGO)).toEqual({ desde: 0, hasta: LARGO });
    expect(esRangoCompleto(rangoCompleto(LARGO), LARGO)).toBe(true);
    expect(esRangoCompleto({ desde: 0, hasta: 3000 }, LARGO)).toBe(false);
    expect(esRangoCompleto({ desde: 10, hasta: LARGO }, LARGO)).toBe(false);
  });

  describe("ajustarRango", () => {
    it("deja pasar un rango válido sin tocarlo", () => {
      expect(ajustarRango({ desde: 500, hasta: 1500 }, LARGO, "desde")).toEqual({ desde: 500, hasta: 1500 });
    });

    it("lo mantiene dentro de la vuelta", () => {
      expect(ajustarRango({ desde: -50, hasta: 9000 }, LARGO, "desde")).toEqual({ desde: 0, hasta: LARGO });
    });

    it("exige al menos 100 m: si se mueve «desde» de más, cede «desde»", () => {
      expect(ajustarRango({ desde: 1450, hasta: 1500 }, LARGO, "desde")).toEqual({ desde: 1400, hasta: 1500 });
      expect(ajustarRango({ desde: 2000, hasta: 1500 }, LARGO, "desde")).toEqual({ desde: 1400, hasta: 1500 });
    });

    it("si se mueve «hasta» de menos, cede «hasta»", () => {
      expect(ajustarRango({ desde: 1000, hasta: 1020 }, LARGO, "hasta")).toEqual({ desde: 1000, hasta: 1100 });
      expect(ajustarRango({ desde: 1000, hasta: 200 }, LARGO, "hasta")).toEqual({ desde: 1000, hasta: 1100 });
    });

    it("en el borde de la vuelta cede el otro extremo", () => {
      expect(ajustarRango({ desde: 0, hasta: 30 }, LARGO, "desde")).toEqual({ desde: 0, hasta: 100 });
      expect(ajustarRango({ desde: LARGO - 20, hasta: LARGO }, LARGO, "hasta")).toEqual({
        desde: LARGO - 100,
        hasta: LARGO,
      });
    });

    it("en una vuelta más corta que el mínimo, el rango es la vuelta entera", () => {
      expect(ajustarRango({ desde: 10, hasta: 20 }, 60, "hasta")).toEqual({ desde: 0, hasta: 60 });
    });
  });

  describe("rangoDeArrastre", () => {
    it("ordena los extremos, arrastres de derecha a izquierda incluidos", () => {
      expect(rangoDeArrastre(1000, 2000, LARGO)).toEqual({ desde: 1000, hasta: 2000 });
      expect(rangoDeArrastre(2000, 1000, LARGO)).toEqual({ desde: 1000, hasta: 2000 });
    });

    it("un arrastre muy corto se ensancha hasta el mínimo", () => {
      const rango = rangoDeArrastre(1000, 1030, LARGO);
      expect(rango.hasta - rango.desde).toBe(100);
      expect(rango.desde).toBe(1000);
    });

    it("un arrastre corto en el final de la vuelta no se sale", () => {
      expect(rangoDeArrastre(LARGO - 10, LARGO, LARGO)).toEqual({ desde: LARGO - 100, hasta: LARGO });
    });
  });

  describe("indicesDelRango", () => {
    const distancias = [0, 5, 10, 15, 20, 25, 30];

    it("da el primer y el último punto que caen dentro", () => {
      expect(indicesDelRango(distancias, { desde: 7, hasta: 22 })).toEqual([2, 4]);
    });

    it("incluye los extremos exactos", () => {
      expect(indicesDelRango(distancias, { desde: 5, hasta: 25 })).toEqual([1, 5]);
    });

    it("la vuelta entera abarca todos los puntos", () => {
      expect(indicesDelRango(distancias, { desde: 0, hasta: 30.4 })).toEqual([0, 6]);
    });

    it("un rango sin ningún punto exacto queda en un solo índice", () => {
      expect(indicesDelRango(distancias, { desde: 11, hasta: 13 })).toEqual([3, 3]);
    });
  });

  it("indiceEnRango deja el cursor dentro del rango", () => {
    expect(indiceEnRango(40, [10, 20])).toBe(20);
    expect(indiceEnRango(2, [10, 20])).toBe(10);
    expect(indiceEnRango(15, [10, 20])).toBe(15);
  });
});

describe("pedirAnalisisTelemetria", () => {
  async function rutaPedida(segmento?: string | null) {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(crearAnalisisTelemetria()), { status: 200 }));
    await pedirAnalisisTelemetria(9468, 1, 16, segmento, { fetchFn });
    const url = new URL(fetchFn.mock.calls[0][0]);
    return `${url.pathname}${url.search}`;
  }

  it("pide la sesión y los dos pilotos", async () => {
    expect(await rutaPedida()).toBe("/api/analisis/telemetria?sesion=9468&piloto_a=1&piloto_b=16");
  });

  it("agrega el segmento solo si hay uno", async () => {
    expect(await rutaPedida("Q3")).toBe(
      "/api/analisis/telemetria?sesion=9468&piloto_a=1&piloto_b=16&segmento=Q3",
    );
    expect(await rutaPedida(null)).toBe("/api/analisis/telemetria?sesion=9468&piloto_a=1&piloto_b=16");
  });
});
