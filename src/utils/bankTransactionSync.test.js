import { describe, expect, it } from "vitest";
import {
  reconcileExpensePatchVariants,
  reconcilePatchVariants,
  unlinkPatchVariants,
} from "./bankTransactionSync";

describe("patches de rapprochement bancaire", () => {
  it("lie une entrée à une facture sans créer de paiement", () => {
    const patch = reconcilePatchVariants({ id: "inv-1", number: "FAC-2026-0018" })[0];
    expect(patch).toMatchObject({ matched: true, match_type: "invoice", matched_invoice_id: "inv-1" });
    expect(patch).not.toHaveProperty("payment");
    expect(patch).not.toHaveProperty("payments");
  });

  it("lie une sortie à une dépense sans modifier ses montants ou sa TVA", () => {
    const expense = { id: "exp-1", supplierName: "Amazon", invoiceNumber: "AMZ-42", totalTTC: 70.94, vatAmount: 10.31 };
    const patch = reconcileExpensePatchVariants(expense)[0];
    expect(patch).toMatchObject({ matched: true, match_type: "expense", matched_expense_id: "exp-1" });
    expect(patch).not.toHaveProperty("totalTTC");
    expect(patch).not.toHaveProperty("vatAmount");
    expect(expense).toMatchObject({ totalTTC: 70.94, vatAmount: 10.31 });
  });

  it("retire tous les types de rapprochement sans supprimer de document", () => {
    expect(unlinkPatchVariants()[0]).toEqual({
      matched: false,
      matched_invoice: null,
      matched_invoice_id: null,
      matched_expense_id: null,
      matched_expense_reference: null,
      match_type: null,
      status: "non rapprochée",
    });
  });
});
