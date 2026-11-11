import { expect, test, type Page } from "@playwright/test";

import { descargarYRevisar } from "./descargas";

import { crearAnalisisGomas } from "../unit/datos";

test.use({ locale: "es-ES" });

const CORS = { "access-control-allow-origin": "*" };
const URL_COMPLETA = "anio=2024&evento=1238&sesion=9539";

const EVENTO = {
  evento: 1238,
  nombre: "Spanish Grand Prix",
  nombre_oficial: "FORMULA 1 ARAMCO GRAN PREMIO DE ESPAÑA 2024",
  pais: "Spain",
  circuito: "Catalunya",
  circuito_clave: 15,
  inicio: "2024-06-21T11:30:00Z",
};

const SESION = {
  sesion: 9539,
  nombre: "Race",
  tipo: "Race",
  inicio: "2024-06-23T13:00:00Z",
  fin: "2024-06-23T15:00:00Z",
  evento: 1238,
  anio: 2024,
  terminada: true,
};

type Respuesta = { estado: number; cuerpo: unknown };

/** Simula la API; el análisis lo decide cada prueba y se anotan las peticiones que llegan. */
async function simularApi(
  page: Page,
  analisis: () => Respuesta = () => ({ estado: 200, cuerpo: crearAnalisisGomas() }),
) {
  const pedidos: string[] = [];
  const responder = (cuerpo: unknown, estado = 200) => ({ status: estado, json: cuerpo, headers: CORS });
  await page.route("**/api/salud", (r) => r.fulfill(responder({ estado: "ok", version: "abc1234" })));
  await page.route("**/api/calendario/*", (r) => r.fulfill(responder([EVENTO])));
  await page.route("**/api/sesiones/2024/1238", (r) => r.fulfill(responder([SESION])));
  await page.route("**/api/analisis/gomas*", (r) => {
    pedidos.push(new URL(r.request().url()).search);
    const { estado, cuerpo } = analisis();
    return r.fulfill(responder(cuerpo, estado));
  });
  return pedidos;
}

const posiciones = (page: Page) =>
  page
    .getByTestId("puntos")
    .locator(".punto-goma")
    .evaluateAll((puntos) => puntos.map((p) => (p as SVGGElement).style.transform));

test("sin elección abre la carrera destacada y muestra el análisis", async ({ page }) => {
  await simularApi(page);

  await page.goto("/es/gomas");

  await expect(page).toHaveURL(/\/es\/gomas\?anio=2024&evento=1238&sesion=9539$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "¿Cuánto le costó a un piloto su estrategia de gomas?",
  );
  await expect(page.getByText("La blanda fue la que más se gastó: 0,100 s por vuelta")).toBeVisible();
  await expect(page.getByRole("list", { name: "Estrategias de gomas por piloto" }).getByRole("button")).toHaveCount(4);
  await expect(page.getByLabel("Sesión", { exact: true })).toHaveValue("9539");
});

test("elegir un piloto en la estrategia lo agrega a la URL y pide sus vueltas", async ({ page }) => {
  const pedidos = await simularApi(page);
  await page.goto(`/es/gomas?${URL_COMPLETA}&pilotos=1`);
  await expect(page.getByRole("button", { name: /^VER/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: /^HAM/ }).click();

  await expect(page).toHaveURL(/pilotos=1%2C44$/);
  await expect.poll(() => pedidos).toContain("?sesion=9539&pilotos=1&pilotos=44");
  await expect(page.getByRole("button", { name: /^HAM/ })).toHaveAttribute("aria-pressed", "true");
});

test("con tres pilotos elegidos no deja agregar otro", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/gomas?${URL_COMPLETA}`);
  await expect(page.getByText("Ya hay 3 pilotos elegidos")).toBeVisible();

  await page.getByRole("button", { name: /^LEC/ }).click({ force: true });

  await expect(page).toHaveURL(new RegExp(`${URL_COMPLETA}$`));
});

test("cada piloto elegido tiene su propio panel y al quitar uno desaparece el suyo", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/gomas?${URL_COMPLETA}`);
  const paneles = page.getByRole("img", { name: /Tiempos de vuelta limpios de/ });
  await expect(paneles).toHaveCount(3);
  await expect(paneles.first()).toHaveAccessibleName(/de VER/);
  // Cada panel solo dibuja a su piloto.
  expect(
    await paneles.evaluateAll((svgs) =>
      svgs.map((s) => [...new Set([...s.querySelectorAll<SVGGElement>(".punto-goma")].map((g) => g.dataset.piloto))]),
    ),
  ).toEqual([["1"], ["4"], ["44"]]);

  await page.getByRole("button", { name: /^NOR/ }).click();

  await expect(paneles).toHaveCount(2);
  await expect(page.getByRole("img", { name: /de NOR/ })).toHaveCount(0);
});

test("el interruptor de combustible mueve los puntos y cambia la conclusión", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/gomas?${URL_COMPLETA}`);
  const interruptor = page.getByRole("switch", { name: "Corregir por combustible" });
  await expect(interruptor).toBeChecked();
  const con = await posiciones(page);

  await interruptor.click();

  await expect(interruptor).not.toBeChecked();
  await expect.poll(() => posiciones(page)).not.toEqual(con);
  await expect(page.getByText("La blanda fue la que más se gastó: 0,040 s por vuelta")).toBeVisible();
  // La elección de combustible no se guarda en la URL ni vuelve a pedir nada.
  await expect(page).toHaveURL(new RegExp(`${URL_COMPLETA}$`));
});

test("en una carrera donde no se puede medir, avisa y abre las limitaciones (Qatar)", async ({ page }) => {
  const base = crearAnalisisGomas();
  await simularApi(page, () => ({
    estado: 200,
    cuerpo: { ...base, resumen: { ...base.resumen, n_stints_validos: 20, n_stints_sin_degradacion: 17 } },
  }));

  await page.goto(`/es/gomas?${URL_COMPLETA}`);

  await expect(page.getByRole("note")).toContainText("En esta carrera no se puede medir cuánto se gastó cada goma");
  await expect(page.getByRole("note")).toContainText("En 17 de 20 stints");
  await expect(page.getByText("El tráfico: ir detrás de otro coche")).toBeVisible();
});

test("las limitaciones empiezan cerradas y se abren con el teclado", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/gomas?${URL_COMPLETA}`);
  const resumen = page.getByText("Qué no mide este análisis");
  await expect(page.getByText("El tráfico: ir detrás de otro coche")).toBeHidden();

  await resumen.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText("El tráfico: ir detrás de otro coche")).toBeVisible();
});

