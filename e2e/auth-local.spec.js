import { test, expect } from "@playwright/test";
import {
  adminSession,
  makeTestData,
  seedCrm,
  SESSION_KEY,
} from "./helpers.js";

test.describe("Mode local — authentification", () => {
  test("affiche la page de connexion sans session", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByTestId("auth-page")).toBeVisible();
    await expect(page.getByTestId("auth-email")).toBeVisible();
    await expect(page.getByTestId("auth-submit")).toContainText("Se connecter");
  });

  test("charge le tableau de bord avec une session locale valide", async ({ page }) => {
    await seedCrm(page, {
      session: adminSession,
      data: makeTestData(),
    });

    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    await expect(page.getByText("Mode local")).toBeVisible();
  });

  test("affiche un message si la session a expiré", async ({ page }) => {
    await page.addInitScript(({ SESSION_KEY }) => {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          id: "expired-user",
          email: "expired@test.com",
          name: "Expiré",
          role: "Admin",
          expiresAt: Date.now() - 1000,
          lastActivityAt: Date.now() - 2000,
        })
      );
    }, { SESSION_KEY });

    await page.goto("/dashboard");
    await expect(page.getByTestId("auth-page")).toBeVisible();
    await expect(page.getByTestId("auth-error")).toContainText(
      "Votre session a expiré"
    );
  });
});
