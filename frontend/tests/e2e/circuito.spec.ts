import { expect, test, type Page } from "@playwright/test";

test.use({ locale: "es-ES" });

const CORS = { "access-control-allow-origin": "*" };

const EVENTO = {
  evento: 1244,
  nombre: "Italian Grand Prix",
  nombre_oficial: "FORMULA 1 PIRELLI GRAN PREMIO D ITALIA 2024",
  pais: "Italy",
  circuito: "Monza",
  circuito_clave: 39,
  inicio: "2024-08-30T11:30:00Z",
};

const SESION = {
  sesion: 9586,
  nombre: "Qualifying",
  tipo: "Qualifying",
  inicio: "2024-08-31T14:00:00Z",
  fin: "2024-08-31T15:00:00Z",
  evento: 1244,
  anio: 2024,
  terminada: true,
};

const PILOTOS = [
  { numero: 1, codigo: "VER", nombre: "Max VERSTAPPEN", equipo: "Red Bull Racing", color: "#3671C6" },
  { numero: 4, codigo: "NOR", nombre: "Lando NORRIS", equipo: "McLaren", color: "#FF8000" },
];

const ANALISIS = {
  sesion: 9586,
  piloto: PILOTOS[1],
  vuelta: 11,
  tiempo_vuelta_s: 79.327,
  longitud_m: 5764.7,
  puntos: [
    [0, 0, 300, 8],
    [2000, 0, 320, 8],
    [4000, 0, 150, 3],
    [4000, 1500, 90, 2],
    [2000, 1500, 200, 5],
    [0, 400, 280, 7],
  ].map(([x, y, velocidad, marcha], i) => ({ x, y, velocidad, marcha, distancia_m: i * 100 })),
  curvas: [
    { numero: 1, letra: "", etiqueta: "1", x: 4000, y: 0 },
    { numero: 2, letra: "", etiqueta: "2", x: 4000, y: 1500 },
  ],
  frenadas: [
    {
      curva: 1,
      letra: "",
      inicio_m: 120,
      fin_m: 235.5,
      longitud_m: 115.5,
      vel_entrada: 319,
      vel_salida: 94,
      x_inicio: 3000,
      y_inicio: 0,
    },
  ],
  resumen: {
    pct_a_fondo: 83.1,
    vel_maxima: { kmh: 347, distancia_m: 652.7 },
    vel_minima: { kmh: 73, distancia_m: 935.3 },
    frenada_mas_fuerte: { curva: 1, letra: "", vel_entrada: 319, vel_salida: 94 },
  },
};

type Respuesta = { estado: number; cuerpo: unknown };

/** Simula la API completa; el análisis lo decide cada prueba. */
async function simularApi(page: Page, analisis: () => Respuesta = () => ({ estado: 200, cuerpo: ANALISIS })) {
  const responder = (cuerpo: unknown, estado = 200) => ({
    status: estado,
    json: cuerpo,
    headers: CORS,
  });
  await page.route("**/api/salud", (r) => r.fulfill(responder({ estado: "ok", version: "abc1234" })));
  await page.route("**/api/calendario/*", (r) => r.fulfill(responder([EVENTO])));
  await page.route("**/api/sesiones/2024/1244", (r) => r.fulfill(responder([SESION])));
  await page.route("**/api/sesiones/9586/pilotos", (r) => r.fulfill(responder(PILOTOS)));
  await page.route("**/api/analisis/circuito*", (r) => {
    const { estado, cuerpo } = analisis();
    return r.fulfill(responder(cuerpo, estado));
  });
}

