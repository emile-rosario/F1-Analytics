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
