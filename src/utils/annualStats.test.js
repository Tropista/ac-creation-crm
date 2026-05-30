import { describe, expect, it } from "vitest";
import { computeAnnualStats, computeQuoteAcceptanceRate } from "./annualStats.js";

describe("annualStats", () => {
  it("calcule le taux d'acceptation des devis", () => {
    const rate = computeQuoteAcceptanceRate(
      [
        { date: "15/03/2025", status: "Envoyé", sentAt: "2025-03-15" },
        { date: "20/03/2025", status: "Accepté" },
        { date: "25/03/2025", status: "Accepté" },
      ],
      2025
    );

    expect(rate.sentCount).toBe(3);
    expect(rate.acceptedCount).toBe(2);
    expect(rate.rate).toBeCloseTo(2 / 3, 2);
  });

  it("agrège CA, marge et top clients", () => {
    const stats = computeAnnualStats({
      year: 2025,
      quotes: [{ date: "01/01/2025", status: "Accepté" }],
      invoices: [
        {
          date: "10/02/2025",
          totalHT: 1000,
          totalTTC: 1200,
          clientId: "c1",
        },
      ],
      expenses: [{ purchaseDate: "05/02/2025", amountHT: 200 }],
      data: { clients: [{ id: "c1", name: "Top Client" }] },
    });

    expect(stats.revenueHT).toBe(1000);
    expect(stats.expensesHT).toBe(200);
    expect(stats.marginHT).toBe(800);
    expect(stats.topClients[0]?.name).toBe("Top Client");
  });
});
