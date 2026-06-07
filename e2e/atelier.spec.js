import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test.describe("Atelier — changement de statut", () => {
  test("met à jour le statut d'un devis accepté", async ({ page }) => {
    const data = makeTestData({
      quotes: [
        {
          id: "quote-atelier-1",
          number: "DEV-E2E-001",
          status: "Accepté",
          clientId: "client-1",
          date: "2026-05-23",
          description: "Gravure laser test",
          lines: [
            {
              description: "Gravure laser test",
              quantity: 1,
              price: 50,
              discount: 0,
              totalHT: 50,
            },
          ],
          totalHT: 50,
          totalTVA: 8.5,
          totalTTC: 58.5,
          taxRate: 17,
          globalDiscount: 0,
        },
      ],
    });

    await seedCrm(page, { session: adminSession, data });
    await page.goto("/atelier");

    await expect(page.getByTestId("atelier-page")).toBeVisible();
    await expect(page.getByText("DEV-E2E-001")).toBeVisible();

    const statusSelect = page.getByTestId("atelier-status-quote-atelier-1");
    await statusSelect.selectOption("En production");

    await expect(statusSelect).toHaveValue("En production");
    await expect(page.getByText("En production").first()).toBeVisible();
  });

  test("supprime une commande de l'atelier", async ({ page }) => {
    const data = makeTestData({
      quotes: [
        {
          id: "quote-atelier-delete",
          number: "DEV-E2E-DEL",
          status: "Accepté",
          clientId: "client-1",
          date: "2026-05-23",
          description: "Gravure laser test",
          lines: [
            {
              description: "Gravure laser test",
              quantity: 1,
              price: 50,
              discount: 0,
              totalHT: 50,
            },
          ],
          totalHT: 50,
          totalTVA: 8.5,
          totalTTC: 58.5,
          taxRate: 17,
          globalDiscount: 0,
        },
      ],
    });

    await seedCrm(page, { session: adminSession, data });
    await page.goto("/atelier");

    await expect(page.getByText("DEV-E2E-DEL")).toBeVisible();
    await page.getByTestId("atelier-delete-quote-atelier-delete").click();
    await page
      .getByRole("alertdialog", { name: "Supprimer la commande atelier" })
      .getByRole("button", { name: "Supprimer" })
      .click();
    await expect(page.getByText("DEV-E2E-DEL")).not.toBeVisible();
    await expect(page.getByText("Aucune commande en file")).toBeVisible();
  });
});
