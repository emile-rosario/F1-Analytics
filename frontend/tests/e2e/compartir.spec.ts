import { expect, test, type APIRequestContext } from "@playwright/test";

/** El valor de una etiqueta `<meta>` del HTML que recibe un rastreador, que no ejecuta JavaScript. */
async function etiquetas(request: APIRequestContext, ruta: string) {
  const html = await (await request.get(ruta)).text();
  const leer = (atributo: "property" | "name", nombre: string) =>
    // En un atributo HTML el `&` de la URL va escrito `&amp;`; el rastreador lo lee como `&`.
    html.match(new RegExp(`<meta ${atributo}="${nombre}" content="([^"]*)"`))?.[1]?.replaceAll("&amp;", "&");
  return {
    titulo: html.match(/<title>([^<]*)<\/title>/)?.[1],
    ogTitulo: leer("property", "og:title"),
    ogImagen: leer("property", "og:image"),
    ogLocale: leer("property", "og:locale"),
    ogAlt: leer("property", "og:image:alt"),
    twitterCard: leer("name", "twitter:card"),
    twitterImagen: leer("name", "twitter:image"),
  };
}

test.describe("etiquetas para compartir en el HTML", () => {
  const casos = [
    { ruta: "/es", idioma: "es", locale: "es_ES" },
    { ruta: "/en", idioma: "en", locale: "en_US" },
    { ruta: "/es/glosario", idioma: "es", locale: "es_ES", titulo: "Glosario · F1 Analytics" },
    { ruta: "/en/gomas", idioma: "en", locale: "en_US" },
    { ruta: "/es/telemetria", idioma: "es", locale: "es_ES" },
    { ruta: "/es/circuito", idioma: "es", locale: "es_ES" },
  ];

  for (const { ruta, idioma, locale, titulo } of casos) {
    test(`${ruta} trae título, imagen y tarjeta de Twitter en ${idioma}`, async ({ request }) => {
      const e = await etiquetas(request, ruta);

      expect(e.ogTitulo).toBeTruthy();
      expect(e.ogTitulo).toBe(e.titulo);
      if (titulo) expect(e.titulo).toBe(titulo);
      // Los rastreadores piden una URL completa, no una ruta relativa.
      expect(e.ogImagen).toMatch(new RegExp(`^https://.+/api/og\\?idioma=${idioma}$`));
      expect(e.twitterImagen).toBe(e.ogImagen);
      expect(e.twitterCard).toBe("summary_large_image");
      expect(e.ogLocale).toBe(locale);
      expect(e.ogAlt).toBeTruthy();
    });
  }
});

test.describe("la imagen", () => {
  for (const idioma of ["es", "en"]) {
    test(`/api/og?idioma=${idioma} responde un PNG de 1200×630 que no está en blanco`, async ({ request }) => {
      const respuesta = await request.get(`/api/og?idioma=${idioma}`);
      const png = await respuesta.body();

      expect(respuesta.status()).toBe(200);
      expect(respuesta.headers()["content-type"]).toBe("image/png");
      expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(png.readUInt32BE(16)).toBe(1200);
      expect(png.readUInt32BE(20)).toBe(630);
      expect(png.byteLength).toBeGreaterThan(15_000);
    });
  }

  test("un idioma que no existe da 400, no una imagen", async ({ request }) => {
    const respuesta = await request.get("/api/og?idioma=fr");

    expect(respuesta.status()).toBe(400);
  });

  test("el proxy de idiomas no la intercepta: no hay redirección a /es/api/og", async ({ request }) => {
    const respuesta = await request.get("/api/og?idioma=es", { maxRedirects: 0 });

    expect(respuesta.status()).toBe(200);
  });
});

test.describe("la tarjeta de la vuelta de un piloto", () => {
  const vuelta = "anio=2024&evento=1244&sesion=9586&piloto=4";

  test("la página del circuito con sesión y piloto apunta a la imagen de esa vuelta, en el HTML sin JavaScript", async ({
    request,
  }) => {
    const e = await etiquetas(request, `/en/circuito?${vuelta}`);

    expect(e.ogImagen).toMatch(
      /^https:\/\/.+\/api\/og\?idioma=en&tarjeta=circuito&sesion=9586&piloto=4&anio=2024&evento=1244$/,
    );
    expect(e.twitterImagen).toBe(e.ogImagen);
    expect(e.ogAlt).toContain("circuit map");
  });

  test("sin elegir nada, o con una URL rara, queda la tarjeta de marca", async ({ request }) => {
    const sinElegir = await etiquetas(request, "/es/circuito");
    const rara = await etiquetas(request, "/es/circuito?sesion=abc&piloto=<script>");

    expect(sinElegir.ogImagen).toMatch(/\/api\/og\?idioma=es$/);
    expect(rara.ogImagen).toMatch(/\/api\/og\?idioma=es$/);
  });

  test("un rastreador recibe las etiquetas en el <head>, no al final del cuerpo", async ({ request }) => {
    for (const agente of ["WhatsApp/2.23.20.0", "LinkedInBot/1.0", "facebookexternalhit/1.1", "Twitterbot/1.0"]) {
      const html = await (
        await request.get(`/es/circuito?${vuelta}`, { headers: { "user-agent": agente } })
      ).text();

      const cierreHead = html.indexOf("</head>");
      const imagen = html.indexOf('property="og:image"');
      expect(imagen, agente).toBeGreaterThan(-1);
      expect(imagen, agente).toBeLessThan(cierreHead);
    }
  });

  test("la imagen siempre responde un PNG: sin backend cae a la tarjeta de marca", async ({ request }) => {
    const respuesta = await request.get(`/api/og?idioma=es&tarjeta=circuito&${vuelta}`);
    const png = await respuesta.body();

    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()["content-type"]).toBe("image/png");
    expect(png.readUInt32BE(16)).toBe(1200);
    expect(png.readUInt32BE(20)).toBe(630);
  });

  test("parámetros inválidos dan 400, no una imagen", async ({ request }) => {
    const respuesta = await request.get("/api/og?idioma=es&tarjeta=circuito&sesion=9586&piloto=cuatro");

    expect(respuesta.status()).toBe(400);
  });
});
