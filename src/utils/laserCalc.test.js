import { describe, expect, it } from "vitest";
import {
  computeLaserCalc,
  getLaserCompactSummary,
  resolveComplexityMultiplier,
} from "./laserCalc";

const baseForm = {
  projectName: "Test",
  material: "Bois",
  customMaterialCost: 18,
  widthMm: 200,
  heightMm: 150,
  autoEstimateTime: true,
  cutTime: 0,
  engraveTime: 0,
  laserPrice: 3500,
  laserLifetimeHours: 4000,
  powerKw: 0.85,
  electricityPrice: 0.2,
  maintenancePerHour: 0.15,
  setupFee: 5,
  preparationMinutes: 10,
  laborRate: 25,
  complexityFactor: 1,
  quantity: 5,
  marginCoef: 2,
  vatRate: 17,
};



describe("computeLaserCalc", () => {

  it("aligne sortie atelier commande et prix unitaire (qty > 1)", () => {

    const calc = computeLaserCalc(baseForm);



    expect(calc.sortieAtelierPerUnit).toBeCloseTo(calc.sortieAtelier / calc.qty, 4);

    expect(calc.pricePerUnitHT).toBeCloseTo(calc.totalHT / calc.qty, 4);

    expect(calc.pricePerUnitTTC).toBeCloseTo(calc.totalTTC / calc.qty, 4);

    expect(calc.pricePerUnitHT).toBeGreaterThanOrEqual(calc.sortieAtelierPerUnit);

    expect(calc.pricePerUnitTTC).toBeGreaterThanOrEqual(calc.sortieAtelierPerUnit);

  });



  it("ne multiplie pas setup et MO par la quantité", () => {

    const one = computeLaserCalc({ ...baseForm, quantity: 1 });

    const five = computeLaserCalc({ ...baseForm, quantity: 5 });



    expect(five.laborCost).toBe(one.laborCost);

    expect(five.setupCost).toBe(one.setupCost);

    expect(five.materialCost).toBeCloseTo(one.materialCost * 5, 4);

  });



  it("expose un en-tête compact cohérent (/ pièce + sous-totaux commande)", () => {

    const calc = computeLaserCalc(baseForm);

    const rows = getLaserCompactSummary(calc);



    expect(rows).toHaveLength(3);

    expect(rows[0].main).toBeCloseTo(calc.pricePerUnitTTC, 4);

    expect(rows[0].sub).toBeCloseTo(calc.totalTTC, 4);

    expect(rows[1].main).toBeCloseTo(calc.pricePerUnitHT, 4);

    expect(rows[1].sub).toBeCloseTo(calc.totalHT, 4);

    expect(rows[2].main).toBeCloseTo(calc.sortieAtelierPerUnit, 4);

    expect(rows[2].sub).toBeCloseTo(calc.sortieAtelier, 4);

    expect(rows[2].main).toBeLessThan(rows[2].sub);

    expect(rows[0].label).toContain("/ pièce");

    expect(rows[2].label).toBe("Sortie d'atelier / pièce");

  });



  it("en-tête compact en qty 1 sans sous-ligne commande", () => {

    const calc = computeLaserCalc({

      ...baseForm,

      quantity: 1,

      marginCoef: 1,

    });

    const rows = getLaserCompactSummary(calc);



    expect(rows.every((r) => r.sub == null)).toBe(true);

    expect(rows[0].main).toBeCloseTo(calc.totalTTC, 4);

    expect(rows[1].main).toBeCloseTo(calc.totalHT, 4);

    expect(rows[2].main).toBeCloseTo(calc.sortieAtelier, 4);

    expect(rows[1].main).toBeCloseTo(rows[2].main, 4);

  });



  it("qty 1 : total HT = sortie × marge", () => {

    const form = {

      ...baseForm,

      widthMm: 480,

      heightMm: 500,

      customMaterialCost: 20,

      quantity: 1,

      marginCoef: 1,

    };

    const calc = computeLaserCalc(form);

    const rows = getLaserCompactSummary(calc);



    expect(calc.sortieAtelierBase).toBeGreaterThan(13.5);

    expect(calc.sortieAtelier).toBeCloseTo(calc.sortieAtelierBase, 4);

    expect(calc.totalHT).toBeCloseTo(calc.sortieAtelier * calc.marginCoef, 4);

    expect(rows[1].main).toBeCloseTo(calc.sortieAtelier, 2);

    expect(rows[1].main).not.toBeCloseTo(calc.sortieAtelier / 5, 2);

  });



  it("qty > 1 : en-tête compact aligne pièce et total commande", () => {

    const calc = computeLaserCalc({ ...baseForm, marginCoef: 1 });

    const rows = getLaserCompactSummary(calc);



    expect(rows[1].main).toBeCloseTo(calc.totalHT / calc.qty, 4);

    expect(rows[1].sub).toBeCloseTo(calc.totalHT, 4);

    expect(rows[2].main).toBeCloseTo(calc.sortieAtelier / calc.qty, 4);

    expect(rows[2].sub).toBeCloseTo(calc.sortieAtelier, 4);

    expect(rows[1].main).not.toBeCloseTo(calc.sortieAtelier, 2);

  });



  it("applique marge et TVA sur le total commande", () => {

    const calc = computeLaserCalc(baseForm);



    expect(calc.totalHT).toBeCloseTo(calc.sortieAtelier * baseForm.marginCoef, 4);

    expect(calc.totalTTC).toBeCloseTo(

      calc.totalHT * (1 + baseForm.vatRate / 100),

      4

    );

    expect(calc.marginAmount).toBeCloseTo(calc.totalHT - calc.sortieAtelier, 4);
  });

  it("facteur complexité 0 ou vide = neutre (identique à 1)", () => {
    const withOne = computeLaserCalc({ ...baseForm, quantity: 1, complexityFactor: 1 });
    const withZero = computeLaserCalc({ ...baseForm, quantity: 1, complexityFactor: 0 });
    const withEmpty = computeLaserCalc({ ...baseForm, quantity: 1, complexityFactor: "" });

    expect(withZero.complexityMultiplier).toBe(1);
    expect(withEmpty.complexityMultiplier).toBe(1);
    expect(withZero.sortieAtelier).toBeCloseTo(withOne.sortieAtelier, 4);
    expect(withZero.totalHT).toBeCloseTo(withOne.totalHT, 4);
    expect(withZero.marginAmount).toBeCloseTo(withOne.marginAmount, 4);
  });

  it("facteur complexité 2 double la sortie d'atelier avant marge", () => {
    const base = computeLaserCalc({ ...baseForm, quantity: 1, complexityFactor: 1, marginCoef: 1 });
    const doubled = computeLaserCalc({ ...baseForm, quantity: 1, complexityFactor: 2, marginCoef: 1 });

    expect(doubled.sortieAtelierBase).toBeCloseTo(base.sortieAtelierBase, 4);
    expect(doubled.sortieAtelier).toBeCloseTo(base.sortieAtelierBase * 2, 4);
    expect(doubled.totalHT).toBeCloseTo(doubled.sortieAtelier, 4);
    expect(doubled.marginAmount).toBeCloseTo(0, 4);
  });

  it("resolveComplexityMultiplier traite 0 et valeurs négatives comme neutre", () => {
    expect(resolveComplexityMultiplier(0)).toBe(1);
    expect(resolveComplexityMultiplier("")).toBe(1);
    expect(resolveComplexityMultiplier(2)).toBe(2);
    expect(resolveComplexityMultiplier(1.5)).toBe(1.5);
  });
});

