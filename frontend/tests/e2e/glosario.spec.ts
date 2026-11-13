import { expect, test } from "@playwright/test";

import { TERMINOS } from "../../src/lib/glosario";

test.use({ locale: "es-ES" });

test("/glosario muestra todos los términos con su definición y su ejemplo", async ({ page }) => {
  await page.goto("/es/glosario");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Glosario");
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(TERMINOS.length);
  const degradacion = page.locator("#degradacion");
  await expect(degradacion.getByRole("heading", { name: "Degradación" })).toBeVisible();
  // Los números salen del análisis, con coma decimal en español.
  await expect(page.locator("#combustible")).toContainText("0,06 s por vuelta");
  await expect(degradacion).toContainText("Ejemplo:");
});

test("el índice lleva al término", async ({ page }) => {
  await page.goto("/es/glosario");

  await page.getByRole("navigation", { name: "Términos" }).getByRole("link", { name: "Stint" }).click();

  await expect(page).toHaveURL(/\/es\/glosario#stint$/);
  await expect(page.locator("#stint")).toBeInViewport();
});

test("el enlace del pie lleva al glosario y se puede volver", async ({ page }) => {
  await page.goto("/es");

  await page.getByRole("contentinfo").getByRole("link", { name: "Glosario" }).click();

  await expect(page).toHaveURL(/\/es\/glosario$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Glosario");
  await expect(page).toHaveTitle("Glosario · F1 Analytics");
});

test("en inglés todo va en inglés, con punto decimal", async ({ page }) => {
  await page.goto("/en/glosario");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Glossary");
  await expect(page.locator("#combustible")).toContainText("0.06 s per lap");
  await expect(page.locator("#compuesto")).toContainText("S (soft)");
  await expect(page.getByRole("navigation", { name: "Terms" })).toBeVisible();
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "Glossary" })).toBeVisible();
});
