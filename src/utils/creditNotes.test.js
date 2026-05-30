import { describe, expect, it } from "vitest";
import {
  computeCreditNoteCaImpact,
  createCreditNoteFromInvoice,
  normalizeCreditNote,
} from "./creditNotes.js";

describe("creditNotes", () => {
  const baseData = {
    settings: { taxRate: 17 },
    creditNotes: [],
    clients: [{ id: "c1", name: "Client" }],
    invoices: [],
  };

  const invoice = {
    id: "inv1",
    number: "FAC-2026-0001",
    clientId: "c1",
    totalHT: 100,
    totalTTC: 117,
    taxRate: 17,
  };

  it("crée un avoir total depuis une facture", () => {
    const result = createCreditNoteFromInvoice(baseData, invoice, {
      reason: "Retour produit",
    });
    expect(result.creditNote.totalTTC).toBe(117);
    expect(result.creditNote.isPartial).toBe(false);
    expect(result.creditNotes).toHaveLength(1);
  });

  it("calcule l'impact CA HT", () => {
    const notes = [
      normalizeCreditNote({ status: "émis", totalHT: 50, date: "01/05/2026" }),
      normalizeCreditNote({ status: "brouillon", totalHT: 20, date: "01/05/2026" }),
    ];
    expect(computeCreditNoteCaImpact(notes, { year: 2026 })).toBe(50);
  });
});
