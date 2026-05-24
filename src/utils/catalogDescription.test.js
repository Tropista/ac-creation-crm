import { describe, expect, it } from "vitest";
import { stripSourceFromDescription } from "./catalogDescription.js";

describe("stripSourceFromDescription", () => {
  it("removes Source : lines with URLs", () => {
    const input = [
      "Grammage : 145g/m²",
      "Source : https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent",
      "44 coloris disponibles",
    ].join("\n");

    expect(stripSourceFromDescription(input)).toBe(
      ["Grammage : 145g/m²", "44 coloris disponibles"].join("\n")
    );
  });

  it("removes standalone LMDT URLs", () => {
    expect(
      stripSourceFromDescription("https://www.lamaisonduteeshirt.com/produits/tee-shirts/so-11380/regent")
    ).toBe("");
  });

  it("accepts Source: without space before colon", () => {
    expect(stripSourceFromDescription("Source: http://example.com/test")).toBe("");
  });
});
