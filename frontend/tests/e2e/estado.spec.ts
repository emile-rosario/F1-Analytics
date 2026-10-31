import { expect, test } from "@playwright/test";

test.use({ locale: "es-ES" });

test("/estado muestra la versión de la API cuando responde", async ({ page }) => {
  await page.route("**/api/salud", (ruta) =>
    ruta.fulfill({
      json: { estado: "ok", version: "abc1234def" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );

  await page.goto("/es/estado");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Estado del servicio");
  await expect(page.getByText("Responde")).toBeVisible();
  await expect(page.getByText("abc1234", { exact: true })).toBeVisible();
});

test("/estado avisa en inglés cuando la API no responde y permite reintentar", async ({ page }) => {
  await page.route("**/api/salud", (ruta) => ruta.abort());

  await page.goto("/en/estado");

  // Next.js agrega su propio role="alert" fuera de <main> (el anunciador de rutas).
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "The API is not responding.",
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
});

test("el pie de la home lleva a /estado", async ({ page }) => {
  await page.route("**/api/salud", (ruta) =>
    ruta.fulfill({
      json: { estado: "ok", version: "abc1234" },
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/es");

  await page.getByRole("link", { name: "Estado del servicio" }).click();

  await expect(page).toHaveURL(/\/es\/estado$/);
});
