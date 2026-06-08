import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

async function openSearch(page) {
  await page.locator("body").click();
  await page.keyboard.press("Control+k");
  await page.getByPlaceholder(/Rechercher un client/).waitFor({ state: "visible", timeout: 5000 });
}

test.describe("Recherche globale (Ctrl+K)", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData({
        invoices: [
          {
            id: "inv-search-1",
            number: "FAC-SEARCH-1",
            date: "01/05/2026",
            clientId: "client-1",
            status: "Non payée",
            lines: [{ description: "Test recherche", quantity: 1, price: 100, totalHT: 100 }],
            totalHT: 100, taxAmount: 17, totalTTC: 117, taxRate: 17,
          },
        ],
      }),
    });
  });

  test("s'ouvre avec Ctrl+K", async ({ page }) => {
    await page.goto("/dashboard");
    await openSearch(page);
    await expect(page.getByPlaceholder(/Rechercher un client/)).toBeVisible();
  });

  test("se ferme avec Échap", async ({ page }) => {
    await page.goto("/dashboard");
    await openSearch(page);
    // Échap géré au niveau document — fonctionne sans focus sur l'input
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder(/Rechercher un client/)).not.toBeAttached({ timeout: 5000 });
  });

  test("filtre les résultats en temps réel", async ({ page }) => {
    await page.goto("/dashboard");
    await openSearch(page);
    await page.getByPlaceholder(/Rechercher un client/).fill("FAC-SEARCH");
    await expect(page.getByText("FAC-SEARCH-1").first()).toBeVisible({ timeout: 5000 });
  });

  test("navigue vers la facture au clic", async ({ page }) => {
    await page.goto("/dashboard");
    await openSearch(page);
    await page.getByPlaceholder(/Rechercher un client/).fill("FAC-SEARCH");
    const results = page.getByTestId("global-search-results");
    await expect(results.getByText("FAC-SEARCH-1").first()).toBeVisible({ timeout: 5000 });
    await results.getByRole("button", { name: /FAC-SEARCH-1/ }).first().click();
    await page.waitForURL(/\/factures/, { timeout: 5000 });
  });

  test("affiche le client dans les résultats", async ({ page }) => {
    await page.goto("/dashboard");
    await openSearch(page);
    await page.getByPlaceholder(/Rechercher un client/).fill("Client E2E");
    await expect(page.getByText("Client E2E").first()).toBeVisible({ timeout: 5000 });
  });
});
