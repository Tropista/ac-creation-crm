const DEFAULT_LABOR_HOURLY_RATE = 18;
const DEFAULT_TARGET_MARGIN_RATE = 60;

export const PRODUCTION_MARGIN_TEMPLATES = [
  {
    id: "tshirt-dtf-heart",
    name: "T-shirt DTF coeur",
    technique: "DTF",
    emplacementMarquage: "Poitrine",
    materialCost: 1.5,
    laborMinutes: 6,
    machineCost: 0.8,
    targetMarginRate: 60,
  },
  {
    id: "tshirt-dtf-back",
    name: "T-shirt DTF dos",
    technique: "DTF",
    emplacementMarquage: "Dos",
    materialCost: 3.5,
    laborMinutes: 10,
    machineCost: 1.2,
    targetMarginRate: 60,
  },
  {
    id: "polo-embroidery-heart",
    name: "Polo broderie coeur",
    technique: "Broderie",
    emplacementMarquage: "Poitrine",
    materialCost: 1.2,
    laborMinutes: 18,
    machineCost: 2.5,
    targetMarginRate: 65,
  },
  {
    id: "mug-sublimation",
    name: "Mug sublimation",
    technique: "Sublimation",
    materialCost: 0.9,
    laborMinutes: 8,
    machineCost: 1,
    targetMarginRate: 60,
  },
  {
    id: "laser-small",
    name: "Laser petite gravure",
    technique: "Laser",
    materialCost: 1,
    laborMinutes: 8,
    machineCost: 2,
    targetMarginRate: 65,
  },
];

export function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function findLineProduct(line = {}, products = []) {
  return (products || []).find((product) => String(product.id) === String(line.productId)) || null;
}

export function computeLineSupportCost(line = {}, products = []) {
  const product = findLineProduct(line, products);
  const unitCost = Number(line.purchasePrice ?? line.unitCost ?? product?.purchasePrice ?? 0);
  return roundMoney(unitCost * Number(line.quantity || 0));
}

export function computeLineInternalCosts(line = {}, products = [], options = {}) {
  const quantity = Number(line.quantity || 0);
  const supportCost = computeLineSupportCost(line, products);
  const materialCost = roundMoney(Number(line.materialCost || 0));
  const laborMinutes = Number(line.laborMinutes || 0);
  const laborHourlyRate = Number(
    line.laborHourlyRate || options.laborHourlyRate || DEFAULT_LABOR_HOURLY_RATE
  );
  const laborCost = roundMoney((laborMinutes / 60) * laborHourlyRate);
  const machineCost = roundMoney(Number(line.machineCost || 0));
  const subcontractingCost = roundMoney(Number(line.subcontractingCost || 0));
  const totalCost = roundMoney(
    supportCost + materialCost + laborCost + machineCost + subcontractingCost
  );
  const revenueHT = roundMoney(quantity * Number(line.price || 0));
  const marginHT = roundMoney(revenueHT - totalCost);
  const marginRate = revenueHT > 0 ? Math.round((marginHT / revenueHT) * 1000) / 10 : 0;
  const targetMarginRate = Math.min(
    95,
    Math.max(0, Number(line.targetMarginRate || options.targetMarginRate || DEFAULT_TARGET_MARGIN_RATE))
  );
  const suggestedUnitPrice =
    quantity > 0 && totalCost > 0
      ? roundMoney(totalCost / quantity / Math.max(0.01, 1 - targetMarginRate / 100))
      : 0;

  return {
    supportCost,
    materialCost,
    laborMinutes,
    laborHourlyRate,
    laborCost,
    machineCost,
    subcontractingCost,
    totalCost,
    revenueHT,
    marginHT,
    marginRate,
    targetMarginRate,
    suggestedUnitPrice,
    hasCost: totalCost > 0.01,
    isLowMargin: revenueHT > 0 && marginRate < targetMarginRate,
  };
}

export function computeLinesInternalCost(lines = [], products = [], options = {}) {
  return roundMoney(
    (lines || []).reduce(
      (sum, line) => sum + computeLineInternalCosts(line, products, options).totalCost,
      0
    )
  );
}

export function computeLinesSupportCost(lines = [], products = []) {
  return roundMoney(
    (lines || []).reduce((sum, line) => sum + computeLineSupportCost(line, products), 0)
  );
}

export function findProductionMarginTemplate(templateId) {
  return PRODUCTION_MARGIN_TEMPLATES.find((template) => template.id === templateId) || null;
}

export function applyProductionMarginTemplate(line = {}, templateId) {
  const template = findProductionMarginTemplate(templateId);
  if (!template) return { ...line, productionTemplateId: "" };

  return {
    ...line,
    productionTemplateId: template.id,
    technique: line.technique || template.technique || "",
    emplacementMarquage: line.emplacementMarquage || template.emplacementMarquage || "",
    materialCost: line.materialCost || template.materialCost || "",
    laborMinutes: line.laborMinutes || template.laborMinutes || "",
    machineCost: line.machineCost || template.machineCost || "",
    targetMarginRate: line.targetMarginRate || template.targetMarginRate || "",
  };
}

export function buildProductionSheetFromLines(lines = [], products = []) {
  const totals = (lines || []).reduce(
    (acc, line) => {
      const costs = computeLineInternalCosts(line, products);
      acc.materialCost += costs.supportCost + costs.materialCost;
      acc.estimatedMinutes += costs.laborMinutes;
      acc.machineCost += costs.machineCost;
      acc.subcontractingCost += costs.subcontractingCost;
      if (line.technique && !acc.techniques.includes(line.technique)) {
        acc.techniques.push(line.technique);
      }
      return acc;
    },
    { materialCost: 0, estimatedMinutes: 0, machineCost: 0, subcontractingCost: 0, techniques: [] }
  );

  return {
    material: totals.techniques.join(", "),
    materialCost: roundMoney(totals.materialCost),
    estimatedMaterialCost: roundMoney(totals.materialCost),
    estimatedMinutes: roundMoney(totals.estimatedMinutes),
    machineCost: roundMoney(totals.machineCost),
    subcontractingCost: roundMoney(totals.subcontractingCost),
    estimatedSubcontractingCost: roundMoney(totals.subcontractingCost),
  };
}

export function syncQuoteProductionSheetFromLines(quote = {}, products = []) {
  const generated = buildProductionSheetFromLines(quote.lines || [], products);
  const current = quote.productionSheet || {};
  const hasGeneratedCosts =
    generated.materialCost > 0 ||
    generated.estimatedMinutes > 0 ||
    generated.machineCost > 0 ||
    generated.subcontractingCost > 0;

  if (!hasGeneratedCosts) return quote;

  return {
    ...quote,
    productionSheet: {
      ...generated,
      ...current,
      materialCost: Number(current.materialCost || 0) > 0 ? current.materialCost : generated.materialCost,
      estimatedMaterialCost:
        Number(current.estimatedMaterialCost || 0) > 0
          ? current.estimatedMaterialCost
          : generated.estimatedMaterialCost,
      estimatedMinutes:
        Number(current.estimatedMinutes || 0) > 0 ? current.estimatedMinutes : generated.estimatedMinutes,
      machineCost: Number(current.machineCost || 0) > 0 ? current.machineCost : generated.machineCost,
      subcontractingCost:
        Number(current.subcontractingCost || 0) > 0
          ? current.subcontractingCost
          : generated.subcontractingCost,
      estimatedSubcontractingCost:
        Number(current.estimatedSubcontractingCost || 0) > 0
          ? current.estimatedSubcontractingCost
          : generated.estimatedSubcontractingCost,
    },
  };
}
