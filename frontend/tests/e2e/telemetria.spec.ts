import { expect, test, type Page } from "@playwright/test";

import { crearAnalisisTelemetria } from "../unit/datos";

test.use({ locale: "es-ES" });

const CORS = { "access-control-allow-origin": "*" };
const URL_COMPLETA = "anio=2024&evento=1229&sesion=9468&piloto_a=1&piloto_b=16&segmento=Q3";

const EVENTO = {
  evento: 1229,
  nombre: "Bahrain Grand Prix",
  nombre_oficial: "FORMULA 1 GULF AIR BAHRAIN GRAND PRIX 2024",
  pais: "Bahrain",
  circuito: "Sakhir",
  circuito_clave: 63,
  inicio: "2024-02-29T11:30:00Z",
};
const sesion = (id: number, nombre: string) => ({
  sesion: id,
  nombre,
  tipo: nombre,
  inicio: "2024-03-01T16:00:00Z",
  fin: "2024-03-01T17:00:00Z",
  evento: 1229,
  anio: 2024,
  terminada: true,
});
const PILOTOS = [
  { numero: 1, codigo: "VER", nombre: "Max VERSTAPPEN", equipo: "Red Bull Racing", color: "#3671C6" },
  { numero: 16, codigo: "LEC", nombre: "Charles LECLERC", equipo: "Ferrari", color: "#E80020" },
  { numero: 55, codigo: "SAI", nombre: "Carlos SAINZ", equipo: "Ferrari", color: "#E80020" },
];

type Respuesta = { estado: number; cuerpo: unknown };

/** Simula la API; el análisis lo decide cada prueba y se anotan las peticiones que llegan. */
async function simularApi(
  page: Page,
  analisis: () => Respuesta = () => ({ estado: 200, cuerpo: crearAnalisisTelemetria() }),
) {
  const pedidos: string[] = [];
  const responder = (cuerpo: unknown, estado = 200) => ({ status: estado, json: cuerpo, headers: CORS });
  await page.route("**/api/salud", (r) => r.fulfill(responder({ estado: "ok", version: "abc1234" })));
  await page.route("**/api/calendario/*", (r) => r.fulfill(responder([EVENTO])));
  await page.route("**/api/sesiones/2024/1229", (r) =>
    r.fulfill(responder([sesion(9468, "Qualifying"), sesion(9472, "Race")])),
  );
  await page.route("**/api/sesiones/*/pilotos", (r) => r.fulfill(responder(PILOTOS)));
  await page.route("**/api/analisis/telemetria*", (r) => {
    pedidos.push(new URL(r.request().url()).search);
    const { estado, cuerpo } = analisis();
    return r.fulfill(responder(cuerpo, estado));
  });
  return pedidos;
}

const cursor = (page: Page) => page.getByRole("slider", { name: "Posición en la vuelta" });
const lectura = (page: Page) => page.getByRole("group", { name: "Valores en la posición elegida" });

test("sin elección abre la sesión destacada y muestra la comparación", async ({ page }) => {
  const pedidos = await simularApi(page);

  await page.goto("/es/telemetria");

  await expect(page).toHaveURL(new RegExp(`/es/telemetria\\?${URL_COMPLETA}$`));
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("¿Dónde le gana tiempo un piloto a otro?");
  await expect(page.getByText("VER fue 0,228 s más rápido que LEC")).toBeVisible();
  await expect(page.getByLabel("Piloto A (referencia)")).toHaveValue("1");
  await expect(page.getByLabel("Piloto B (comparado)")).toHaveValue("16");
  await expect(page.getByLabel("Vuelta", { exact: true })).toHaveValue("Q3");
  expect(pedidos).toEqual(["?sesion=9468&piloto_a=1&piloto_b=16&segmento=Q3"]);
});

test("pasar el mouse por las gráficas mueve el cursor y el punto del mapa", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(lectura(page)).toContainText("A 1000 m de la meta");
  const punto = page.getByTestId("punto-cursor");
  const alFinal = await punto.evaluate((c) => [c.getAttribute("cx"), c.getAttribute("cy")]);
  const zona = page.getByTestId("zona-cursor");
  const caja = await zona.boundingBox();

  // `hover` baja hasta la gráfica (queda bajo el pliegue) y mueve el mouse al centro.
  await zona.hover({ position: { x: caja!.width / 2, y: 30 } });

  await expect(lectura(page)).toContainText(/A (4[7-9]\d|5[0-2]\d) m de la meta/);
  await expect(cursor(page)).toHaveValue("20");
  expect(await punto.evaluate((c) => [c.getAttribute("cx"), c.getAttribute("cy")])).not.toEqual(alFinal);
});

const tooltip = (page: Page) => page.getByTestId("tooltip-telemetria");

