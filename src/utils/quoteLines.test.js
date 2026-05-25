import { describe, expect, it } from "vitest";
import {
  formatLineDescriptionWithProduction,
  formatLineProductionLabel,
  lineHasProductionDetails,
  summarizeQuoteProductionLines,
} from "./quoteLines.js";

describe("quoteLines helpers", () => {
  it("formate les détails de production d'une ligne", () => {
    const line = {
      description: "T-shirt",
      taille: "L",
      couleur: "Noir",
      emplacementMarquage: "Poitrine",
      technique: "DTF",
    };

    expect(lineHasProductionDetails(line)).toBe(true);
    expect(formatLineProductionLabel(line)).toContain("Taille : L");
    expect(formatLineProductionLabel(line)).toContain("DTF");
    expect(formatLineDescriptionWithProduction(line)).toContain("T-shirt");
  });

  it("résume les lignes avec détails atelier", () => {
    const lines = [
      { description: "Polo", taille: "M", couleur: "Blanc" },
      { description: "Frais de port" },
    ];

    expect(summarizeQuoteProductionLines(lines)).toEqual([
      "Polo — Taille : M · Couleur : Blanc",
    ]);
  });
});
