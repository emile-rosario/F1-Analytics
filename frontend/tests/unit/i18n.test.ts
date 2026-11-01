import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

type Mensajes = { [clave: string]: string | Mensajes };

/** Aplana un objeto anidado a rutas como `Inicio.titulo`. */
function claves(mensajes: Mensajes, prefijo = ""): string[] {
  return Object.entries(mensajes).flatMap(([clave, valor]) =>
    typeof valor === "string" ? [prefijo + clave] : claves(valor, `${prefijo}${clave}.`),
  );
}

describe("traducciones", () => {
  it("es.json y en.json tienen las mismas claves", () => {
    expect(claves(en).sort()).toEqual(claves(es).sort());
  });

  it("ninguna traducción está vacía", () => {
    for (const mensajes of [es, en] as Mensajes[]) {
      const vacias = claves(mensajes).filter((clave) => {
        const valor = clave.split(".").reduce<string | Mensajes>((m, k) => (m as Mensajes)[k], mensajes);
        return valor === "";
      });
      expect(vacias).toEqual([]);
    }
  });
});

describe("códigos de error", () => {
  /** Los códigos que la API puede devolver, leídos de la tabla de `api/errores.py`. */
  const codigosDeLaApi = [
    ...readFileSync("../backend/src/f1analytics/api/errores.py", "utf-8").matchAll(
      /^\s+"([a-z_0-9]+)": \d{3},/gm,
    ),
  ].map((coincidencia) => coincidencia[1]);

  it("encuentra los códigos de la API", () => {
    expect(codigosDeLaApi).toContain("openf1_en_vivo");
    expect(codigosDeLaApi.length).toBeGreaterThanOrEqual(10);
  });

  it.each([
    ["es", es],
    ["en", en],
  ])("%s traduce todos los códigos de la API y los del cliente", (_idioma, mensajes) => {
    const esperados = [...codigosDeLaApi, "tiempo_agotado", "sin_conexion", "fallo_api"];

    expect(Object.keys(mensajes.Errores)).toEqual(expect.arrayContaining(esperados));
  });
});