test("al pasar el mouse aparece un tooltip junto al puntero y desaparece al salir", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(lectura(page)).toContainText("A 1000 m de la meta");
  await expect(tooltip(page)).toHaveCount(0);
  const zona = page.getByTestId("zona-cursor");

  await zona.hover({ position: { x: 150, y: 30 } });

  await expect(tooltip(page)).toBeVisible();
  await expect(tooltip(page)).toContainText("m de la meta");
  await expect(tooltip(page)).toContainText("VER");
  await expect(tooltip(page)).toContainText("LEC");
  await expect(tooltip(page)).toContainText("Diferencia:");
  // Queda a la derecha y debajo del puntero, sin taparlo.
  const caja = (await zona.boundingBox())!;
  const t = (await tooltip(page).boundingBox())!;
  expect(t.x).toBeGreaterThanOrEqual(caja.x + 150);
  expect(t.y).toBeGreaterThanOrEqual(caja.y + 30);
  expect(t.x - (caja.x + 150)).toBeLessThan(40);

  await page.mouse.move(0, 0);
  await expect(tooltip(page)).toHaveCount(0);
});

test("cerca del borde derecho el tooltip pasa a la izquierda del puntero y no se sale de la gráfica", async ({
  page,
}) => {
  await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(lectura(page)).toContainText("A 1000 m de la meta");
  const zona = page.getByTestId("zona-cursor");
  const caja = (await zona.boundingBox())!;

  await zona.hover({ position: { x: caja.width - 12, y: 30 } });

  await expect(tooltip(page)).toBeVisible();
  const t = (await tooltip(page).boundingBox())!;
  expect(t.x + t.width).toBeLessThanOrEqual(caja.x + caja.width - 12);
  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desborde).toBeLessThanOrEqual(0);
});

test("el tooltip no estorba al teclado: el deslizador sigue anunciando y no hay tooltip", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(lectura(page)).toContainText("A 1000 m de la meta");

  await cursor(page).focus();
  await page.keyboard.press("Home");

  await expect(lectura(page)).toContainText("A 0 m de la meta");
  await expect(tooltip(page)).toHaveCount(0);
});

test("el deslizador se maneja con el teclado y anuncia el punto", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(lectura(page)).toContainText("A 1000 m de la meta");

  await cursor(page).focus();
  await page.keyboard.press("Home");
  await expect(lectura(page)).toContainText("A 0 m de la meta");
  await expect(lectura(page)).toContainText("Diferencia: ninguna");

  await page.keyboard.press("ArrowRight");
  await expect(lectura(page)).toContainText("A 25 m de la meta");
  await expect(cursor(page)).toHaveAttribute("aria-valuetext", /^25 m desde la meta: VER \d+ km\/h, LEC \d+ km\/h/);

  await page.keyboard.press("End");
  await expect(lectura(page)).toContainText("Diferencia: 0,228 s · VER por delante");
});

test("elegir otro segmento pide la comparación de ese segmento", async ({ page }) => {
  const pedidos = await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(page.getByText("VER fue 0,228 s más rápido que LEC")).toBeVisible();

  await page.getByLabel("Vuelta", { exact: true }).selectOption("Q1");

  await expect(page).toHaveURL(/segmento=Q1$/);
  await expect.poll(() => pedidos).toContain("?sesion=9468&piloto_a=1&piloto_b=16&segmento=Q1");

  await page.getByLabel("Vuelta", { exact: true }).selectOption("");

  await expect(page).not.toHaveURL(/segmento/);
  await expect.poll(() => pedidos).toContain("?sesion=9468&piloto_a=1&piloto_b=16");
});

test("cambiar un piloto conserva el segmento y pide la comparación nueva", async ({ page }) => {
  const pedidos = await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(page.getByText("VER fue 0,228 s más rápido que LEC")).toBeVisible();

  await page.getByLabel("Piloto B (comparado)").selectOption("55");

  await expect(page).toHaveURL(/piloto_b=55&segmento=Q3$/);
  await expect.poll(() => pedidos).toContain("?sesion=9468&piloto_a=1&piloto_b=55&segmento=Q3");
});

test("en una carrera no hay selector de segmento", async ({ page }) => {
  await simularApi(page);

  await page.goto("/es/telemetria?anio=2024&evento=1229&sesion=9472&piloto_a=1&piloto_b=16");

  await expect(page.getByLabel("Piloto A (referencia)")).toHaveValue("1");
  await expect(page.getByLabel("Vuelta", { exact: true })).toHaveCount(0);
});

test("con un solo piloto elegido pide el otro y no consulta nada", async ({ page }) => {
  const pedidos = await simularApi(page);

  await page.goto("/es/telemetria?anio=2024&evento=1229&sesion=9468&piloto_a=1");

  await expect(page.getByText("Elige dos pilotos distintos para comparar su vuelta.")).toBeVisible();
  expect(pedidos).toEqual([]);
});

