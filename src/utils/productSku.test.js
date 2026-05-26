import { describe, it, expect } from "vitest";
import { getNextNumericSku } from "./productSku.js";

describe("getNextNumericSku", () => {
  it("starts at 001 when no matching products exist", () => {
    expect(getNextNumericSku([], { prefix: "LAS" })).toBe("LAS-001");
  });

  it("continues from the highest LAS or LASER suffix", () => {
    const products = [
      { sku: "LASER-0189" },
      { sku: "LAS-005" },
      { sku: "DTF-0010" },
    ];

    expect(
      getNextNumericSku(products, { prefix: "LAS", legacyPrefixes: ["LASER"] })
    ).toBe("LAS-190");
  });

  it("avoids collisions when the next number already exists", () => {
    const products = [{ sku: "LAS-190" }];

    expect(getNextNumericSku(products, { prefix: "LAS" })).toBe("LAS-191");
  });
});
