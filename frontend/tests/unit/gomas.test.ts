import { describe, expect, it, vi } from "vitest";

import { pedirAnalisisGomas } from "@/lib/api";
import { formatearTiempoVuelta } from "@/lib/formato";
import {
  alternarPiloto,
  leerPilotos,
  marcasEje,
  sinDegradacionMedible,
} from "@/lib/gomas";

import { crearAnalisisGomas } from "./datos";

describe("leerPilotos", () => {
  it("lee los números separados por coma", () => {
    expect(leerPilotos("1,4,44")).toEqual([1, 4, 44]);
  });

  it("sin valor o vacío da una lista vacía", () => {
    expect(leerPilotos(null)).toEqual([]);
    expect(leerPilotos("")).toEqual([]);
  });

  it("descarta lo que no es un número positivo y los repetidos", () => {
    expect(leerPilotos("1,abc,0,-4,1,2.5,16")).toEqual([1, 16]);
  });

  it("se queda con los primeros tres", () => {
    expect(leerPilotos("1,4,16,44")).toEqual([1, 4, 16]);
  });
});

describe("alternarPiloto", () => {
  it("agrega un piloto al final", () => {
    expect(alternarPiloto([1, 4], 44)).toEqual([1, 4, 44]);
  });

  it("quita un piloto que ya estaba", () => {
    expect(alternarPiloto([1, 4, 44], 4)).toEqual([1, 44]);
  });

  it("no deja la elección vacía", () => {
    expect(alternarPiloto([1], 1)).toEqual([1]);
  });

  it("con el máximo lleno no agrega a otro", () => {
    expect(alternarPiloto([1, 4, 44], 16)).toEqual([1, 4, 44]);
  });
});

describe("sinDegradacionMedible", () => {
  const resumen = crearAnalisisGomas().resumen;

  it("es falso cuando la mayoría de los stints se gasta", () => {
    expect(
      sinDegradacionMedible({
        ...resumen,
        n_stints_validos: 20,
        n_stints_sin_degradacion: 3,
      }),
    ).toBe(false);
  });

  it("es verdadero cuando la mitad o más no se gasta (Qatar 2024: 17 de 20)", () => {
    expect(
      sinDegradacionMedible({
        ...resumen,
        n_stints_validos: 20,
        n_stints_sin_degradacion: 17,
      }),
    ).toBe(true);
    expect(
      sinDegradacionMedible({
        ...resumen,
        n_stints_validos: 20,
        n_stints_sin_degradacion: 10,
      }),
    ).toBe(true);
  });

  it("es verdadero si no hay ningún stint válido", () => {
    expect(
      sinDegradacionMedible({
        ...resumen,
        n_stints_validos: 0,
        n_stints_sin_degradacion: 0,
      }),
    ).toBe(true);
  });
});

describe("marcasEje", () => {
  it("elige pasos redondos dentro del rango", () => {
    expect(marcasEje(0, 25, 5)).toEqual([0, 5, 10, 15, 20, 25]);
    expect(marcasEje(80.3, 83.9, 5)).toEqual([81, 82, 83]);
  });

  it("con un rango vacío devuelve solo el mínimo", () => {
    expect(marcasEje(3, 3)).toEqual([3]);
  });
});

describe("formatearTiempoVuelta con decimales", () => {
  it("redondea al décimo para las marcas del eje", () => {
    expect(formatearTiempoVuelta(81.96, "es", 1)).toBe("1:22,0");
    expect(formatearTiempoVuelta(81.5, "en", 1)).toBe("1:21.5");
  });
});

describe("pedirAnalisisGomas", () => {
  async function rutaPedida(pilotos?: number[]) {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(crearAnalisisGomas()), { status: 200 }),
      );
    await pedirAnalisisGomas(9539, pilotos, { fetchFn });
    const url = new URL(fetchFn.mock.calls[0][0]);
    return `${url.pathname}${url.search}`;
  }

  it("sin pilotos pide solo la sesión", async () => {
    expect(await rutaPedida()).toBe("/api/analisis/gomas?sesion=9539");
  });

  it("repite `pilotos` por cada piloto elegido", async () => {
    expect(await rutaPedida([1, 4])).toBe(
      "/api/analisis/gomas?sesion=9539&pilotos=1&pilotos=4",
    );
  });
});
