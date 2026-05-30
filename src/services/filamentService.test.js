import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../supabase", () => ({
  isSupabaseConfigured: false,
  getSupabase: vi.fn(),
}));

import {
  MOVEMENT_TYPES,
  STOCK_LEVEL,
  calcPricePerGram,
  calcPrintQuote,
  calcUsableWeightG,
  createFilament,
  createFilamentMovement,
  enrichFilament,
  getStockLevel,
  applyFilamentForPrint,
} from "./filamentService";

const baseFilament = {
  id: "fil-1",
  name: "PLA Noir",
  spoolWeightFullG: 1000,
  spoolWeightEmptyG: 200,
  remainingWeightG: 800,
  purchasePrice: 20,
  alertThresholdG: 100,
};

describe("filamentService calculations", () => {
  it("calcule le poids utilisable et le prix au gramme", () => {
    expect(calcUsableWeightG(baseFilament)).toBe(800);
    expect(calcPricePerGram(baseFilament)).toBeCloseTo(0.025, 4);
  });

  it("enrichit une bobine avec pourcentage et valeur restante", () => {
    const enriched = enrichFilament(baseFilament);
    expect(enriched.usableWeightG).toBe(800);
    expect(enriched.pricePerGram).toBeCloseTo(0.025, 4);
    expect(enriched.remainingPercent).toBe(100);
    expect(enriched.remainingValue).toBeCloseTo(20, 2);
    expect(enriched.stockLevel).toBe(STOCK_LEVEL.OK);
  });

  it("détermine le niveau de stock", () => {
    expect(getStockLevel({ remainingWeightG: 150, alertThresholdG: 100 })).toBe(STOCK_LEVEL.OK);
    expect(getStockLevel({ remainingWeightG: 80, alertThresholdG: 100 })).toBe(STOCK_LEVEL.LOW);
    expect(getStockLevel({ remainingWeightG: 0, alertThresholdG: 100 })).toBe(STOCK_LEVEL.CRITICAL);
  });

  it("calcule un devis impression", () => {
    const quote = calcPrintQuote({
      filament: baseFilament,
      grams: 100,
      hours: 2,
      electricityPricePerKwh: 0.2,
      powerKw: 0.2,
      marginCoef: 2,
      machineFee: 1,
      laborHours: 0.5,
      laborRate: 20,
      vatRate: 17,
    });

    expect(quote.filamentCost).toBeCloseTo(2.5, 2);
    expect(quote.electricityCost).toBeCloseTo(0.08, 2);
    expect(quote.laborCost).toBeCloseTo(10, 2);
    expect(quote.productionCost).toBeCloseTo(13.58, 2);
    expect(quote.totalHT).toBeCloseTo(27.16, 2);
    expect(quote.totalTTC).toBeGreaterThan(quote.totalHT);
  });
});

describe("filamentService stock movements", () => {
  let data;

  beforeEach(() => {
    data = createFilament({}, {
      name: "PLA Test",
      spoolWeightFullG: 1000,
      spoolWeightEmptyG: 200,
      purchasePrice: 16,
      alertThresholdG: 100,
    });
  });

  it("crée une bobine avec reste initial = poids utilisable", () => {
    const filament = data.filaments[0];
    expect(filament.remainingWeightG).toBe(800);
    expect(filament.pricePerGram).toBeCloseTo(0.02, 4);
  });

  it("applyFilamentForPrint déduit le stock et journalise le mouvement", () => {
    const result = applyFilamentForPrint(data, {
      filamentId: data.filaments[0].id,
      grams: 50,
      projectName: "Support téléphone",
    });

    expect(result.filament.remainingWeightG).toBe(750);
    expect(result.movement.type).toBe(MOVEMENT_TYPES.USE);
    expect(result.movement.quantityG).toBe(50);
    expect(result.movement.materialCost).toBeCloseTo(1, 2);
    expect(result.movement.stockAfterG).toBe(750);
    expect(result.filamentMovements).toHaveLength(1);
  });

  it("applyFilamentForPrint bloque si stock insuffisant", () => {
    expect(() =>
      applyFilamentForPrint(data, {
        filamentId: data.filaments[0].id,
        grams: 900,
        projectName: "Trop gros",
      })
    ).toThrow(/Stock insuffisant/i);
  });

  it("signale un stock sous le seuil après utilisation", () => {
    const lowStockData = createFilamentMovement(data, {
      filamentId: data.filaments[0].id,
      type: MOVEMENT_TYPES.USE,
      quantityG: 750,
      printJobName: "Gros print",
    });

    const result = applyFilamentForPrint(lowStockData, {
      filamentId: data.filaments[0].id,
      grams: 30,
      projectName: "Petit print",
    });

    expect(result.belowThreshold).toBe(true);
    expect(result.thresholdMessage).toMatch(/Alerte stock/i);
  });

  it("createFilamentMovement rejette une quantité nulle", () => {
    expect(() =>
      createFilamentMovement(data, {
        filamentId: data.filaments[0].id,
        type: MOVEMENT_TYPES.ADD,
        quantityG: 0,
      })
    ).toThrow(/supérieure à 0/i);
  });
});
