import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test.describe("Factures — navigation sidebar", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData({
        invoices: [
          {
            id: "inv-nav-1",
            number: "FAC-NAV-1",
            date: "01/05/2026",
            clientId: "client-1",
            status: "Non payée",
            lines: [
              {
                description: "Prestation test",
                quantity: 1,
                price: 100,
                totalHT: 100,
                subtotal: 100,
              },
            ],
            subtotal: 100,
            totalHT: 100,
            taxAmount: 17,
            totalTTC: 117,
            taxRate: 17,
          },
        ],
      }),
    });
  });

  test("quitte Factures vers le tableau de bord", async ({ page }) => {
    await page.goto("/factures");
    await expect(page.getByTestId("invoices-page")).toBeVisible();

    await page.getByTestId("nav-dashboard").click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("invoices-page")).toHaveCount(0);
    await expect(page.locator(".document-preview-overlay")).toHaveCount(0);
    await expect(page.locator(".product-picker__list--fixed")).toHaveCount(0);
  });

  test("quitte Factures avec aperçu ouvert", async ({ page }) => {
    await page.goto("/factures");
    await page.getByRole("button", { name: "Voir" }).first().click();
    await expect(page.getByTestId("document-preview-overlay")).toBeVisible();

    await page.getByTestId("nav-clients").click();
    await expect(page).toHaveURL(/\/clients$/);
    await expect(page.locator(".document-preview-overlay")).toHaveCount(0);
  });

  test("quitte Factures avec product picker ouvert", async ({ page }) => {
    await page.goto("/factures");
    await page.getByPlaceholder("Rechercher un produit…").first().click();
    await expect(page.locator(".product-picker__list--fixed")).toBeVisible();

    await page.getByTestId("nav-dashboard").click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator(".product-picker__list--fixed")).toHaveCount(0);
  });
});