test("sin elección abre la sesión destacada y muestra el análisis de la pole", async ({ page }) => {
  await simularApi(page);

  await page.goto("/es/circuito");

  await expect(page).toHaveURL(/\/es\/circuito\?anio=2024&evento=1244&sesion=9586&piloto=4$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "¿Qué tan rápido va un F1 en cada parte del circuito?",
  );
  await expect(page.getByText("1:19,327")).toBeVisible();
  await expect(page.getByText("McLaren")).toBeVisible();
  await expect(
    page.getByText("La frenada más fuerte es la de la curva 1: de 319 a 94 km/h"),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("319");
  await expect(page.getByLabel("Piloto")).toHaveValue("4");
});

test("las pestañas cambian el mapa de velocidad a marchas", async ({ page }) => {
  await simularApi(page);
  await page.goto("/es/circuito?anio=2024&evento=1244&sesion=9586&piloto=4");
  await expect(page.getByRole("img", { name: /coloreada por velocidad/ })).toBeVisible();

  await page.getByRole("tab", { name: "Marchas" }).click();

  await expect(page.getByRole("img", { name: /coloreada por marcha/ })).toBeVisible();
  await expect(page.getByRole("list", { name: "Marchas usadas" })).toContainText("Marcha 8");
});

test("en inglés todo está traducido y el tiempo usa punto decimal", async ({ page }) => {
  await simularApi(page);

  await page.goto("/en/circuito?anio=2024&evento=1244&sesion=9586&piloto=4");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "How fast does an F1 car go in each part of the circuit?",
  );
  await expect(page.getByText("1:19.327")).toBeVisible();
  await expect(page.getByText("The hardest braking is at turn 1: from 319 to 94 km/h")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Entry (km/h)" })).toBeVisible();
  await page.getByRole("tab", { name: "Gears" }).click();
  await expect(page.getByRole("list", { name: "Gears used" })).toContainText("Gear 8");
});

test("cambiar de idioma conserva la elección", async ({ page }) => {
  await simularApi(page);
  await page.goto("/es/circuito?anio=2024&evento=1244&sesion=9586&piloto=4");
  await expect(page.getByText("1:19,327")).toBeVisible();

  await page.getByRole("link", { name: "English" }).click();

  await expect(page).toHaveURL(/\/en\/circuito\?anio=2024&evento=1244&sesion=9586&piloto=4$/);
  await expect(page.getByText("1:19.327")).toBeVisible();
});

test("elegir otro piloto pide su análisis", async ({ page }) => {
  const pedidos: string[] = [];
  await simularApi(page);
  await page.route("**/api/analisis/circuito*", (r) => {
    pedidos.push(new URL(r.request().url()).search);
    return r.fulfill({ json: ANALISIS, headers: CORS });
  });
  await page.goto("/es/circuito?anio=2024&evento=1244&sesion=9586&piloto=4");
  await expect(page.getByText("1:19,327")).toBeVisible();

  await page.getByLabel("Piloto").selectOption("1");

  await expect(page).toHaveURL(/piloto=1$/);
  await expect.poll(() => pedidos).toContain("?sesion=9586&piloto=1");
});

test("desde el inicio la primera pregunta lleva al circuito con la sesión elegida", async ({
  page,
}) => {
  await simularApi(page);
  await page.goto("/es?anio=2024&evento=1244&sesion=9586");

  await page.getByRole("link", { name: /¿Qué tan rápido va un F1/ }).click();

  await expect(page).toHaveURL(/\/es\/circuito\?anio=2024&evento=1244&sesion=9586$/);
  await expect(page.getByLabel("Piloto")).toBeVisible();
});

test.describe("errores de la API", () => {
  for (const [ruta, codigo, estado, texto] of [
    ["/es", "openf1_en_vivo", 503, "Hay una sesión de F1 en vivo y OpenF1 bloquea las consultas"],
    ["/en", "openf1_en_vivo", 503, "A live F1 session is in progress and OpenF1 blocks queries"],
    ["/es", "limite_peticiones", 429, "Hay demasiadas consultas"],
    ["/es", "analisis_no_disponible", 422, "no está disponible para esa sesión"],
  ] as const) {
    test(`${ruta} · ${codigo} se explica en el idioma de la página`, async ({ page }) => {
      await simularApi(page, () => ({ estado, cuerpo: { codigo } }));

      await page.goto(`${ruta}/circuito?anio=2024&evento=1244&sesion=9586&piloto=4`);

      await expect(page.getByRole("main").getByRole("alert")).toContainText(texto);
    });
  }
});

test("con 'reducir movimiento' el mapa aparece completo sin animación", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await simularApi(page);

  await page.goto("/es/circuito?anio=2024&evento=1244&sesion=9586&piloto=4");

  const ultimo = page.locator("line.tramo").last();
  await expect(ultimo).toBeAttached();
  await expect(ultimo).toHaveCSS("opacity", "1");
  await expect(ultimo).toHaveCSS("animation-name", "none");
});

test("en el móvil la página no se desborda y la tabla tiene su propio scroll", async ({
  browser,
}) => {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 800 }, locale: "es-ES" });
  const page = await contexto.newPage();
  await simularApi(page);

  await page.goto("/es/circuito?anio=2024&evento=1244&sesion=9586&piloto=4");
  await expect(page.getByText("1:19,327")).toBeVisible();

  const desborde = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(desborde).toBeLessThanOrEqual(0);
  const region = page.getByRole("region", { name: /Tabla de frenadas/ });
  expect(await region.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  await contexto.close();
});

test("un circuito nuevo, sin curvas numeradas, se explica y mantiene el mapa y el resumen", async ({
  page,
}) => {
  await simularApi(page, () => ({
    estado: 200,
    cuerpo: {
      ...ANALISIS,
      curvas: [],
      frenadas: [],
      resumen: { ...ANALISIS.resumen, frenada_mas_fuerte: null },
    },
  }));

  await page.goto("/es/circuito?anio=2024&evento=1244&sesion=9586&piloto=4");

  await expect(page.getByTestId("aviso-circuito-nuevo")).toContainText(
    "Este circuito es nuevo y todavía no tenemos sus curvas numeradas",
  );
  await expect(page.getByRole("img", { name: /coloreada por velocidad/ })).toBeVisible();
  await expect(page.getByText(/sin sus curvas numeradas no se pueden medir las frenadas/)).toBeVisible();
  await expect(page.getByText(/NOR fue a fondo el/)).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Frenadas" })).toHaveCount(0);
  // El aviso describe el mapa, así que va encima de él.
  const aviso = await page.getByTestId("aviso-circuito-nuevo").boundingBox();
  const mapa = await page.getByRole("img", { name: /coloreada por velocidad/ }).boundingBox();
  expect(aviso!.y).toBeLessThan(mapa!.y);
});
