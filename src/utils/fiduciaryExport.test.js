import { describe, expect, it } from "vitest";
import { buildFiduciaryExportPack } from "./fiduciaryExport.js";

describe("fiduciaryExport", () => {
  it("prépare ventes, achats, TVA et lettrage pour une période", () => {
    const pack = buildFiduciaryExportPack(
      {
        clients: [{ id: "c1", name: "Client LU" }],
        invoices: [
          {
            id: "i1",
            number: "FAC-1",
            clientId: "c1",
            date: "2026-06-05",
            totalHT: 100,
            totalTVA: 17,
            totalTTC: 117,
            paidAmount: 50,
            remaining: 67,
            taxRate: 17,
          },
        ],
        expenses: [
          {
            id: "e1",
            purchaseDate: "2026-06-10",
            supplierName: "Fournisseur",
            amountHT: 40,
            tva: 6.8,
            amountTTC: 46.8,
          },
        ],
      },
      { year: 2026, month: 5 }
    );

    expect(pack.sales).toHaveLength(1);
    expect(pack.purchases).toHaveLength(1);
    expect(pack.openItems[0].openAmount).toBe(67);
    expect(pack.totals.vatDue).toBe(10.2);
  });
});
