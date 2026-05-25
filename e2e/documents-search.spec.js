import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test.describe("Documents — recherche", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData({
        quotes: [
          {
            id: "quote-search-1",
            number: "DEV-SEARCH-1",
            date: "01/05/2026",
            clientId: "client-1",
            status: "Brouillon",
            lines: [
              {
                description: "Gravure laser test",
                quantity: 1,
                price: 50,
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

  test("filtre la liste des devis par recherche", async ({ page }) => {
    await page.goto("/devis");
    await expect(page.getByTestId("quotes-page")).toBeVisible();

    await page.getByPlaceholder("Rechercher…").fill("DEV-SEARCH");
    await expect(page.locator("strong.documents-number").first()).toContainText("DEV-SEARCH-1");

    await page.getByPlaceholder("Rechercher…").fill("introuvable-xyz");
    await expect(page.getByText("Aucun résultat")).toBeVisible();
  });
});
