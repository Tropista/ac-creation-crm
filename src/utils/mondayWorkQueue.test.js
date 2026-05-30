import { describe, expect, it } from "vitest";
import { getStaleSentQuotes } from "./documentTracking.js";
import { buildMondayWorkQueue, MONDAY_QUEUE_KINDS } from "./mondayWorkQueue.js";

describe("getStaleSentQuotes", () => {
  it("retourne les devis envoyés sans réponse depuis 7 jours", () => {
    const oldSent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const recentSent = new Date().toISOString();

    const quotes = [
      { id: 1, status: "Envoyé", sentAt: oldSent, number: "DEV-1" },
      { id: 2, status: "Envoyé", sentAt: recentSent, number: "DEV-2" },
      { id: 3, status: "Accepté", sentAt: oldSent, number: "DEV-3" },
      { id: 4, status: "Envoyé", sentAt: oldSent, acceptedAt: oldSent, number: "DEV-4" },
    ];

    expect(getStaleSentQuotes(quotes).map((q) => q.id)).toEqual([1]);
  });
});

describe("buildMondayWorkQueue", () => {
  it("agrège devis, factures, acomptes et lancements", () => {
    const oldSent = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const queue = buildMondayWorkQueue({
      quotes: [
        { id: "q1", status: "Envoyé", sentAt: oldSent, number: "DEV-1", totalTTC: 100 },
        {
          id: "q2",
          status: "Accepté",
          number: "DEV-2",
          depositPercent: 30,
          totalTTC: 500,
          promisedDeliveryDate: new Date().toLocaleDateString("fr-FR"),
        },
      ],
      invoices: [
        {
          id: "i1",
          status: "En retard",
          number: "FAC-1",
          dueDate: "01/01/2020",
          totalTTC: 200,
        },
      ],
      data: { invoices: [] },
    });

    const kinds = queue.map((item) => item.kind);
    expect(kinds).toContain(MONDAY_QUEUE_KINDS.QUOTE_FOLLOWUP);
    expect(kinds).toContain(MONDAY_QUEUE_KINDS.INVOICE_OVERDUE);
    expect(kinds).toContain(MONDAY_QUEUE_KINDS.MISSING_DEPOSIT);
  });
});
