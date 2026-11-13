import { readFileSync } from "node:fs";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { TERMINOS, VALORES_GLOSARIO } from "@/lib/glosario";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

const RAIZ_BACKEND = "../backend/src/f1analytics/";

/** El valor de una constante o de un parámetro por defecto de Python, leído del código. */
function numeroDelBackend(archivo: string, patron: RegExp): number {
  const coincidencia = readFileSync(RAIZ_BACKEND + archivo, "utf-8").match(patron);
  if (!coincidencia) throw new Error(`No se encontró ${patron} en ${archivo}`);
  return Number(coincidencia[1]);
}

describe("números del glosario", () => {
  it("coinciden con los del backend", () => {
    expect(VALORES_GLOSARIO.segundos).toBe(
      numeroDelBackend("datos/limpieza.py", /^SEGUNDOS_POR_VUELTA = ([\d.]+)/m),
    );
    expect(VALORES_GLOSARIO.minimo).toBe(
      numeroDelBackend("analisis/gomas.py", /^MINIMO_VUELTAS = (\d+)/m),
    );
    expect(VALORES_GLOSARIO.tramos).toBe(
      numeroDelBackend("analisis/telemetria.py", /n_sectores: int = (\d+)/),
    );
    expect(VALORES_GLOSARIO.metros).toBe(
      numeroDelBackend("analisis/circuito.py", /longitud_min_m: float = (\d+)/),
    );
  });

  it("el umbral de vuelta lenta es el porcentaje por encima de la mediana", () => {
    const multiplo = numeroDelBackend("datos/limpieza.py", /^UMBRAL_MEDIANA = ([\d.]+)/m);

    expect(VALORES_GLOSARIO.umbral).toBeCloseTo((multiplo - 1) * 100, 6);
  });
});

describe.each([
  ["es", es],
  ["en", en],
] as const)("glosario en %s", (idioma, mensajes) => {
  const claves = Object.keys(mensajes.Glosario.terminos);

  it("define exactamente los términos de la lista, sin sobrantes", () => {
    expect([...claves].sort()).toEqual([...TERMINOS].sort());
  });

  it("cada término tiene nombre, definición y ejemplo, y se escribe sin llaves sueltas", () => {
    const errores = vi.fn();
    const t = createTranslator({
      locale: idioma,
      messages: mensajes,
      namespace: "Glosario",
      onError: errores,
    });

    for (const clave of TERMINOS) {
      for (const campo of ["nombre", "definicion", "ejemplo"] as const) {
        const texto = t(`terminos.${clave}.${campo}` as never, VALORES_GLOSARIO as never);
        expect(texto.trim(), `${clave}.${campo}`).not.toBe("");
        expect(texto, `${clave}.${campo}`).not.toMatch(/[{}]/);
      }
    }
    expect(errores).not.toHaveBeenCalled();
  });

  it("las definiciones muestran los números del backend con el formato del idioma", () => {
    const t = createTranslator({ locale: idioma, messages: mensajes, namespace: "Glosario" });
    // Cada mensaje usa solo algunos de los valores; el tipo de `t` exige exactamente los suyos.
    const decir = (clave: string) => t(clave as never, VALORES_GLOSARIO as never);
    const coma = idioma === "es" ? "0,06" : "0.06";

    expect(decir("terminos.combustible.definicion")).toContain(`${coma} s`);
    expect(decir("terminos.tramo.definicion")).toContain("25 ");
    expect(decir("terminos.degradacion.definicion")).toContain("5 ");
  });
});
