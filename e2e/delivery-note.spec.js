import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test.describe("Atelier — bon de livraison", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData({
        quotes: [
          {
            id: "quote-bl-1",
            number: "DEV-BL-1",
            date: "01/05/2026",
            clientId: "client-1",
            status: "Prêt",
            lines: [
              {
                description: "T-shirt personnalisé",
                quantity: 2,
                price: 25,
                totalHT: 50,
                subtotal: 50,
              },
            ],
            totalHT: 50,
            totalTTC: 58.5,
            taxAmount: 8.5,
            taxRate: 17,
          },
        ],
      }),
    });
  });

  test("génère un bon de livraison depuis l'atelier", async ({ page }) => {
    page.on("dialog", async (dialog) => {
      await dialog.accept("");
    });

    await page.goto("/atelier");
    await expect(page.getByTestId("atelier-page")).toBeVisible();

    await page.getByTestId("atelier-bl-quote-bl-1").click();
    await expect(page.getByRole("heading", { name: "BON DE LIVRAISON" })).toBeVisible();
  });
});
