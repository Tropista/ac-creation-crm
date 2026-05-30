import { describe, expect, it } from "vitest";
import {
  buildDashboardProfitability,
  computeInvoiceProfitability,
  computeOrderProfitability,
  getPaidInvoicesWithLedger,
} from "./profitability.js";

describe("profitability", () => {
  it("calcule la marge d'une commande", () => {
    const row = computeOrderProfitability(
      {
        id: "q1",
        number: "DEV-1",
        clientId: "c1",
        totalHT: 200,
        productionSheet: {
          materialCost: 30,
          machineCost: 20,
          estimatedMinutes: 60,
        },
      },
      { clients: [{ id: "c1", name: "Test" }], users: [] }
    );
    expect(row.revenueHT).toBe(200);
    expect(row.totalCost).toBeGreaterThan(0);
    expect(row.marginHT).toBeLessThan(200);
  });

  it("utilise les coûts atelier d'un devis lié à une facture payée", () => {
    const row = computeInvoiceProfitability(
      {
        id: "inv1",
        number: "FAC-1",
        clientId: "c1",
        totalHT: 250,
        parentQuoteId: "q1",
        lines: [{ productId: "p1", quantity: 1, totalHT: 250 }],
      },
      {
        clients: [{ id: "c1", name: "Client" }],
        quotes: [
          {
            id: "q1",
            totalHT: 250,
            productionSheet: {
              materialCost: 40,
              machineCost: 25,
              estimatedMinutes: 30,
            },
          },
        ],
        products: [],
      }
    );
    expect(row.revenueHT).toBe(250);
    expect(row.costSource).toBe("atelier");
    expect(row.marginHT).toBeLessThan(250);
  });

  it("retombe sur le prix d'achat produit sans fiche atelier", () => {
    const row = computeInvoiceProfitability(
      {
        id: "inv2",
        number: "FAC-2",
        clientId: "c1",
        totalHT: 100,
        lines: [{ productId: "p1", quantity: 2, totalHT: 100 }],
      },
      {
        clients: [{ id: "c1", name: "Client" }],
        quotes: [],
        products: [{ id: "p1", purchasePrice: 20 }],
      }
    );
    expect(row.totalCost).toBe(40);
    expect(row.marginHT).toBe(60);
    expect(row.costSource).toBe("products");
  });

  it("agrège factures payées et commandes atelier sans double comptage", () => {
    const data = {
      clients: [{ id: "c1", name: "Client" }],
      quotes: [
        {
          id: "q-paid",
          clientId: "c1",
          number: "DEV-P",
          status: "Livré",
          totalHT: 300,
          productionSheet: { materialCost: 50, estimatedMinutes: 0 },
        },
        {
          id: "q-open",
          clientId: "c1",
          number: "DEV-O",
          status: "En production",
          totalHT: 150,
          productionSheet: { materialCost: 30, estimatedMinutes: 0 },
        },
      ],
      invoices: [
        {
          id: "inv-paid",
          clientId: "c1",
          parentQuoteId: "q-paid",
          totalHT: 300,
          totalTTC: 351,
          status: "Payée",
          paidAmount: 351,
          remaining: 0,
        },
      ],
      payments: [
        {
          id: "pay1",
          invoiceId: "inv-paid",
          amount: 351,
          status: "Reçu",
        },
      ],
      products: [],
    };

    const paid = getPaidInvoicesWithLedger(data.invoices, data.payments);
    expect(paid).toHaveLength(1);

    const dashboard = buildDashboardProfitability(data);
    expect(dashboard.paidInvoiceCount).toBe(1);
    expect(dashboard.supplementalQuoteCount).toBe(1);
    expect(dashboard.byClient[0].orderCount).toBe(2);
    expect(dashboard.byClient[0].revenueHT).toBe(450);
  });
});
