import { describe, expect, it } from "vitest";
import {
  applyAutomaticProductionCosts,
  applyProductionMarginTemplate,
  buildProductionSheetFromLines,
  computeLineAutomaticProductionCosts,
  computeLineInternalCosts,
  syncQuoteProductionSheetFromLines,
} from "./quoteMarginAssistant.js";

describe("quoteMarginAssistant", () => {
  it("calcule le cout total interne et le prix conseille", () => {
    const result = computeLineInternalCosts(
      {
        productId: "shirt",
        quantity: 2,
        price: 25,
        materialCost: 4,
        laborMinutes: 30,
        laborHourlyRate: 20,
        machineCost: 3,
        subcontractingCost: 5,
        targetMarginRate: 60,
      },
      [{ id: "shirt", purchasePrice: 6 }]
    );

    expect(result.supportCost).toBe(12);
    expect(result.laborCost).toBe(10);
    expect(result.totalCost).toBe(34);
    expect(result.marginHT).toBe(16);
    expect(result.marginRate).toBe(32);
    expect(result.suggestedUnitPrice).toBe(42.5);
    expect(result.isLowMargin).toBe(true);
  });

  it("applique un modele de production a une ligne", () => {
    const line = applyProductionMarginTemplate({ description: "T-shirt" }, "tshirt-dtf-heart");

    expect(line.productionTemplateId).toBe("tshirt-dtf-heart");
    expect(line.technique).toBe("DTF");
    expect(line.emplacementMarquage).toBe("Poitrine");
    expect(line.materialCost).toBeGreaterThan(0);
    expect(line.laborMinutes).toBeGreaterThan(0);
  });

  it("calcule automatiquement la matiere, la machine et l'operateur", () => {
    const result = computeLineAutomaticProductionCosts({
      quantity: 2,
      printWidthCm: 20,
      printHeightCm: 10,
      materialPricePerM2: 50,
      machineMinutes: 12,
      machineHourlyRate: 30,
      laborMinutes: 15,
      laborHourlyRate: 20,
    });

    expect(result.surfaceM2).toBe(0.04);
    expect(result.materialCost).toBe(2);
    expect(result.machineCost).toBe(6);
    expect(result.operatorCost).toBe(5);
    expect(result.totalCost).toBe(13);
  });

  it("applique les couts automatiques sur une ligne", () => {
    const line = applyAutomaticProductionCosts({
      quantity: 1,
      printWidthCm: 10,
      printHeightCm: 10,
      materialPricePerM2: 40,
      machineMinutes: 6,
      machineHourlyRate: 20,
      laborMinutes: 12,
      laborHourlyRate: 25,
    });

    expect(line.materialCost).toBe(0.4);
    expect(line.machineCost).toBe(2);
    expect(line.laborMinutes).toBe(12);
    expect(line.laborHourlyRate).toBe(25);
  });

  it("genere une fiche atelier depuis les couts internes des lignes", () => {
    const sheet = buildProductionSheetFromLines(
      [
        {
          productId: "shirt",
          quantity: 2,
          technique: "DTF",
          materialCost: 4,
          laborMinutes: 30,
          machineCost: 3,
          subcontractingCost: 5,
        },
      ],
      [{ id: "shirt", purchasePrice: 6 }]
    );

    expect(sheet.material).toBe("DTF");
    expect(sheet.materialCost).toBe(16);
    expect(sheet.estimatedMinutes).toBe(30);
    expect(sheet.machineCost).toBe(3);
    expect(sheet.subcontractingCost).toBe(5);
  });

  it("synchronise une fiche atelier sans ecraser les valeurs deja saisies", () => {
    const quote = syncQuoteProductionSheetFromLines(
      {
        id: "q1",
        productionSheet: { estimatedMinutes: 12 },
        lines: [{ productId: "shirt", quantity: 1, laborMinutes: 30 }],
      },
      [{ id: "shirt", purchasePrice: 5 }]
    );

    expect(quote.productionSheet.estimatedMinutes).toBe(12);
    expect(quote.productionSheet.materialCost).toBe(5);
  });
});
