import { describe, expect, it } from "vitest";
import { buildDirectionDashboard } from "./directionDashboard.js";

describe("directionDashboard", () => {
  it("calcule les KPI direction annuels", () => {
    const result = buildDirectionDashboard(
      {
        clients: [{ id: "c1", name: "Client A" }],
        products: [{ id: "p1", name: "T-shirt", purchasePrice: 10 }],
        invoices: [
          {
            id: "i1",
            clientId: "c1",
            date: "2026-02-10",
            totalHT: 100,
            remaining: 20,
            lines: [{ productId: "p1", quantity: 2, price: 50, totalHT: 100 }],
          },
        ],
        quotes: [
          { id: "q1", date: "2026-02-01", status: "Accepté" },
          { id: "q2", date: "2026-02-02", status: "Refusé" },
        ],
      },
      { year: 2026, referenceDate: new Date("2026-02-15") }
    );

    expect(result.revenueHT).toBe(100);
    expect(result.conversionRate).toBe(50);
    expect(result.unpaidAmount).toBe(20);
    expect(result.marginHT).toBe(80);
    expect(result.marginRate).toBe(80);
    expect(result.marginKnownRevenueHT).toBe(100);
    expect(result.marginUnknownRevenueHT).toBe(0);
    expect(result.marginByClient[0].marginHT).toBe(80);
    expect(result.marginByProcess[0].marginHT).toBe(80);
    expect(result.marginByOperator[0].name).toBe("Non assigné");
    expect(result.forecast.projectedRevenueHT).toBe(600);
    expect(result.unpaidRatio).toBe(20);
    expect(result.atelierLoad.total).toBe(1);
    expect(result.topClients[0].name).toBe("Client A");
    expect(result.profitableProducts[0].marginHT).toBe(80);
  });

  it("ignore les factures payees avec un ancien reste du dans les impayes", () => {
    const result = buildDirectionDashboard(
      {
        clients: [],
        products: [],
        invoices: [
          {
            id: "paid-stale",
            date: "2026-02-10",
            totalHT: 100,
            totalTTC: 117,
            status: "Payee",
            remaining: 117,
            paidAmount: 117,
          },
          {
            id: "open",
            date: "2026-02-11",
            totalHT: 50,
            totalTTC: 58.5,
            status: "Non payee",
            remaining: 58.5,
          },
        ],
      },
      { year: 2026 }
    );

    expect(result.unpaidAmount).toBe(58.5);
    expect(result.unpaidCount).toBe(1);
  });

  it("retire des impayes les factures soldees par le registre de paiements", () => {
    const result = buildDirectionDashboard(
      {
        clients: [],
        products: [],
        invoices: [
          {
            id: "ledger-paid",
            date: "2026-02-10",
            totalHT: 100,
            totalTTC: 117,
            status: "Non payee",
            remaining: 117,
          },
        ],
        payments: [{ invoiceId: "ledger-paid", amount: 117, status: "Reçu" }],
      },
      { year: 2026 }
    );

    expect(result.unpaidAmount).toBe(0);
    expect(result.unpaidCount).toBe(0);
  });

  it("n'affiche pas une marge a 100 pour les factures sans cout connu", () => {
    const result = buildDirectionDashboard(
      {
        clients: [],
        products: [],
        invoices: [
          {
            id: "unknown-cost",
            date: "2026-02-10",
            totalHT: 100,
            lines: [{ description: "Prestation", quantity: 1, totalHT: 100 }],
          },
        ],
      },
      { year: 2026 }
    );

    expect(result.marginHT).toBe(0);
    expect(result.marginRate).toBe(0);
    expect(result.marginKnownRevenueHT).toBe(0);
    expect(result.marginUnknownRevenueHT).toBe(100);
    expect(result.hasCompleteMargin).toBe(false);
    expect(result.marginAlerts.some((alert) => alert.type === "missing_cost")).toBe(true);
  });

  it("calcule la charge atelier en heures et urgences", () => {
    const result = buildDirectionDashboard(
      {
        invoices: [],
        quotes: [
          {
            id: "q1",
            date: "2026-01-10",
            status: "Accepté",
            promisedDeliveryDate: "2026-02-14",
            productionSheet: { estimatedMinutes: 120 },
            lines: [{ description: "DTF textile" }],
          },
          {
            id: "q2",
            date: "2026-01-11",
            status: "Prêt",
            promisedDeliveryDate: "2026-02-20",
            productionSheet: { estimatedMinutes: 60 },
            lines: [{ description: "Laser bois" }],
          },
        ],
        settings: { atelierWeeklyCapacityHours: 5 },
      },
      { year: 2026, referenceDate: new Date("2026-02-15") }
    );

    expect(result.atelierLoad.total).toBe(2);
    expect(result.atelierLoad.estimatedHours).toBe(3);
    expect(result.atelierLoad.loadRate).toBe(60);
    expect(result.atelierLoad.urgentCount).toBe(1);
    expect(result.atelierLoad.byProcess[0].count).toBe(1);
  });
});
