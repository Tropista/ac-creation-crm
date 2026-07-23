import { describe, expect, it, vi } from "vitest";
import {
  applyVatClassificationSelections,
  buildVatClassificationAssistantState,
} from "./vatClassificationAssistant";
import { buildVatDeclaration } from "./vatDeclaration";

describe("vatClassificationAssistant", () => {
  it("cree un fournisseur manquant et normalise LUX en LU", () => {
    vi.spyOn(Date, "now").mockReturnValue(123);
    const data = {
      suppliers: [],
      invoices: [],
      expenses: [
        {
          id: "expense-1",
          supplierName: "Chambre des Metier",
          purchaseDate: "2026-01-15",
          amountHT: 35,
          vatRate: 0,
          vatAmount: 0,
          totalTTC: 35,
        },
      ],
    };

    const next = applyVatClassificationSelections(data, {
      suppliers: [
        {
          id: "Chambre des Metier",
          supplierName: "Chambre des Metier",
          proposed_country_code: "LUX",
          proposed_vat_origin: "LU",
          proposed_transaction_type: "eu_service",
        },
      ],
    });

    expect(next.suppliers).toHaveLength(1);
    expect(next.suppliers[0]).toMatchObject({
      id: "supplier-123-1",
      name: "Chambre des Metier",
      country_code: "LU",
      country_name: "Luxembourg",
      default_vat_origin: "LU",
      default_transaction_type: "none",
    });
    expect(next.expenses[0].supplierId).toBe("supplier-123-1");

    const assistantState = buildVatClassificationAssistantState({
      data: next,
      taxYear: 2026,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
    expect(assistantState.suppliers).toHaveLength(0);
  });

  it("enregistre Atome3D comme marchandise UE et retire les anomalies de classification", () => {
    const data = {
      suppliers: [{ id: "atome", name: "Atome3D", country_code: "FR", default_vat_origin: "EU" }],
      invoices: [],
      expenses: [{
        id: "atome-expense",
        supplierId: "atome",
        supplierName: "Atome3D",
        purchaseDate: "2026-06-02",
        amountHT: 70.94,
        vatRate: 0,
        vatAmount: 0,
        totalTTC: 70.94,
        vat_review_status: "to_review",
      }],
    };
    const next = applyVatClassificationSelections(data, {
      expenses: [{
        id: "atome-expense",
        suggestions: {
          vat_origin: "EU",
          expense_tax_category: "merchandise",
          eu_transaction_type: "eu_goods",
          eu_transaction_type_source: "automatic",
          vat_deductibility: "fully_deductible",
          reverse_charge_vat_rate: 17,
          reverse_charge_rate_status: "suggested",
        },
      }],
    });

    expect(next.expenses[0]).toMatchObject({
      expense_tax_category: "merchandise",
      eu_transaction_type: "eu_goods",
      vat_review_status: "reviewed",
      vat_classification_confidence: "manual",
      reverse_charge_rate_status: "confirmed",
    });

    const report = buildVatDeclaration(next, { year: 2026 });
    expect(report.anomalies.some((entry) => entry.code === "UNREVIEWED_EXPENSE_CLASSIFICATION")).toBe(false);
    expect(report.anomalies.some((entry) => entry.code === "EU_ZERO_MISSING_TRANSACTION_TYPE")).toBe(false);
    expect(report.ecdfBoxes.find((entry) => entry.box === "711")?.amount).toBe(70.94);
  });
});