test("en inglés todo está traducido y los números usan punto decimal", async ({ page }) => {
  await simularApi(page);

  await page.goto(`/en/gomas?${URL_COMPLETA}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("How much did a driver's tyre strategy cost?");
  await expect(page.getByText("The soft wore out the most: 0.100 s per lap")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Correct for fuel" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^VER/ })).toHaveAccessibleName(
    "VER, position 1. Soft, 20 laps; Hard, 30 laps",
  );
});

test("cambiar de idioma conserva la elección de pilotos", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/gomas?${URL_COMPLETA}&pilotos=1%2C44`);
  await expect(page.getByRole("button", { name: /^HAM/ })).toBeVisible();

  await page.getByRole("link", { name: "English" }).click();

  await expect(page).toHaveURL(/\/en\/gomas\?.*pilotos=1%2C44$/);
});

test("desde el inicio la segunda pregunta lleva a gomas con la sesión elegida", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es?${URL_COMPLETA}`);

  await page.getByRole("link", { name: /¿Cuánto le costó a un piloto/ }).click();

  await expect(page).toHaveURL(new RegExp(`/es/gomas\\?${URL_COMPLETA}$`));
  await expect(page.getByRole("heading", { name: "Estrategia de todos los pilotos" })).toBeVisible();
});

test.describe("errores de la API", () => {
  for (const [ruta, codigo, estado, texto] of [
    ["/es", "analisis_no_disponible", 422, "no está disponible para esa sesión"],
    ["/es", "openf1_en_vivo", 503, "Hay una sesión de F1 en vivo y OpenF1 bloquea las consultas"],
    ["/en", "limite_peticiones", 429, "There are too many requests to OpenF1 right now"],
  ] as const) {
    test(`${ruta} · ${codigo} se explica en el idioma de la página`, async ({ page }) => {
      await simularApi(page, () => ({ estado, cuerpo: { codigo } }));

      await page.goto(`${ruta}/gomas?${URL_COMPLETA}`);

      await expect(page.getByRole("main").getByRole("alert")).toContainText(texto);
    });
  }
});

test("con 'reducir movimiento' las barras y los puntos aparecen sin animación", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await simularApi(page);

  await page.goto(`/es/gomas?${URL_COMPLETA}`);

  const barra = page.getByTestId("barra-stint").last();
  await expect(barra).toHaveCSS("animation-name", "none");
  const punto = page.locator(".punto-goma").last();
  await expect(punto).toHaveCSS("animation-name", "none");
  await expect(punto).toHaveCSS("transition-property", "none");
});

test("sin 'reducir movimiento' las barras crecen y los puntos se mueven con transición", async ({ page }) => {
  await simularApi(page);

  await page.goto(`/es/gomas?${URL_COMPLETA}`);

  await expect(page.getByTestId("barra-stint").first()).toHaveCSS("animation-name", "crecer-barra");
  await expect(page.locator(".punto-goma").first()).toHaveCSS("transition-property", "transform");
});

test("en el móvil la página no se desborda y la gráfica y las tablas se desplazan", async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: "es-ES" });
  const page = await contexto.newPage();
  await simularApi(page);

  await page.goto(`/es/gomas?${URL_COMPLETA}`);
  await expect(page.getByText("La blanda fue la que más se gastó")).toBeVisible();

  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desborde).toBeLessThanOrEqual(0);
  for (const nombre of [/Gráfica con desplazamiento/, /Tabla de degradación por stint/]) {
    const region = page.getByRole("region", { name: nombre });
    expect(await region.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  }
  await contexto.close();
});

test("descargar la estrategia baja un PNG con contenido", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/gomas?${URL_COMPLETA}`);
  await expect(page.getByRole("list", { name: "Estrategias de gomas por piloto" })).toBeVisible();

  const png = await descargarYRevisar(page, "Descargar PNG de la estrategia de la carrera");

  expect(png.nombre).toBe("f1analytics-estrategia-9539.png");
  expect(png.ancho).toBeGreaterThan(1500);
  expect(png.colores).toBeGreaterThan(5);
});

test("descargar la dispersión baja un PNG con contenido y el nombre dice los pilotos y si está corregida", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/gomas?${URL_COMPLETA}`);
  await expect(page.getByRole("img", { name: /Tiempos de vuelta limpios de/ })).toHaveCount(3);

  const corregida = await descargarYRevisar(page, "Descargar PNG de la dispersión de la goma");
  expect(corregida.nombre).toBe("f1analytics-dispersion-9539-ver-nor-ham-corregido.png");
  expect(corregida.colores).toBeGreaterThan(5);

  await page.getByRole("switch").click();
  const sinCorregir = await descargarYRevisar(page, "Descargar PNG de la dispersión de la goma");
  expect(sinCorregir.nombre).toBe("f1analytics-dispersion-9539-ver-nor-ham-sin-corregir.png");
});
