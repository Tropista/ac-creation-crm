import { describe, expect, it } from "vitest";
import { buildPurchaseOrderPdf } from "./purchaseOrderPdf.js";

describe("purchaseOrderPdf", () => {
  it("génère un PDF bon de commande", () => {
    const pdf = buildPurchaseOrderPdf({
      products: [
        {
          id: "p1",
          name: "T-shirt blanc L",
          sku: "TSH-L",
          stock: 2,
          stockMin: 10,
        },
      ],
      suppliers: [],
      settings: { companyName: "AC Creation" },
    });

    expect(pdf.getNumberOfPages()).toBeGreaterThan(0);
    expect(typeof pdf.output).toBe("function");
  });
});