test("el mapa pinta cada tramo del color de su ganador y la leyenda cuenta los tramos", async ({ page }) => {
  await simularApi(page);

  await page.goto(`/es/telemetria?${URL_COMPLETA}`);

  const tramos = page.getByTestId("tramos").locator("polyline");
  await expect(tramos).toHaveCount(25);
  await expect(page.locator('polyline[data-ganador="a"]')).toHaveCount(12);
  await expect(page.locator('polyline[data-ganador="b"]')).toHaveCount(7);
  await expect(page.getByRole("list", { name: "Tramos ganados" }).getByRole("listitem")).toHaveText([
    "VER: 12",
    "LEC: 7",
    "Empate: 6",
  ]);
});

test("las salvedades empiezan cerradas y se abren con el teclado", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  const resumen = page.getByText("Qué no mide este análisis");
  await expect(page.getByText(/Pocas muestras/)).toBeHidden();

  await resumen.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByText(/Pocas muestras/)).toBeVisible();
});

test("en inglés todo está traducido y los números usan punto decimal", async ({ page }) => {
  await simularApi(page);

  await page.goto(`/en/telemetria?${URL_COMPLETA}`);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Where does one driver beat another?");
  await expect(page.getByText("VER was 0.228 s faster than LEC")).toBeVisible();
  await expect(page.getByLabel("Driver A (reference)")).toBeVisible();
  await expect(page.getByRole("slider", { name: "Position in the lap" })).toBeVisible();
});

test("cambiar de idioma conserva la elección", async ({ page }) => {
  await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(page.getByText("VER fue 0,228 s más rápido que LEC")).toBeVisible();

  await page.getByRole("link", { name: "English" }).click();

  await expect(page).toHaveURL(new RegExp(`/en/telemetria\\?.*piloto_a=1.*piloto_b=16.*segmento=Q3`));
});

test("desde el inicio la tercera pregunta lleva a telemetría con la sesión elegida", async ({ page }) => {
  await simularApi(page);
  await page.goto("/es?anio=2024&evento=1229&sesion=9468");

  await page.getByRole("link", { name: /¿Dónde le gana tiempo un piloto a otro/ }).click();

  await expect(page).toHaveURL(/\/es\/telemetria\?anio=2024&evento=1229&sesion=9468$/);
  await expect(page.getByText("Elige dos pilotos distintos para comparar su vuelta.")).toBeVisible();
});

test.describe("errores de la API", () => {
  for (const [ruta, codigo, estado, texto] of [
    ["/es", "sin_telemetria", 404, "No hay telemetría para esa selección."],
    ["/es", "telemetria_incompleta", 422, "La telemetría de esa vuelta está incompleta."],
    ["/es", "openf1_en_vivo", 503, "Hay una sesión de F1 en vivo y OpenF1 bloquea las consultas"],
    ["/en", "limite_peticiones", 429, "There are too many requests to OpenF1 right now"],
  ] as const) {
    test(`${ruta} · ${codigo} se explica en el idioma de la página`, async ({ page }) => {
      await simularApi(page, () => ({ estado, cuerpo: { codigo } }));

      await page.goto(`${ruta}/telemetria?${URL_COMPLETA}`);

      await expect(page.getByRole("main").getByRole("alert")).toContainText(texto);
    });
  }
});

test("en el móvil la página no se desborda, las gráficas se desplazan y el deslizador sigue a mano", async ({
  browser,
}) => {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: "es-ES" });
  const page = await contexto.newPage();
  await simularApi(page);

  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(page.getByText("VER fue 0,228 s más rápido que LEC")).toBeVisible();

  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desborde).toBeLessThanOrEqual(0);
  const region = page.getByRole("region", { name: "Gráficas con desplazamiento horizontal" });
  expect(await region.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  await cursor(page).focus();
  await page.keyboard.press("Home");
  await expect(lectura(page)).toContainText("A 0 m de la meta");
  await expect(tooltip(page)).toHaveCount(0);
  await contexto.close();
});

test("con el tacto, tocar la gráfica mueve el cursor y no abre el tooltip", async ({ browser }) => {
  const contexto = await browser.newContext({
    viewport: { width: 390, height: 800 },
    locale: "es-ES",
    hasTouch: true,
    isMobile: true,
  });
  const page = await contexto.newPage();
  await simularApi(page);
  await page.goto(`/es/telemetria?${URL_COMPLETA}`);
  await expect(lectura(page)).toContainText("A 1000 m de la meta");
  const zona = page.getByTestId("zona-cursor");
  await zona.scrollIntoViewIfNeeded();

  await zona.tap({ position: { x: 100, y: 30 } });

  await expect(lectura(page)).not.toContainText("A 1000 m de la meta");
  await expect(tooltip(page)).toHaveCount(0);
  await contexto.close();
});
