import { describe, expect, it } from "vitest";
import { buildAutomationAlerts, AUTOMATION_ALERT_TYPES } from "./automations.js";

describe("automations", () => {
  it("génère des alertes factures impayées", () => {
    const alerts = buildAutomationAlerts({
      quotes: [],
      products: [],
      afterSalesCases: [],
      invoices: [
        {
          id: "i1",
          number: "FAC-1",
          status: "En retard",
          dueDate: "01/01/2020",
          totalTTC: 50,
          remaining: 50,
        },
      ],
    });
    expect(alerts.some((a) => a.type === AUTOMATION_ALERT_TYPES.UNPAID_INVOICE)).toBe(true);
  });
});
