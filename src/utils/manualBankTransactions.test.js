import { describe, expect, it } from "vitest";
import {
  buildManualBankTransactionPayload,
  buildSyncedBankTransactionPayload,
  isManualBankTransaction,
  manualBankTransactionToForm,
} from "./manualBankTransactions";

const form = {
  date: "2026-08-26",
  type: "credit",
  amount: "125,50",
  description: "Paiement client",
  category: "Paiement",
  reference: "FAC-42",
  paymentMethod: "Virement",
  notes: "À rapprocher",
};

describe("transactions bancaires manuelles", () => {
  it("crée une entrée positive persistable sans donnée comptable automatique", () => {
    const payload = buildManualBankTransactionPayload(form);
    expect(payload).toMatchObject({ amount: 125.5, source: "manual", reference: "FAC-42" });
    expect(payload).not.toHaveProperty("revenue");
    expect(payload).not.toHaveProperty("vat");
    expect(payload).not.toHaveProperty("matched_invoice_id");
  });

  it("transforme une sortie positive du formulaire en montant bancaire négatif", () => {
    expect(buildManualBankTransactionPayload({ ...form, type: "debit" }).amount).toBe(-125.5);
  });

  it("refuse zéro et les montants négatifs saisis", () => {
    expect(() => buildManualBankTransactionPayload({ ...form, amount: "0" })).toThrow(/positif/);
    expect(() => buildManualBankTransactionPayload({ ...form, amount: "-2" })).toThrow(/positif/);
  });

  it("restaure tous les champs persistés lors d'une édition après rechargement", () => {
    expect(manualBankTransactionToForm(buildManualBankTransactionPayload(form))).toEqual({
      ...form,
      amount: "125.5",
    });
  });

  it("conserve le rapprochement hors du patch d'édition", () => {
    const payload = buildManualBankTransactionPayload(form);
    expect(payload).not.toHaveProperty("matched");
    expect(payload).not.toHaveProperty("matched_invoice");
  });

  it("distingue les lignes manuelles des lignes synchronisées, y compris historiques", () => {
    expect(isManualBankTransaction({ source: "manual" })).toBe(true);
    expect(isManualBankTransaction({ source: "synced", external_id: "tink-1" })).toBe(false);
    expect(isManualBankTransaction({ external_id: "legacy-tink" })).toBe(false);
    expect(isManualBankTransaction({ description: "ancienne saisie" })).toBe(true);
  });

  it("prépare un import idempotent identifié par external_id et sans écraser les rapprochements", () => {
    const payload = buildSyncedBankTransactionPayload({
      external_id: "tink-unique-1",
      transaction_date: "2026-08-26",
      description: "Import",
      amount: 80,
    });
    expect(payload).toMatchObject({ external_id: "tink-unique-1", source: "synced" });
    expect(payload).not.toHaveProperty("matched_invoice_id");
  });
});
