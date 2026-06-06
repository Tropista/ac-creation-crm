/**
 * Calcul laser CO2 — coûts et prix de vente.
 *
 * Portée volontaire :
 * - Matière et temps machine : linéaires avec la quantité (coût par pièce × qty).
 * - Préparation (MO) et frais de setup : une fois par commande, pas × qty.
 * - sortieAtelierBase : somme des 6 coûts (avant complexité).
 * - sortieAtelier : coût après complexité (avant marge/TVA).
 * - totalHT, totalTTC, marge, TVA : totaux commande.
 * - Champs *PerUnit* = total commande ÷ qty (répartition pour lecture, pas un second barème).
 */

export const MATERIAL_PRESETS = {
  Bois:         { costPerM2: 18, cutSpeed: 600, engraveSpeed: 2000 },
  Acrylique:    { costPerM2: 28, cutSpeed: 900, engraveSpeed: 2500 },
  Contreplaqué: { costPerM2: 15, cutSpeed: 550, engraveSpeed: 1800 },
  MDF:          { costPerM2: 12, cutSpeed: 500, engraveSpeed: 1800 },
  Cuir:         { costPerM2: 45, cutSpeed: 300, engraveSpeed: 1200 },
  Autre:        { costPerM2: 20, cutSpeed: 600, engraveSpeed: 2000 },
};

function n(value) {
  return Number(value || 0);
}

/** 0 ou vide = pas de surcoût (×1). Valeurs > 1 = majoration. */
export function resolveComplexityMultiplier(value) {
  const raw = n(value);
  return raw <= 0 ? 1 : raw;
}

export function computeLaserCalc(form) {
  const preset = MATERIAL_PRESETS[form.material] || MATERIAL_PRESETS.Autre;
  const width = Math.max(0, n(form.widthMm));
  const height = Math.max(0, n(form.heightMm));
  const areaMm2 = width * height;
  const areaM2 = areaMm2 / 1_000_000;
  const perimeterMm = 2 * (width + height);
  const qty = Math.max(1, n(form.quantity));

  const materialCostPerM2 =
    n(form.customMaterialCost) || preset.costPerM2;
  const materialCost = areaM2 * materialCostPerM2 * qty;

  let cutTime = n(form.cutTime);
  let engraveTime = n(form.engraveTime);

  if (form.autoEstimateTime) {
    cutTime = (perimeterMm / Math.max(1, preset.cutSpeed)) * 60;
    engraveTime = (areaMm2 / Math.max(1, preset.engraveSpeed)) * 60;
  }

  const machineSecondsPerUnit = cutTime + engraveTime;
  const totalMachineHours = (machineSecondsPerUnit * qty) / 3600;

  const machineHourlyCost =
    n(form.laserPrice) / Math.max(1, n(form.laserLifetimeHours));
  const machineCost = machineHourlyCost * totalMachineHours;
  const electricityCost =
    n(form.powerKw) * totalMachineHours * n(form.electricityPrice);
  const maintenanceCost = totalMachineHours * n(form.maintenancePerHour);

  const laborHours = n(form.preparationMinutes) / 60;
  const laborCost = laborHours * n(form.laborRate);
  const setupCost = n(form.setupFee);

  const variableCostPerUnit =
    materialCost / qty + machineCost / qty + electricityCost / qty + maintenanceCost / qty;
  const orderFixedCost = laborCost + setupCost;

  const sortieAtelierBase =
    materialCost +
    machineCost +
    electricityCost +
    maintenanceCost +
    laborCost +
    setupCost;

  const complexityMultiplier = resolveComplexityMultiplier(form.complexityFactor);
  const marginCoef = Math.max(1, n(form.marginCoef) || 1);
  const sortieAtelier = sortieAtelierBase * complexityMultiplier;
  const totalHT = sortieAtelier * marginCoef;
  const marginAmount = totalHT - sortieAtelier;
  const vatAmount = totalHT * (n(form.vatRate) / 100);
  const totalTTC = totalHT + vatAmount;
  const pricePerUnitHT = totalHT / qty;
  const pricePerUnitTTC = totalTTC / qty;
  const sortieAtelierBasePerUnit = sortieAtelierBase / qty;
  const sortieAtelierPerUnit = sortieAtelier / qty;

  return {
    areaM2,
    perimeterMm,
    cutTime,
    engraveTime,
    machineSecondsPerUnit,
    totalMachineHours,
    materialCostPerM2,
    materialCost,
    materialCostPerUnit: materialCost / qty,
    machineHourlyCost,
    machineCost,
    machineCostPerUnit: machineCost / qty,
    electricityCost,
    electricityCostPerUnit: electricityCost / qty,
    maintenanceCost,
    maintenanceCostPerUnit: maintenanceCost / qty,
    laborCost,
    setupCost,
    orderFixedCost,
    variableCostPerUnit,
    sortieAtelierBase,
    sortieAtelierBasePerUnit,
    sortieAtelier,
    sortieAtelierPerUnit,
    complexityMultiplier,
    marginCoef,
    costWithComplexity: sortieAtelier,
    marginAmount,
    marginAmountPerUnit: marginAmount / qty,
    totalHT,
    vatAmount,
    vatAmountPerUnit: vatAmount / qty,
    totalTTC,
    pricePerUnitHT,
    pricePerUnitTTC,
    qty,
  };
}

/** En-tête compact (carte résultat) : même portée sur les 3 lignes (/ pièce si qty > 1). */
export function getLaserCompactSummary(calc) {
  const perPiece = calc.qty > 1;
  const mainTTC = perPiece ? calc.pricePerUnitTTC : calc.totalTTC;
  const mainHT = perPiece ? calc.pricePerUnitHT : calc.totalHT;
  const mainSortie = perPiece ? calc.sortieAtelierPerUnit : calc.sortieAtelier;

  return [
    {
      key: "ttc",
      className: "laser-price",
      label: perPiece ? "Prix conseillé TTC / pièce" : "Prix conseillé TTC",
      main: mainTTC,
      sub: perPiece ? calc.totalTTC : null,
      subPrefix: "total commande",
      subClassName: "laser-price-order",
    },
    {
      key: "ht",
      className: "laser-total-ht",
      label: perPiece ? "Total HT / pièce" : "Total HT",
      main: mainHT,
      sub: perPiece ? calc.totalHT : null,
      subPrefix: "total commande HT",
    },
    {
      key: "sortie",
      className: "laser-unit-price laser-sortie-highlight",
      label: perPiece ? "Sortie d'atelier / pièce" : "Sortie d'atelier",
      main: mainSortie,
      sub: perPiece ? calc.sortieAtelier : null,
      subPrefix: "total commande",
    },
  ];
}
