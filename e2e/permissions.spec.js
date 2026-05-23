import { test, expect } from "@playwright/test";
import {
  comptableData,
  comptableSession,
  seedCrm,
} from "./helpers.js";

test.describe("Permissions — rôle Comptable", () => {
  test.beforeEach(async ({ page }) => {
    await seedCrm(page, {
      session: comptableSession,
      data: comptableData,
    });
  });

  test("n'affiche pas Fournisseurs dans le menu", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("nav-dashboard")).toBeVisible();
    await expect(page.getByTestId("nav-invoices")).toBeVisible();
    await expect(page.getByTestId("nav-suppliers")).toHaveCount(0);
  });

  test("redirige vers le tableau de bord si accès direct à Fournisseurs", async ({ page }) => {
    await page.goto("/fournisseurs");
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
  });
});
