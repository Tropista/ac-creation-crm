import { describe, expect, it } from "vitest";
import {
  isNonNegativeNumber,
  isPositiveNumber,
  isRequired,
  isValidEmail,
  parseLocaleNumber,
  validateFields,
} from "./validation.js";

describe("isRequired", () => {
  it("rejects empty or whitespace-only values", () => {
    expect(isRequired("")).toBe(false);
    expect(isRequired("   ")).toBe(false);
    expect(isRequired(null)).toBe(false);
    expect(isRequired(undefined)).toBe(false);
  });

  it("accepts non-empty values", () => {
    expect(isRequired("Alice")).toBe(true);
    expect(isRequired(0)).toBe(true);
  });
});

describe("isValidEmail", () => {
  it("accepts an empty value (champ optionnel)", () => {
    expect(isValidEmail("")).toBe(true);
    expect(isValidEmail("   ")).toBe(true);
  });

  it("accepts well-formed addresses", () => {
    expect(isValidEmail("alice@example.com")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidEmail("alice@")).toBe(false);
    expect(isValidEmail("alice.example.com")).toBe(false);
    expect(isValidEmail("alice@example")).toBe(false);
  });
});

describe("parseLocaleNumber", () => {
  it("treats a comma as a decimal separator", () => {
    expect(parseLocaleNumber("12,5")).toBe(12.5);
    expect(parseLocaleNumber("12.5")).toBe(12.5);
  });
});

describe("isPositiveNumber / isNonNegativeNumber", () => {
  it("validates strictly positive numbers", () => {
    expect(isPositiveNumber("12,5")).toBe(true);
    expect(isPositiveNumber("0")).toBe(false);
    expect(isPositiveNumber("-3")).toBe(false);
    expect(isPositiveNumber("abc")).toBe(false);
  });

  it("validates non-negative numbers", () => {
    expect(isNonNegativeNumber("0")).toBe(true);
    expect(isNonNegativeNumber("3,2")).toBe(true);
    expect(isNonNegativeNumber("-1")).toBe(false);
    expect(isNonNegativeNumber("abc")).toBe(false);
  });
});

describe("validateFields", () => {
  it("returns the first matching error message", () => {
    const error = validateFields(
      { name: "", price: "-1" },
      {
        name: [{ test: isRequired, message: "Le nom est obligatoire." }],
        price: [{ test: isNonNegativeNumber, message: "Prix invalide." }],
      }
    );

    expect(error).toBe("Le nom est obligatoire.");
  });

  it("returns null when every rule passes", () => {
    const error = validateFields(
      { name: "Alice", price: "12,5" },
      {
        name: [{ test: isRequired, message: "Le nom est obligatoire." }],
        price: [{ test: isNonNegativeNumber, message: "Prix invalide." }],
      }
    );

    expect(error).toBeNull();
  });
});
