import { describe, expect, it } from "vitest";
import {
  getVatOriginFromCountry,
  isEuCountry,
  normalizeCountryCode,
} from "./countries";

describe("countries", () => {
  it("normalise les codes pays ISO 2 lettres", () => {
    expect(normalizeCountryCode(" lu ")).toBe("LU");
    expect(normalizeCountryCode("lux")).toBe("");
  });

  it("pays LU => origine LU", () => {
    expect(isEuCountry("LU")).toBe(true);
    expect(getVatOriginFromCountry("LU")).toBe("LU");
  });

  it("pays UE hors LU => origine EU", () => {
    expect(isEuCountry("FR")).toBe(true);
    expect(getVatOriginFromCountry("FR")).toBe("EU");
  });

  it("pays hors UE => origine NON_EU", () => {
    expect(isEuCountry("US")).toBe(false);
    expect(getVatOriginFromCountry("US")).toBe("NON_EU");
  });

  it("fournisseur sans pays => origine null", () => {
    expect(getVatOriginFromCountry("")).toBeNull();
  });
});
