import { describe, expect, it } from "vitest";
import {
  buildPaymentSummary,
  createHistoricalInvoicePaymentsBatch,
  recordInvoicePayment,
  upsertHistoricalInvoicePayment,
} from "./payments.js";

describe("payments", () => {
  const invoice = {
    id: "inv1",
    number: "FAC-1",
    clientId: "c1",
    totalTTC: 100,
    status: "Non payée",
  };
  const paidInvoice = {
    ...invoice,
    status: "Payée",
    paidAmount: 100,
    remaining: 0,
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

  it("crée un paiement historique manuel sans transaction bancaire", () => {
    const result = upsertHistoricalInvoicePayment(
      { invoices: [paidInvoice], payments: [] },
      paidInvoice,
      { amount: 100, method: "Carte", date: "2026-07-20" }
    );

    expect(result.payments).toHaveLength(1);
    expect(result.payment).toMatchObject({
      invoiceId: "inv1",
      amount: 100,
      method: "Carte",
      status: "Reçu",
      date: "2026-07-20",
      bankTransactionId: "",
      source: "manual",
    });
    expect(result.invoice.status).toBe("Payée");
    expect(result.invoice.paidAmount).toBe(100);
  });

  it("refuse un paiement historique sans date d'encaissement", () => {
    expect(() =>
      upsertHistoricalInvoicePayment(
        { invoices: [invoice], payments: [] },
        invoice,
        { amount: 100, method: "Virement", date: "" }
      )
    ).toThrow("Date d'encaissement obligatoire.");
  });

  it("crée en masse des paiements historiques valides", () => {
    const inv2 = { ...paidInvoice, id: "inv2", number: "FAC-2", totalTTC: 50, paidAmount: 50 };
    const result = createHistoricalInvoicePaymentsBatch(
      { invoices: [paidInvoice, inv2], payments: [] },
      [
        { invoiceId: "inv1", amount: 100, method: "Virement", date: "2026-07-20" },
        { invoiceId: "inv2", amount: 50, method: "Carte", date: "2026-07-21" },
      ]
    );

    expect(result.created).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.needsReview).toBe(0);
    expect(result.data.payments).toHaveLength(2);
  });

  it("la création en masse laisse à vérifier les paiements sans date", () => {
    const result = createHistoricalInvoicePaymentsBatch(
      { invoices: [paidInvoice], payments: [] },
      [{ invoiceId: "inv1", amount: 100, method: "Virement", date: "" }]
    );

    expect(result.created).toBe(0);
    expect(result.needsReview).toBe(1);
    expect(result.data.payments).toHaveLength(0);
  });

  it("la création en masse ignore une facture qui possède déjà un paiement valide", () => {
    const existing = {
      id: "pay-existing",
      invoiceId: "inv1",
      amount: 100,
      status: "Reçu",
      date: "2026-07-19",
    };
    const result = createHistoricalInvoicePaymentsBatch(
      { invoices: [paidInvoice], payments: [existing] },
      [{ invoiceId: "inv1", amount: 100, method: "Virement", date: "2026-07-20" }]
    );

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.data.payments).toHaveLength(1);
  });

  it("la création en masse est idempotente si elle est lancée deux fois", () => {
    const first = createHistoricalInvoicePaymentsBatch(
      { invoices: [paidInvoice], payments: [] },
      [{ invoiceId: "inv1", amount: 100, method: "Virement", date: "2026-07-20" }]
    );
    const second = createHistoricalInvoicePaymentsBatch(
      first.data,
      [{ invoiceId: "inv1", amount: 100, method: "Virement", date: "2026-07-20" }]
    );

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.data.payments).toHaveLength(1);
  });

  it("accepte un paiement historique partiel", () => {
    const result = createHistoricalInvoicePaymentsBatch(
      { invoices: [{ ...invoice, status: "Partiellement payée", paidAmount: 40 }], payments: [] },
      [{ invoiceId: "inv1", amount: 40, method: "Virement", date: "2026-07-20" }]
    );

    expect(result.created).toBe(1);
    expect(result.data.payments[0].amount).toBe(40);
    expect(result.data.invoice.status).toBe("Partiellement payée");
  });

  it("ignore les factures annulées ou non payées", () => {
    const cancelled = { ...invoice, id: "cancelled", number: "FAC-CANCELLED", status: "Annulée" };
    const unpaid = { ...invoice, id: "unpaid", number: "FAC-UNPAID", status: "Non payée" };
    const result = createHistoricalInvoicePaymentsBatch(
      { invoices: [cancelled, unpaid], payments: [] },
      [
        { invoiceId: "cancelled", amount: 100, method: "Virement", date: "2026-07-20" },
        { invoiceId: "unpaid", amount: 100, method: "Virement", date: "2026-07-20" },
      ]
    );

    expect(result.created).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.needsReview).toBe(0);
    expect(result.data.payments).toHaveLength(0);
  });
});
