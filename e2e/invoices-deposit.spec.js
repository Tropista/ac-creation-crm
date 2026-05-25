import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test.describe("Factures — acompte", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData({
        quotes: [
          {
            id: "quote-deposit-1",
            number: "DEV-ACOMPTE-1",
            date: "01/05/2026",
            clientId: "client-1",
            status: "Accepté",
            depositPercent: 30,
            depositAmount: 30,
            balanceAfterDeposit: 70,
            lines: [
              {
                description: "Commande textile",
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

  test("crée une facture d'acompte depuis un devis accepté", async ({ page }) => {
    await page.goto("/devis");
    await expect(page.getByText("DEV-ACOMPTE-1")).toBeVisible();

    await page
      .locator("tr")
      .filter({ hasText: "DEV-ACOMPTE-1" })
      .getByTitle("Créer une facture d'acompte de 30%")
      .click();
    await expect(page.getByText(/Facture d'acompte FAC-/)).toBeVisible();
  });
});
