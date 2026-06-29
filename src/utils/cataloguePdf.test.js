import { describe, it, expect } from "vitest";
import { formatCataloguePrice } from "./cataloguePdf.js";

describe("cataloguePdf helpers", () => {
  it("formate les prix en français avec un séparateur de milliers compatible jsPDF", () => {
    expect(formatCataloguePrice(1234.5)).toBe("1.234,50");
    expect(formatCataloguePrice(1800)).toBe("1.800,00");
    expect(formatCataloguePrice(2106)).toBe("2.106,00");
  });

  it("gère les valeurs nulles ou manquantes", () => {
    expect(formatCataloguePrice(null)).toBe("0,00");
    expect(formatCataloguePrice(undefined)).toBe("0,00");
  });
});
