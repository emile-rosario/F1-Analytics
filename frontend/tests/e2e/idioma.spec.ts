import { expect, test } from "@playwright/test";

test.describe("navegador en español", () => {
  test.use({ locale: "es-ES" });

  test("la raíz abre en español", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/es$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cada vuelta, metro a metro.");
  });
});

test.describe("navegador en inglés", () => {
  test.use({ locale: "en-US" });

  test("la raíz abre en inglés", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every lap, meter by meter.");
  });
});

test("el selector cambia de idioma", async ({ page }) => {
  await page.goto("/es");

  await page.getByRole("link", { name: "English" }).click();

  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Every lap, meter by meter.");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
