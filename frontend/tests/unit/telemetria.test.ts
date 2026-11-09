import { describe, expect, it, vi } from "vitest";

import { pedirAnalisisTelemetria } from "@/lib/api";
import {
  indiceMasCercano,
  pilotoPorDelante,
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
