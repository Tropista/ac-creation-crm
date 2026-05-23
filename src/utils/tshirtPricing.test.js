import { describe, expect, it } from "vitest";
import { estimatePrintPriceHT } from "./tshirtPricing";

describe("estimatePrintPriceHT", () => {
  it("estime un transfert DTF poitrine", () => {
    const price = estimatePrintPriceHT({}, "dtf", 28, 35);
    expect(price).toBeGreaterThan(5);
    expect(price).toBeLessThan(80);
  });

  it("estime un marquage UV", () => {
    const price = estimatePrintPriceHT({}, "uv", 10, 18);
    expect(price).toBeGreaterThanOrEqual(5);
  });

  it("estime un flex avec minimum", () => {
    expect(estimatePrintPriceHT({}, "flex", 2, 2)).toBe(8);
    expect(estimatePrintPriceHT({}, "flex", 10, 10)).toBeGreaterThan(8);
  });
});
