import { describe, expect, it } from "vitest";
import {
  VAT_RATE_CUSTOM,
  computeTotalFromHtAndVat,
  computeVatFromHtAndRate,
  isPresetVatRate,
  resolveVatRateSelectValue,
  roundMoney,
} from "./expenseAmounts";

describe("expenseAmounts", () => {
  it("rounds money to 2 decimals", () => {
    expect(roundMoney(8.4711)).toBe(8.47);
    expect(roundMoney(58.3011)).toBe(58.3);
  });

  it("computes VAT and TTC from HT and rate", () => {
    expect(computeVatFromHtAndRate(49.83, 17)).toEqual({
      vatAmount: 8.47,
      totalTTC: 58.3,
    });
    expect(computeVatFromHtAndRate(100, 0)).toEqual({
      vatAmount: 0,
      totalTTC: 100,
    });
  });

  it("returns null when HT or rate is missing", () => {
    expect(computeVatFromHtAndRate("", 17)).toBeNull();
    expect(computeVatFromHtAndRate(10, "")).toBeNull();
  });

  it("computes TTC from HT and VAT amount", () => {
    expect(computeTotalFromHtAndVat(49.83, 8.47)).toBe(58.3);
  });

  it("detects preset Luxembourg VAT rates", () => {
    expect(isPresetVatRate(17)).toBe(true);
    expect(isPresetVatRate("14")).toBe(true);
    expect(isPresetVatRate(20)).toBe(false);
  });

  it("resolves VAT rate select value", () => {
    expect(resolveVatRateSelectValue("")).toBe("");
    expect(resolveVatRateSelectValue(17)).toBe("17");
    expect(resolveVatRateSelectValue(20)).toBe(VAT_RATE_CUSTOM);
    expect(
      resolveVatRateSelectValue(17, { customMode: true })
    ).toBe(VAT_RATE_CUSTOM);
  });
});
