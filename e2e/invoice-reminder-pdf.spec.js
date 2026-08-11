import path from "node:path";
import { expect, test } from "@playwright/test";
import { adminSession, makeTestData, seedCrm } from "./helpers.js";

test("génère un rappel PDF avec le solde partiel et journalise le PDF", async ({
  page,
}) => {
  await seedCrm(page, {
    session: adminSession,
    data: makeTestData({
      invoices: [
        {
          id: "inv-reminder-1",
          number: "FAC-2026-0020",
          date: "01/06/2026",
          dueDate: "01/07/2026",
          clientId: "client-1",
          status: "Partiellement payée",
          subtotal: 854.7,
          totalHT: 854.7,
          taxRate: 17,
          taxAmount: 145.3,
          totalTTC: 1000,
          paidAmount: 400,
          remaining: 600,
          lines: [
            {
              description: "Création graphique et impression",
              quantity: 1,
              price: 854.7,
              subtotal: 854.7,
              totalHT: 854.7,
            },
          ],
        },
      ],
    }),
  });

  await page.goto("/factures");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Télécharger le rappel PDF" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("RAPPEL-1-FAC-2026-0020.pdf");
  await download.saveAs(path.resolve("tmp/pdfs/RAPPEL-1-FAC-2026-0020.pdf"));

  const preview = page.getByTestId("document-preview-overlay");
  await expect(preview.getByText("RAPPEL DE PAIEMENT")).toBeVisible();
  await expect(preview.getByText("1er rappel")).toBeVisible();
  await expect(
    preview
      .getByLabel("Informations du rappel de paiement")
      .getByText("600,00 €", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const stored = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("crm_local_data_v2")),
      );
      return stored.invoices[0].reminderHistory?.[0]?.type;
    })
    .toBe("PDF");
  await preview
    .locator("#document-preview")
    .screenshot({ path: "tmp/pdfs/reminder-preview.png" });
});
