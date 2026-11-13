import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import { metadatos, metadatosDePagina, rutaTarjeta, rutaTarjetaCircuito } from "@/lib/metadatos";
import { URL_PRODUCCION, urlDelSitio } from "@/lib/sitio";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

vi.mock("next-intl/server", () => ({
  getTranslations: async ({ locale, namespace }: { locale: string; namespace: string }) =>
    createTranslator({ locale, messages: locale === "es" ? es : en, namespace } as never),
}));

describe("metadatos", () => {
  it("pone título, descripción y las etiquetas de Open Graph y Twitter", async () => {
    const m = await metadatos("es", "Glosario · F1 Analytics", "Qué significa cada término");

    expect(m.title).toBe("Glosario · F1 Analytics");
    expect(m.openGraph).toMatchObject({
      type: "website",
      siteName: "F1 Analytics",
      locale: "es_ES",
      title: "Glosario · F1 Analytics",
      description: "Qué significa cada término",
    });
    expect(m.twitter).toMatchObject({ card: "summary_large_image", title: "Glosario · F1 Analytics" });
  });

  it("la imagen es la tarjeta del idioma, con su tamaño y un texto alternativo traducido", async () => {
    const espanol = await metadatos("es", "x", "y");
    const ingles = await metadatos("en", "x", "y");

    expect(espanol.openGraph?.images).toEqual([
      expect.objectContaining({
        url: "/api/og?idioma=es",
        width: 1200,
        height: 630,
        alt: "Tarjeta de F1 Analytics: cada vuelta, metro a metro",
      }),
    ]);
    expect(ingles.openGraph).toMatchObject({ locale: "en_US" });
    expect(ingles.openGraph?.images).toEqual([
      expect.objectContaining({ url: "/api/og?idioma=en", alt: "F1 Analytics card: every lap, metre by metre" }),
    ]);
    expect(espanol.twitter?.images).toEqual(["/api/og?idioma=es"]);
  });

  it("una página usa su título y su subtítulo", async () => {
    const m = await metadatosDePagina("en", "Glosario");

    expect(m.title).toBe("Glossary · F1 Analytics");
    expect(m.description).toBe("What each term used on this site means, with an example.");
    expect(m.openGraph).toMatchObject({ title: "Glossary · F1 Analytics" });
  });

  it("rutaTarjeta apunta a la ruta de la imagen", () => {
    expect(rutaTarjeta("en")).toBe("/api/og?idioma=en");
  });
});

describe("la tarjeta de la vuelta en la página del circuito", () => {
  const completa = { anio: "2024", evento: "1244", sesion: "9586", piloto: "4" };

  it("con sesión y piloto en la URL, la imagen es la de esa vuelta", () => {
    expect(rutaTarjetaCircuito("es", completa)).toBe(
      "/api/og?idioma=es&tarjeta=circuito&sesion=9586&piloto=4&anio=2024&evento=1244",
    );
  });

  it("sin año o sin evento pide solo la vuelta", () => {
    expect(rutaTarjetaCircuito("en", { sesion: "9586", piloto: "4", anio: "2024" })).toBe(
      "/api/og?idioma=en&tarjeta=circuito&sesion=9586&piloto=4",
    );
  });

  it("sin sesión o sin piloto no hay tarjeta propia", () => {
    expect(rutaTarjetaCircuito("es", {})).toBeNull();
    expect(rutaTarjetaCircuito("es", { sesion: "9586" })).toBeNull();
    expect(rutaTarjetaCircuito("es", { piloto: "4" })).toBeNull();
  });

  it("solo pasan enteros: nada escrito en la URL llega a la imagen", () => {
    expect(rutaTarjetaCircuito("es", { ...completa, sesion: "9586&titulo=HOLA" })).toBeNull();
    expect(rutaTarjetaCircuito("es", { ...completa, piloto: ["4", "5"] })).toBeNull();
    // Un año inválido no tumba la tarjeta: solo se pierde la línea del Gran Premio.
    expect(rutaTarjetaCircuito("es", { ...completa, anio: "<script>" })).toBe(
      "/api/og?idioma=es&tarjeta=circuito&sesion=9586&piloto=4",
    );
  });

  it("la página del circuito usa esa imagen, con su texto alternativo; las otras, la de marca", async () => {
    const circuito = await metadatosDePagina("es", "Circuito", completa);
    const sinElegir = await metadatosDePagina("es", "Circuito", {});
    const gomas = await metadatosDePagina("es", "Gomas", completa);

    expect(circuito.openGraph?.images).toEqual([
      expect.objectContaining({
        url: expect.stringContaining("tarjeta=circuito&sesion=9586"),
        alt: es.Compartir.altCircuito,
      }),
    ]);
    expect(circuito.twitter?.images).toEqual([expect.stringContaining("tarjeta=circuito")]);
    expect(sinElegir.openGraph?.images).toEqual([expect.objectContaining({ url: "/api/og?idioma=es" })]);
    expect(gomas.openGraph?.images).toEqual([expect.objectContaining({ url: "/api/og?idioma=es" })]);
  });
});

describe("urlDelSitio", () => {
  const entorno = (valores: Record<string, string>) => valores as unknown as NodeJS.ProcessEnv;

  it("usa NEXT_PUBLIC_URL_SITIO si se define, por encima de todo", () => {
    const url = urlDelSitio(
      entorno({ NEXT_PUBLIC_URL_SITIO: "https://f1.ejemplo.com", NODE_ENV: "production" }),
    );

    expect(url.origin).toBe("https://f1.ejemplo.com");
  });

  it("en una previsualización de Vercel usa la dirección de ese despliegue", () => {
    const url = urlDelSitio(
      entorno({ VERCEL_ENV: "preview", VERCEL_URL: "f1-analytics-git-rama.vercel.app", NODE_ENV: "production" }),
    );

    expect(url.origin).toBe("https://f1-analytics-git-rama.vercel.app");
  });

  it("al construir para producción usa la web de producción", () => {
    expect(urlDelSitio(entorno({ NODE_ENV: "production", VERCEL_ENV: "production" })).origin).toBe(URL_PRODUCCION);
    expect(urlDelSitio(entorno({ NODE_ENV: "production" })).origin).toBe(URL_PRODUCCION);
  });

  it("en desarrollo usa localhost", () => {
    expect(urlDelSitio(entorno({ NODE_ENV: "development" })).origin).toBe("http://localhost:3000");
  });
});
