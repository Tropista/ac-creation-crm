import { describe, expect, it } from "vitest";
import {
  getClientPortalDocuments,
  getClientPortalProgress,
  getInvoicePaymentLabel,
} from "./clientPortal";

describe("clientPortal", () => {
  it("retourne uniquement les documents visibles pour le client du devis", () => {
    const quote = { id: "q1", number: "DEV-1", clientId: "c1", status: "Accepté" };
    const related = getClientPortalDocuments(
      {
        quotes: [
          quote,
          { id: "q2", number: "DEV-2", clientId: "c2" },
        ],
        invoices: [
          { id: "i1", number: "FAC-1", clientId: "c1" },
          { id: "i2", number: "FAC-2", clientId: "c2", parentQuoteId: "q1" },
          { id: "i3", number: "FAC-3", clientId: "c2" },
        ],
        deliveryNotes: [
          { id: "b1", number: "BL-1", clientId: "c1" },
          { id: "b2", number: "BL-2", clientId: "c2", quoteNumber: "DEV-1" },
        ],
      },
      quote
    );

    expect(related.quotes.map((entry) => entry.number)).toEqual(["DEV-1"]);
    expect(related.invoices.map((entry) => entry.number)).toEqual(["FAC-1", "FAC-2"]);
    expect(related.deliveryNotes.map((entry) => entry.number)).toEqual(["BL-1", "BL-2"]);
  });

  it("marque les étapes clés comme complètes selon le statut et les documents", () => {
    const progress = getClientPortalProgress(
      { id: "q1", number: "DEV-1", status: "Prêt" },
      {
        invoices: [{ status: "Payée", totalTTC: 120 }],
        deliveryNotes: [{ status: "Prêt" }],
      }
    );

    expect(progress.find((step) => step.id === "decision")?.complete).toBe(true);
    expect(progress.find((step) => step.id === "production")?.complete).toBe(true);
    expect(progress.find((step) => step.id === "delivery")?.complete).toBe(true);
    expect(progress.find((step) => step.id === "payment")?.complete).toBe(true);
  });

  it("affiche le reste à payer des factures impayées", () => {
    expect(
      getInvoicePaymentLabel({ status: "Partiellement payée", totalTTC: 100, paidAmount: 40 })
    ).toContain("60,00");
  });
});
