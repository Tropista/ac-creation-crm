import { describe, expect, it } from "vitest";
import {
  enrichCatalogColors,
  resolveCatalogColorHex,
  resolveCatalogColorImageUrl,
  resolveCatalogColorLabel,
} from "./colorNameToHex.js";

describe("colorNameToHex", () => {
  it("maps common French color names", () => {
    expect(resolveCatalogColorHex("noir")).toBe("#1a1a1a");
    expect(resolveCatalogColorHex("blanc")).toBe("#ffffff");
    expect(resolveCatalogColorHex("marine")).toBe("#1e3a5f");
    expect(resolveCatalogColorHex("noir profond")).toBe("#0d0d0d");
    expect(resolveCatalogColorHex("french_marine")).toBe("#092a44");
    expect(resolveCatalogColorHex("royal")).toBe("#00569f");
    expect(resolveCatalogColorHex("gris_souris")).toBe("#42454c");
  });

  it("uses hex from color objects", () => {
    expect(resolveCatalogColorHex({ name: "Rouge", hex: "#ff0000" })).toBe("#ff0000");
    expect(resolveCatalogColorLabel({ name: "Rouge", hex: "#ff0000" })).toBe("Rouge");
    expect(resolveCatalogColorLabel("french_marine")).toBe("French Marine");
  });

  it("accepts raw hex strings", () => {
    expect(resolveCatalogColorHex("#abc")).toBe("#abc");
    expect(resolveCatalogColorHex("abc123")).toBe("#abc123");
  });

  it("maps common English LMDT color names", () => {
    expect(resolveCatalogColorHex("white")).toBe("#ffffff");
    expect(resolveCatalogColorHex("black")).toBe("#1a1a1a");
    expect(resolveCatalogColorHex("navy")).toBe("#19286b");
    expect(resolveCatalogColorHex("royal blue")).toBe("#00569f");
    expect(resolveCatalogColorHex("sport grey")).toBe("#9ca3ad");
    expect(resolveCatalogColorHex("fuchsia")).toBe("#ff00ff");
    expect(resolveCatalogColorHex("kelly green")).toBe("#00985a");
    expect(resolveCatalogColorHex("burgundy")).toBe("#620e2f");
    expect(resolveCatalogColorHex("turquoise")).toBe("#40e0d0");
  });

  it("enriches string-only colors with hex", () => {
    const enriched = enrichCatalogColors(["white", "black", { name: "Navy", hex: "#19286b" }]);
    expect(enriched[0]).toEqual({ name: "White", hex: "#ffffff" });
    expect(enriched[1]).toEqual({ name: "Black", hex: "#1a1a1a" });
    expect(enriched[2]).toEqual({ name: "Navy", hex: "#19286b" });
  });

  it("preserves imageUrl when enriching color objects", () => {
    const imageUrl = "https://media.lamaisonduteeshirt.com/example/color.jpg";
    expect(
      enrichCatalogColors([{ name: "blanc", hex: "#ffffff", imageUrl }])
    ).toEqual([{ name: "Blanc", hex: "#ffffff", imageUrl }]);
    expect(resolveCatalogColorImageUrl({ name: "Blanc", imageUrl })).toBe(imageUrl);
    expect(resolveCatalogColorImageUrl("blanc")).toBe("");
  });

  it("returns null for unknown names", () => {
    expect(resolveCatalogColorHex("couleur inexistante")).toBeNull();
  });
});
