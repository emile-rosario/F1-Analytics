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

const sesion = (id: number, nombre: string, terminada: boolean) => ({
  sesion: id,
  nombre,
  tipo: nombre,
  inicio: "2024-08-31T14:00:00Z",
  fin: "2024-08-31T15:00:00Z",
  evento: 1244,
  anio: 2024,
  terminada,
});

const PILOTOS = [
  { numero: 1, codigo: "VER", nombre: "Max VERSTAPPEN", equipo: "Red Bull Racing", color: "#3671C6" },
  { numero: 16, codigo: "LEC", nombre: "Charles LECLERC", equipo: "Ferrari", color: "#E80020" },
];

/** Simula la API: lo que no se indica responde 404 con un código. */
async function simularApi(page: Page, calendario: () => { estado: number; cuerpo: unknown }) {
  await page.route("**/api/salud", (ruta) =>
    ruta.fulfill({ json: { estado: "ok", version: "abc1234" }, headers: CORS }),
  );
  await page.route("**/api/calendario/*", (ruta) => {
    const { estado, cuerpo } = calendario();
    return ruta.fulfill({ status: estado, json: cuerpo, headers: CORS });
  });
  await page.route("**/api/sesiones/2024/1244", (ruta) =>
    ruta.fulfill({
      json: [sesion(9586, "Qualifying", true), sesion(9590, "Race", false)],
      headers: CORS,
    }),
  );
  await page.route("**/api/sesiones/9586/pilotos", (ruta) =>
    ruta.fulfill({ json: PILOTOS, headers: CORS }),
  );
}

test("elige año, Gran Premio y sesión, y se ven los pilotos con la elección en la URL", async ({
  page,
}) => {
  await simularApi(page, () => ({ estado: 200, cuerpo: [EVENTO] }));
  await page.goto("/es");

  await page.getByLabel("Año", { exact: true }).selectOption("2024");
  await expect(page).toHaveURL(/\?anio=2024$/);
  await page.getByLabel("Gran Premio").selectOption("1244");
  await expect(page).toHaveURL(/\?anio=2024&evento=1244$/);
  await expect(page.locator("option", { hasText: "Carrera (sin terminar)" })).toBeDisabled();
  await page.getByLabel("Sesión").selectOption("9586");

  await expect(
    page.getByRole("heading", { name: "Italian Grand Prix · Clasificación" }),
  ).toBeVisible();
  await expect(page.getByText("VER")).toBeVisible();
  await expect(page.getByText("Ferrari")).toBeVisible();
  await expect(page).toHaveURL(/\?anio=2024&evento=1244&sesion=9586$/);
});

test("un enlace con la elección en la URL abre la sesión directamente", async ({ page }) => {
  await simularApi(page, () => ({ estado: 200, cuerpo: [EVENTO] }));

  await page.goto("/es?anio=2024&evento=1244&sesion=9586");

  await expect(page.getByText("VER")).toBeVisible();
  await expect(page.getByLabel("Gran Premio")).toHaveValue("1244");
});

test("la elección se conserva al cambiar de idioma y los nombres se traducen", async ({ page }) => {
  await simularApi(page, () => ({ estado: 200, cuerpo: [EVENTO] }));
  await page.goto("/es?anio=2024&evento=1244&sesion=9586");
  await expect(page.getByText("VER")).toBeVisible();

  await page.getByRole("link", { name: "English" }).click();

  await expect(page).toHaveURL(/\/en\?anio=2024&evento=1244&sesion=9586$/);
  await expect(page.getByRole("heading", { name: "Italian Grand Prix · Qualifying" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Drivers (2)" })).toBeVisible();
});

test.describe("sesión de F1 en vivo", () => {
  for (const [ruta, texto] of [
    ["/es", "Hay una sesión de F1 en vivo y OpenF1 bloquea las consultas"],
    ["/en", "A live F1 session is in progress and OpenF1 blocks queries"],
  ]) {
    test(`${ruta} explica el bloqueo de OpenF1`, async ({ page }) => {
      await simularApi(page, () => ({ estado: 503, cuerpo: { codigo: "openf1_en_vivo" } }));

      await page.goto(ruta);

      await expect(page.getByRole("main").getByRole("alert")).toContainText(texto);
    });
  }

  test("al reintentar, cuando la sesión ya terminó, carga el calendario", async ({ page }) => {
    let enVivo = true;
    await simularApi(page, () =>
      enVivo
        ? { estado: 503, cuerpo: { codigo: "openf1_en_vivo" } }
        : { estado: 200, cuerpo: [EVENTO] },
    );
    await page.goto("/es?anio=2024");
    await expect(page.getByRole("main").getByRole("alert")).toBeVisible();

    enVivo = false;
    await page.getByRole("button", { name: "Reintentar" }).click();

    await expect(page.getByRole("option", { name: "Italian Grand Prix" })).toBeAttached();
  });
});
