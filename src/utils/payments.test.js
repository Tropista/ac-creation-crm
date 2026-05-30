import { describe, expect, it } from "vitest";
import { buildPaymentSummary, recordInvoicePayment } from "./payments.js";

describe("payments", () => {
  const invoice = {
    id: "inv1",
    number: "FAC-1",
    clientId: "c1",
    totalTTC: 100,
    status: "Non payée",
  };

  it("enregistre un paiement partiel", () => {
    const data = { invoices: [invoice], payments: [] };
    const result = recordInvoicePayment(data, invoice, {
      amount: 40,
      method: "Virement",
    });
    expect(result.invoice.paidAmount).toBe(40);
    expect(result.invoice.remaining).toBe(60);
    expect(result.payments).toHaveLength(1);
  });

  it("résume les paiements", () => {
    const summary = buildPaymentSummary(
      { ...invoice, paidAmount: 40, remaining: 60 },
      [
        {
          id: "p1",
          invoiceId: "inv1",
          amount: 40,
          status: "Reçu",
          date: "2026-05-01",
        },
      ]
    );
    expect(summary.paidAmount).toBe(40);
    expect(summary.remaining).toBe(60);
  });
});
