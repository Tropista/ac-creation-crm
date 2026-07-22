import { describe, expect, it, vi } from "vitest";
import {
  applyVatClassificationSelections,
  buildVatClassificationAssistantState,
} from "./vatClassificationAssistant";

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
});
