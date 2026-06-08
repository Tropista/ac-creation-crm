import { describe, expect, it } from "vitest";
import {
  buildAutomationAlerts,
  AUTOMATION_ALERT_TYPES,
  countAutomationAlerts,
  getAutomationAlertKey,
} from "./automations.js";

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
  it("genere des alertes marge faible et couts manquants", () => {
    const alerts = buildAutomationAlerts({
      clients: [{ id: "c1", name: "Client" }],
      products: [{ id: "p1", purchasePrice: 80 }],
      quotes: [],
      afterSalesCases: [],
      settings: { lowMarginAlertThreshold: 30 },
      invoices: [
        {
          id: "low",
          number: "FAC-LOW",
          clientId: "c1",
          date: "2026-01-01",
          totalHT: 100,
          lines: [{ productId: "p1", quantity: 1, price: 100, totalHT: 100 }],
        },
        {
          id: "missing",
          number: "FAC-MISSING",
          clientId: "c1",
          date: "2026-01-02",
          totalHT: 50,
          lines: [{ description: "Prestation", quantity: 1, price: 50, totalHT: 50 }],
        },
      ],
    });

    expect(alerts.some((alert) => alert.type === AUTOMATION_ALERT_TYPES.LOW_MARGIN)).toBe(true);
    expect(alerts.some((alert) => alert.type === AUTOMATION_ALERT_TYPES.MISSING_COST)).toBe(true);
  });

  it("ignore les alertes deja masquees", () => {
    const data = {
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
    };
    const [alert] = buildAutomationAlerts(data);
    const dismissed = { key: getAutomationAlertKey(alert), type: alert.type, title: alert.title };
    const result = countAutomationAlerts({ ...data, dismissedAutomationAlerts: [dismissed] });

    expect(result.total).toBe(0);
    expect(buildAutomationAlerts({ ...data, dismissedAutomationAlerts: [dismissed] })).toHaveLength(0);
    expect(buildAutomationAlerts({ ...data, dismissedAutomationAlerts: [dismissed] }, { includeDismissed: true })).toHaveLength(1);
  });
});
