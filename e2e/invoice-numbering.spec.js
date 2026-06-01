import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test.describe("Numérotation manuelle des factures", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData({
        invoices: [
          {
            id: "inv-1",
            number: "FAC-2026-0001",
            date: "01/05/2026",
            clientId: "client-1",
            status: "Non payée",
            lines: [{ description: "Test", quantity: 1, price: 100, totalHT: 100 }],
            totalHT: 100, taxAmount: 17, totalTTC: 117, taxRate: 17,
          },
          {
            id: "inv-3",
            number: "FAC-2026-0003",
            date: "03/05/2026",
            clientId: "client-1",
            status: "Non payée",
            lines: [{ description: "Test", quantity: 1, price: 100, totalHT: 100 }],
            totalHT: 100, taxAmount: 17, totalTTC: 117, taxRate: 17,
          },
        ],
      }),
    });
  });

  test("affiche le bandeau trous détectés avec bouton Utiliser", async ({ page }) => {
    await page.goto("/factures");
    await expect(page.getByTestId("invoices-page")).toBeVisible();
    await expect(page.getByText("trous détectés")).toBeVisible();
    await expect(page.getByRole("button", { name: /Utiliser FAC-2026-0002/ })).toBeVisible();
  });

  test("le bouton Utiliser pré-remplit le champ N° facture", async ({ page }) => {
    await page.goto("/factures");
    await page.getByRole("button", { name: /Utiliser FAC-2026-0002/ }).click();
    const numberInput = page.locator('input[placeholder*="FAC-"]').first();
    await expect(numberInput).toHaveValue("FAC-2026-0002");
  });

  test("le numéro auto affiché en placeholder est le prochain disponible", async ({ page }) => {
    await page.goto("/factures");
    const numberInput = page.locator('input[placeholder*="FAC-2026-0004"]').first();
    await expect(numberInput).toBeVisible();
  });
});

test.describe("Numérotation manuelle des devis", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData({
        quotes: [
          {
            id: "q-1",
            number: "DEV-2026-0001",
            date: "01/05/2026",
            clientId: "client-1",
            status: "Brouillon",
            lines: [{ description: "Test", quantity: 1, price: 50, totalHT: 50 }],
            totalHT: 50, taxAmount: 8.5, totalTTC: 58.5, taxRate: 17,
          },
          {
            id: "q-3",
            number: "DEV-2026-0003",
            date: "03/05/2026",
            clientId: "client-1",
            status: "Brouillon",
            lines: [{ description: "Test", quantity: 1, price: 50, totalHT: 50 }],
            totalHT: 50, taxAmount: 8.5, totalTTC: 58.5, taxRate: 17,
          },
        ],
      }),
    });
  });

  test("affiche le bandeau trous détectés pour les devis", async ({ page }) => {
    await page.goto("/devis");
    await expect(page.getByTestId("quotes-page")).toBeVisible();
    await expect(page.getByText("trous détectés")).toBeVisible();
    await expect(page.getByRole("button", { name: /Utiliser DEV-2026-0002/ })).toBeVisible();
  });
});
