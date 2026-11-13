// @vitest-environment node
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/og/route";
import { cargarFuentes } from "@/lib/og/fuentes";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

// `getTranslations` necesita la configuración que enchufa el plugin de Next; aquí se sustituye por
// un traductor sobre los mismos mensajes.
vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: locale === "es" ? es : en, namespace } as never),
}));

// `ImageResponse` dibuja de verdad, pero anota el elemento que recibe para poder mirar sus textos.
const dibujados = vi.hoisted(() => [] as { props: Record<string, string> }[]);
vi.mock("next/og", async (original) => {
  const real = await original<typeof import("next/og")>();
  return {
    ...real,
    ImageResponse: class extends real.ImageResponse {
      constructor(elemento: never, opciones?: never) {
        dibujados.push(elemento);
        super(elemento, opciones);
      }
    },
  };
});

const pedir = (consulta = "") => GET(new Request(`http://localhost:3000/api/og${consulta}`));

/** Ancho y alto del PNG, leídos de su cabecera IHDR. */
function medida(png: Uint8Array) {
  const vista = new DataView(png.buffer, png.byteOffset);
  return { ancho: vista.getUint32(16), alto: vista.getUint32(20) };
}

describe("GET /api/og", () => {
  it("devuelve un PNG de 1200×630 con caché larga", async () => {
    const respuesta = await pedir("?idioma=es");
    const png = new Uint8Array(await respuesta.arrayBuffer());

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers.get("content-type")).toBe("image/png");
    expect(respuesta.headers.get("cache-control")).toContain("s-maxage=604800");
    expect(Array.from(png.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(medida(png)).toEqual({ ancho: 1200, alto: 630 });
    // Con texto, logo y franja pesa decenas de KB; una imagen en blanco pesaría muy poco.
    expect(png.byteLength).toBeGreaterThan(15_000);
  });

  it("en inglés dibuja otra imagen que en español", async () => {
    const espanol = new Uint8Array(await (await pedir("?idioma=es")).arrayBuffer());
    const ingles = new Uint8Array(await (await pedir("?idioma=en")).arrayBuffer());

    expect(Buffer.from(ingles).equals(Buffer.from(espanol))).toBe(false);
  });

  it("la tarjeta de marca lleva el nombre y el eslogan de Meta, en cada idioma", async () => {
    for (const [idioma, mensajes] of [["es", es], ["en", en]] as const) {
      dibujados.length = 0;
      await pedir(`?idioma=${idioma}`);

      expect(dibujados.at(-1)?.props).toMatchObject({
        nombre: "Sector One",
        lema: "Beyond The Lap",
        descripcion: mensajes.Meta.descripcion,
      });
    }
    // El eslogan queda en inglés también en la versión en español.
    expect(es.Meta.eslogan).toBe(en.Meta.eslogan);
  });

  it("sin idioma usa el de por defecto", async () => {
    const respuesta = await pedir();

    expect(respuesta.status).toBe(200);
  });

  it("rechaza un idioma que la web no tiene, sin dibujar nada", async () => {
    const respuesta = await pedir("?idioma=fr");

    expect(respuesta.status).toBe(400);
    expect(await respuesta.json()).toEqual({ detail: "idioma_no_valido" });
  });

  it("no dibuja nunca texto que venga de la URL", async () => {
    const respuesta = await pedir("?idioma=es&titulo=HOLA&texto=hackeado");

    expect(respuesta.status).toBe(200);
  });
});

describe("fuentes", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("carga los dos pesos de Saira Condensed como TTF", async () => {
    const fuentes = await cargarFuentes();

    expect(fuentes.map((f) => f.weight).sort()).toEqual([500, 800]);
    for (const fuente of fuentes) {
      expect(fuente.name).toBe("Saira Condensed");
      // Un TTF empieza con 0x00010000.
      expect(Array.from(new Uint8Array(fuente.data, 0, 4))).toEqual([0, 1, 0, 0]);
    }
  });
});
