import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test.describe("Configurateur 3D", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, { session: adminSession, data: makeTestData() });
  });

  test("charge la page configurateur depuis la sidebar", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("nav-tshirt3d").click();
    await expect(page).toHaveURL(/\/t-shirt-3d/);
    await expect(page.locator(".tshirt3d-layout")).toBeVisible({ timeout: 15000 });
  });

  test("affiche le sélecteur de produit T-shirt/Polo", async ({ page }) => {
    await page.goto("/t-shirt-3d");
    await page.locator(".tshirt3d-product-buttons").waitFor({ state: "visible", timeout: 15000 });
    await expect(page.locator(".tshirt3d-product-btn").filter({ hasText: "T-shirt" })).toBeVisible();
    await expect(page.locator(".tshirt3d-product-btn").filter({ hasText: "Polo" })).toBeVisible();
  });

  test("change de produit T-shirt → Polo", async ({ page }) => {
    await page.goto("/t-shirt-3d");
    await page.locator(".tshirt3d-product-buttons").waitFor({ state: "visible", timeout: 10000 });
    // T-shirt actif par défaut
    await expect(page.locator(".tshirt3d-product-btn.active")).toContainText("T-shirt");
    // Switch vers Polo
    await page.getByRole("button", { name: "Polo" }).click();
    await expect(page.locator(".tshirt3d-product-btn.active")).toContainText("Polo");
  });

  test("sélecteur de zone (Avant / Dos / Manche)", async ({ page }) => {
    await page.goto("/t-shirt-3d");
    await page.locator(".tshirt3d-form-grid").waitFor({ state: "visible", timeout: 10000 });
    // Le select de zone doit contenir Avant, Dos, Manche gauche, Manche droite
    const zoneSelect = page.locator("select").filter({ hasText: "Avant" });
    await expect(zoneSelect).toBeVisible();
  });

  test("sélecteur de couleur textile visible", async ({ page }) => {
    await page.goto("/t-shirt-3d");
    await page.locator(".tshirt3d-form-grid").waitFor({ state: "visible", timeout: 10000 });
    await expect(page.locator("input[type='color']")).toBeVisible();
  });

  test("éditeur 2D (zone pointillée) visible", async ({ page }) => {
    await page.goto("/t-shirt-3d");
    await expect(page.locator(".tshirt3d-zone-editor")).toBeVisible({ timeout: 10000 });
  });

  test("sauvegarde projet client", async ({ page }) => {
    await page.goto("/t-shirt-3d");
    await page.locator(".tshirt3d-project-controls input[placeholder*='client']").waitFor({ timeout: 10000 });
    await page.locator(".tshirt3d-project-controls input[placeholder*='client']").fill("Test E2E");
    await page.getByRole("button", { name: "Sauvegarder" }).first().click();
    await expect(page.locator(".tshirt3d-project-list")).toBeVisible({ timeout: 3000 });
    await expect(page.locator(".tshirt3d-project-row")).toContainText("Test E2E");
  });
});
