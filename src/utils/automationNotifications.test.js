import { describe, expect, it } from "vitest";
import {
  buildAutomationDigestEmail,
  getAutomationNotificationRecipient,
} from "./automationNotifications";

describe("automationNotifications", () => {
  it("résout le destinataire avec fallback", () => {
    expect(
      getAutomationNotificationRecipient({
        automationNotificationEmail: "ops@test.lu",
        companyEmail: "company@test.lu",
        smtpEmail: "smtp@test.lu",
      })
    ).toBe("ops@test.lu");

    expect(
      getAutomationNotificationRecipient({
        companyEmail: "company@test.lu",
        smtpEmail: "smtp@test.lu",
      })
    ).toBe("company@test.lu");
  });

  it("génère un résumé des alertes actives", () => {
    const digest = buildAutomationDigestEmail({
      settings: { companyName: "AC Test" },
      invoices: [
        {
          id: "i1",
          number: "FAC-1",
          status: "Non payée",
          dueDate: "2020-01-01",
          totalTTC: 100,
          clientId: "c1",
        },
      ],
      clients: [{ id: "c1", name: "Client", email: "client@test.lu" }],
      quotes: [],
      products: [],
      afterSalesCases: [],
    }, new Date("2026-06-07"));

    expect(digest.alerts.length).toBeGreaterThan(0);
    expect(digest.subject).toContain("Résumé automatisations");
    expect(digest.text).toContain("Factures impayées");
    expect(digest.text).toContain("FAC-1");
  });
});
