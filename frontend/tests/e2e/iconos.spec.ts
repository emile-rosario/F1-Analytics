import { expect, test } from "@playwright/test";

// Los iconos los detecta Next por convención (archivos en src/app) y el proxy de idiomas no debe
// reescribirlos a /es/...: por eso se pide cada archivo y se mira el <head> de las dos lenguas.

const ARCHIVOS = [
  { ruta: "/icon.svg", tipo: "image/svg+xml" },
  { ruta: "/favicon.ico", tipo: "image/x-icon" },
  { ruta: "/apple-icon.png", tipo: "image/png" },
  { ruta: "/icon-192.png", tipo: "image/png" },
  { ruta: "/icon-512.png", tipo: "image/png" },
];

for (const archivo of ARCHIVOS) {
  test(`${archivo.ruta} se sirve sin pasar por el idioma`, async ({ request }) => {
    const respuesta = await request.get(archivo.ruta);

    expect(respuesta.status()).toBe(200);
    expect(respuesta.headers()["content-type"]).toContain(archivo.tipo);
    expect((await respuesta.body()).length).toBeGreaterThan(100);
  });
}

for (const idioma of ["es", "en"]) {
  test(`/${idioma} declara el favicon, el icono de Apple y el manifest en el head`, async ({
    request,
  }) => {
    const html = await (await request.get(`/${idioma}`)).text();

    // Next añade `sizes` entre `href` y `type`, y una marca de versión al nombre del archivo.
    expect(html).toMatch(/<link rel="icon" href="\/icon\.svg[^"]*"[^>]*type="image\/svg\+xml"/);
    expect(html).toMatch(/<link rel="icon" href="\/favicon\.ico[^"]*"[^>]*type="image\/x-icon"/);
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/apple-icon\.png[^"]*"/);
    expect(html).toMatch(/<link rel="manifest" href="\/manifest\.webmanifest"/);
  });
}

test("el manifest nombra la web y apunta a iconos que existen", async ({ request }) => {
  const respuesta = await request.get("/manifest.webmanifest");
  expect(respuesta.status()).toBe(200);
  const manifest = await respuesta.json();

  expect(manifest.name).toBe("Sector One");
  expect(manifest.theme_color).toBe("#1A1C23");
  expect(manifest.icons.map((icono: { sizes: string }) => icono.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
  for (const icono of manifest.icons as { src: string }[]) {
    expect((await request.get(icono.src)).status()).toBe(200);
  }
});
