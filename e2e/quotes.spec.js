import { test, expect } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test.describe("Devis — brouillon", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData(),
    });
  });

  test("crée un devis brouillon depuis la page Devis", async ({ page }) => {
    await page.goto("/devis");
    await expect(page.getByTestId("quotes-page")).toBeVisible();

    await page.getByPlaceholder("Produit / prestation").fill("Prestation E2E laser");
    await page.getByTestId("quote-submit").click();

    await expect(page.locator("span.badge.brouillon").first()).toBeVisible();
    await expect(page.locator("strong.documents-number").first()).toContainText("DEV");
    await expect(page.getByText("1 document")).toBeVisible();
  });

  test("navigue vers Devis depuis la barre latérale", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByTestId("nav-quotes").click();
    await expect(page).toHaveURL(/\/devis$/);
    await expect(page.getByTestId("quote-form")).toBeVisible();
  });
});
