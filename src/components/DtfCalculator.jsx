import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast";
import { buildCalculatorQuoteLine, openQuoteFromCalculator } from "../utils/quoteDraft";
import "../styles/dtf-calculator.css";

const GARMENT_PRESETS = {
  "T-shirt": { complexityFactor: 1, whiteMultiplier: 1.15 },
  Veste: { complexityFactor: 1.05, whiteMultiplier: 1.2 },
  Pull: { complexityFactor: 1.05, whiteMultiplier: 1.25 },
  "Hoodie / Sweat": { complexityFactor: 1.08, whiteMultiplier: 1.35 },
  Polo: { complexityFactor: 1, whiteMultiplier: 1.15 },
  Casquette: { complexityFactor: 1.1, whiteMultiplier: 1.2 },
  "Sac tote": { complexityFactor: 1, whiteMultiplier: 1.1 },
  Autre: { complexityFactor: 1, whiteMultiplier: 1.2 },
};

const COVERAGE_PRESETS = {
  "Logo / texte (léger)": { cmyk: 1.5, white: 8, powder: 8 },
  Moyen: { cmyk: 3, white: 15, powder: 10 },
  "Plein format / dense": { cmyk: 6, white: 28, powder: 15 },
};

const MAX_WIDTH_CM = 30;
const ROLL_WIDTH_M = MAX_WIDTH_CM / 100;

// MyColor 30 cm — valeurs métier par défaut
const FILM_COST_PER_LINEAR_M = 49 / 100; // rouleau 100 m à 49 €
const FILM_COST_PER_M2 = FILM_COST_PER_LINEAR_M / ROLL_WIDTH_M;
const INK_KIT_EUR = 289;
const INK_KIT_ML = 6000; // 2 L blanc + 1 L × CMYK
const INK_COST_PER_ML = INK_KIT_EUR / INK_KIT_ML;
const INK_ML_CMYK_DEFAULT = 3;
const INK_ML_WHITE_DEFAULT = 15;
const POWDER_GM2_DEFAULT = 10;
const INK_COST_PER_M2_DEFAULT =
  (INK_ML_CMYK_DEFAULT + INK_ML_WHITE_DEFAULT) * INK_COST_PER_ML;

function euro(value) {
  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function n(value) {
  return Number(value || 0);
}

export default function DtfCalculator({ data, setData, logActivity }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    projectName: "",
    garment: "T-shirt",
    coverageType: "Moyen",

    widthCm: 20,
    heightCm: 15,
    quantity: 1,

    filmPricingMode: "linear",
    filmCostPerM2: Number(FILM_COST_PER_M2.toFixed(2)),
    filmCostPerLinearM: FILM_COST_PER_LINEAR_M,
    filmWasteLinearM: 1,

    inkPricingMode: "ml",
    inkCostPerM2: Number(INK_COST_PER_M2_DEFAULT.toFixed(2)),
    inkMlPerM2Cmyk: INK_ML_CMYK_DEFAULT,
    inkMlPerM2White: INK_ML_WHITE_DEFAULT,
    inkCostPerMl: Number(INK_COST_PER_ML.toFixed(4)),
    usesWhiteInk: true,

    powderPricingMode: "gm2",
    powderGm2: POWDER_GM2_DEFAULT,
    powderPricePerKg: 18,
    powderCostPerTransfer: 0.15,

    autoEstimateTime: true,
    printSpeedM2PerHour: 4,
    printMinutes: 0,
    powderMinutesPerUnit: 0.5,
    powderMinutes: 0,

    machineLabel: "MyColor 30cm + poudreuse",
    printerPrice: 7000,
    shakerPrice: 0,
    machineLifetimeHours: 6000,
    powerKw: 0.55,
    electricityPrice: 0.2,
    maintenancePerHour: 0.12,

    preparationMinutes: 0,
    includePressing: false,
    pressingSecondsPerUnit: 20,
    laborRate: 25,
    complexityFactor: 1,

    marginCoef: 2,
    vatRate: 17,
  });

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyGarmentPreset(garment) {
    const preset = GARMENT_PRESETS[garment] || GARMENT_PRESETS.Autre;
    setForm((current) => ({
      ...current,
      garment,
      complexityFactor: preset.complexityFactor,
    }));
  }

  function applyCoveragePreset(coverageType) {
    const preset = COVERAGE_PRESETS[coverageType] || COVERAGE_PRESETS.Moyen;
    setForm((current) => ({
      ...current,
      coverageType,
      inkMlPerM2Cmyk: preset.cmyk,
      inkMlPerM2White: preset.white,
      powderGm2: preset.powder,
      inkCostPerM2: Number(
        ((preset.cmyk + preset.white) * INK_COST_PER_ML).toFixed(2)
      ),
    }));
  }

  const calc = useMemo(() => {
    const preset = GARMENT_PRESETS[form.garment] || GARMENT_PRESETS.Autre;
    const widthCm = Math.min(MAX_WIDTH_CM, Math.max(0, n(form.widthCm)));
    const heightCm = Math.max(0, n(form.heightCm));
    const areaCm2 = widthCm * heightCm;
    const areaM2 = areaCm2 / 10_000;
    const qty = Math.max(1, n(form.quantity));
    const totalAreaM2 = areaM2 * qty;
    const linearMetersUsed = (heightCm / 100) * qty;
    const linearWasteM = n(form.filmWasteLinearM);

    let filmCost;
    if (form.filmPricingMode === "linear") {
      filmCost =
        (linearMetersUsed + linearWasteM) * n(form.filmCostPerLinearM);
    } else {
      const wasteAreaM2 = linearWasteM * ROLL_WIDTH_M;
      filmCost = (totalAreaM2 + wasteAreaM2) * n(form.filmCostPerM2);
    }

    const whiteMultiplier = form.usesWhiteInk ? preset.whiteMultiplier : 1;
    let inkCost;
    if (form.inkPricingMode === "ml") {
      const cmykMl = totalAreaM2 * n(form.inkMlPerM2Cmyk);
      const whiteMl = form.usesWhiteInk
        ? totalAreaM2 * n(form.inkMlPerM2White) * whiteMultiplier
        : 0;
      inkCost = (cmykMl + whiteMl) * n(form.inkCostPerMl);
    } else {
      inkCost = totalAreaM2 * n(form.inkCostPerM2) * whiteMultiplier;
    }

    let powderCost;
    if (form.powderPricingMode === "transfer") {
      powderCost = qty * n(form.powderCostPerTransfer);
    } else {
      const powderKg = (totalAreaM2 * n(form.powderGm2)) / 1000;
      powderCost = powderKg * n(form.powderPricePerKg);
    }

    let printMinutesPerUnit = n(form.printMinutes);
    let powderMinutesPerUnit = n(form.powderMinutesPerUnit);

    if (form.autoEstimateTime) {
      const printHoursPerUnit = areaM2 / Math.max(0.01, n(form.printSpeedM2PerHour));
      printMinutesPerUnit = printHoursPerUnit * 60;
      powderMinutesPerUnit = Math.max(0.3, areaM2 * 8);
    }

    const machineMinutesPerUnit = printMinutesPerUnit + powderMinutesPerUnit;
    const totalMachineHours = (machineMinutesPerUnit * qty) / 60;

    const machineHourlyCost =
      (n(form.printerPrice) + n(form.shakerPrice)) /
      Math.max(1, n(form.machineLifetimeHours));
    const machineCost = machineHourlyCost * totalMachineHours;
    const electricityCost =
      n(form.powerKw) * totalMachineHours * n(form.electricityPrice);
    const maintenanceCost = totalMachineHours * n(form.maintenancePerHour);

    const laborMinutes =
      n(form.preparationMinutes) +
      (form.includePressing ? (n(form.pressingSecondsPerUnit) * qty) / 60 : 0);
    const laborCost = (laborMinutes / 60) * n(form.laborRate);

    const subtotal =
      filmCost +
      inkCost +
      powderCost +
      machineCost +
      electricityCost +
      maintenanceCost +
      laborCost;

    const complexityMultiplier = Math.max(0.1, n(form.complexityFactor));
    const costWithComplexity = subtotal * complexityMultiplier;
    const totalHT = costWithComplexity * n(form.marginCoef);
    const marginAmount = totalHT - costWithComplexity;
    const vatAmount = totalHT * (n(form.vatRate) / 100);
    const totalTTC = totalHT + vatAmount;
    const pricePerUnitHT = totalHT / qty;
    const pricePerUnitTTC = totalTTC / qty;

    return {
      widthCm,
      heightCm,
      areaM2,
      totalAreaM2,
      qty,
      filmCost,
      inkCost,
      powderCost,
      printMinutesPerUnit,
      powderMinutesPerUnit,
      machineMinutesPerUnit,
      totalMachineHours,
      machineHourlyCost,
      machineCost,
      electricityCost,
      maintenanceCost,
      laborCost,
      subtotal,
      complexityMultiplier,
      marginAmount,
      totalHT,
      vatAmount,
      totalTTC,
      pricePerUnitHT,
      pricePerUnitTTC,
      whiteMultiplier,
    };
  }, [form]);

  function copySummary() {
    const text = `Calcul DTF MyColor 30cm - ${form.projectName || "Projet"}

Vêtement : ${form.garment}
Type de couverture : ${form.coverageType}
Dimensions : ${calc.widthCm} × ${calc.heightCm} cm (max ${MAX_WIDTH_CM} cm)
Surface / pièce : ${calc.areaM2.toFixed(4)} m²
Surface totale : ${calc.totalAreaM2.toFixed(4)} m²
Machine : ${form.machineLabel}
Quantité : ${calc.qty}
Encre blanche : ${form.usesWhiteInk ? "Oui" : "Non"}

Temps impression / pièce : ${calc.printMinutesPerUnit.toFixed(1)} min
Temps poudreuse / pièce : ${calc.powderMinutesPerUnit.toFixed(1)} min
Temps machine total : ${calc.totalMachineHours.toFixed(2)} h

Coût film DTF : ${euro(calc.filmCost)}
Coût encre : ${euro(calc.inkCost)}
Coût poudre adhésive : ${euro(calc.powderCost)}
Amortissement machine : ${euro(calc.machineCost)}
Électricité : ${euro(calc.electricityCost)}
Maintenance : ${euro(calc.maintenanceCost)}
Main-d'œuvre : ${euro(calc.laborCost)}
Complexité : ×${calc.complexityMultiplier}
Coefficient : ×${form.marginCoef}
Marge : ${euro(calc.marginAmount)}

Total HT : ${euro(calc.totalHT)}
Prix unitaire HT : ${euro(calc.pricePerUnitHT)}
TVA : ${euro(calc.vatAmount)}
Prix conseillé TTC : ${euro(calc.totalTTC)}
Prix unitaire TTC : ${euro(calc.pricePerUnitTTC)}`;

    navigator.clipboard.writeText(text);
    showToast("Calcul copié dans le presse-papier.", "success");
  }

  function createProduct() {
    if (!form.projectName.trim()) {
      showToast("Nom du projet manquant", "error");
      return;
    }

    const nextNumber = (data.products || []).length + 1;
    const sku = `DTF-${String(nextNumber).padStart(4, "0")}`;

    const product = {
      id: crypto.randomUUID(),
      sku,
      name: form.projectName.trim(),
      description: `Transfert DTF MyColor 30cm

Vêtement :
${form.garment}

Type de couverture :
${form.coverageType}

Dimensions :
${calc.widthCm} × ${calc.heightCm} cm

Machine :
${form.machineLabel}

Quantité :
${calc.qty}

Encre blanche :
${form.usesWhiteInk ? "Oui" : "Non"}

Détail calcul :
Film DTF : ${euro(calc.filmCost)}
Encre : ${euro(calc.inkCost)}
Poudre adhésive : ${euro(calc.powderCost)}
Amortissement machine : ${euro(calc.machineCost)}
Électricité : ${euro(calc.electricityCost)}
Maintenance : ${euro(calc.maintenanceCost)}
Main-d'œuvre : ${euro(calc.laborCost)}
Complexité : ×${calc.complexityMultiplier}
Coefficient : ×${form.marginCoef}
Marge : ${euro(calc.marginAmount)}
Total HT : ${euro(calc.totalHT)}
Prix unitaire HT : ${euro(calc.pricePerUnitHT)}
TVA : ${euro(calc.vatAmount)}
TTC conseillé : ${euro(calc.totalTTC)}`,
      category: "DTF",
      price: Number(calc.totalHT || 0),
      stock: 0,
      createdAt: new Date().toISOString(),
    };

    setData({
      ...data,
      products: [...(data.products || []), product],
    });

    logActivity?.({
      action: "Produit DTF créé",
      target: product.name,
      details: euro(calc.totalHT),
    });

    showToast("Produit créé dans Produits.", "success");
  }

  function createQuote() {
    const label =
      form.projectName.trim() ||
      `DTF ${form.garment} ${calc.widthCm}×${calc.heightCm} cm`;

    openQuoteFromCalculator(navigate, {
      source: "calculateur DTF",
      lines: [
        buildCalculatorQuoteLine({
          description: `${label}

Vêtement : ${form.garment}
Couverture : ${form.coverageType}
Dimensions : ${calc.widthCm} × ${calc.heightCm} cm
Machine : ${form.machineLabel}`,
          quantity: calc.qty,
          priceHT: calc.pricePerUnitHT,
          sku: "DTF-CALC",
          category: "DTF",
        }),
      ],
    });
  }

  return (
    <section className="dtf-page">
      <div className="page-header">
        <div>
          <h2>Calculateur DTF MyColor 30cm</h2>
          <p>
            Estimation pro avec film, encre CMYK + blanc, poudreuse, amortissement
            machine, électricité, main-d&apos;œuvre et marge.
          </p>
        </div>
      </div>

      <div className="dtf-layout">
        <form className="card dtf-form">
          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>🧩</span>
              <strong>Projet</strong>
            </div>

            <div className="dtf-grid">
              <label>
                Nom du projet
                <input
                  value={form.projectName}
                  onChange={(e) => update("projectName", e.target.value)}
                  placeholder="Ex : Logo équipe sportive"
                />
              </label>

              <label>
                Type de vêtement
                <select
                  value={form.garment}
                  onChange={(e) => applyGarmentPreset(e.target.value)}
                >
                  {Object.keys(GARMENT_PRESETS).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>

              <label>
                Quantité (transferts)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => update("quantity", e.target.value)}
                />
              </label>

              <label className="dtf-checkbox">
                <input
                  type="checkbox"
                  checked={form.usesWhiteInk}
                  onChange={(e) => update("usesWhiteInk", e.target.checked)}
                />
                Couche blanche (encre blanche)
              </label>
            </div>
          </div>

          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>📐</span>
              <strong>Dimensions impression</strong>
            </div>

            <div className="dtf-grid">
              <label>
                Largeur (cm, max {MAX_WIDTH_CM})
                <input
                  type="number"
                  min="0"
                  max={MAX_WIDTH_CM}
                  step="0.1"
                  value={form.widthCm}
                  onChange={(e) => update("widthCm", e.target.value)}
                />
              </label>

              <label>
                Hauteur (cm)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.heightCm}
                  onChange={(e) => update("heightCm", e.target.value)}
                />
              </label>

              <label>
                Surface / pièce
                <input value={`${calc.areaM2.toFixed(4)} m²`} readOnly />
              </label>

              <label>
                Largeur rouleau
                <input value={`${MAX_WIDTH_CM} cm (${ROLL_WIDTH_M} m)`} readOnly />
              </label>
            </div>
          </div>

          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>🎞️</span>
              <strong>Film DTF</strong>
            </div>

            <div className="dtf-grid">
              <label>
                Mode tarification film
                <select
                  value={form.filmPricingMode}
                  onChange={(e) => update("filmPricingMode", e.target.value)}
                >
                  <option value="m2">€/m²</option>
                  <option value="linear">€/mètre linéaire (30 cm)</option>
                </select>
              </label>

              {form.filmPricingMode === "m2" ? (
                <label>
                  Coût film (€/m²)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.filmCostPerM2}
                    onChange={(e) => update("filmCostPerM2", e.target.value)}
                  />
                  <span className="dtf-hint">
                    Dérivé : 49 € / 100 m sur rouleau 30 cm
                  </span>
                </label>
              ) : (
                <label>
                  Coût film (€/m linéaire)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.filmCostPerLinearM}
                    onChange={(e) => update("filmCostPerLinearM", e.target.value)}
                  />
                  <span className="dtf-hint">
                    Rouleau 100 m à 49 € → 0,49 €/m (30 cm)
                  </span>
                </label>
              )}

              <label>
                Gaspillage film (m linéaire / job)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.filmWasteLinearM}
                  onChange={(e) => update("filmWasteLinearM", e.target.value)}
                />
                <span className="dtf-hint">
                  +1 m ajouté une fois par calcul (par job), pas par pièce
                </span>
              </label>
            </div>
          </div>

          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>🎨</span>
              <strong>Encre CMYK + blanc</strong>
            </div>

            <div className="dtf-grid">
              <label>
                Type de couverture
                <select
                  value={form.coverageType}
                  onChange={(e) => applyCoveragePreset(e.target.value)}
                >
                  {Object.keys(COVERAGE_PRESETS).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
                <span className="dtf-hint">
                  Préremplit CMYK, blanc et poudre (ml/g par m²)
                </span>
              </label>

              <label>
                Mode tarification encre
                <select
                  value={form.inkPricingMode}
                  onChange={(e) => update("inkPricingMode", e.target.value)}
                >
                  <option value="m2">€/m² couverture</option>
                  <option value="ml">€/ml</option>
                </select>
              </label>

              {form.inkPricingMode === "m2" ? (
                <label>
                  Coût encre (€/m²)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.inkCostPerM2}
                    onChange={(e) => update("inkCostPerM2", e.target.value)}
                  />
                  <span className="dtf-hint">
                    Estimation — à ajuster selon vos mesures réelles
                  </span>
                </label>
              ) : (
                <>
                  <label>
                    Consommation CMYK (ml/m²)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.inkMlPerM2Cmyk}
                      onChange={(e) => update("inkMlPerM2Cmyk", e.target.value)}
                    />
                    <span className="dtf-hint">
                      Léger ~1,5 · moyen ~3 · dense ~6 ml/m²
                    </span>
                  </label>

                  <label>
                    Consommation blanc (ml/m²)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.inkMlPerM2White}
                      onChange={(e) => update("inkMlPerM2White", e.target.value)}
                      disabled={!form.usesWhiteInk}
                    />
                    <span className="dtf-hint">
                      Léger ~8 · moyen ~15 · dense ~28 ml/m²
                    </span>
                  </label>

                  <label>
                    Coût encre (€/ml)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.inkCostPerMl}
                      onChange={(e) => update("inkCostPerMl", e.target.value)}
                    />
                    <span className="dtf-hint">
                      Kit 289 € / 6 L (2 L blanc + CMYK)
                    </span>
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>✨</span>
              <strong>Poudre adhésive (poudreuse)</strong>
            </div>

            <div className="dtf-grid">
              <label>
                Mode tarification poudre
                <select
                  value={form.powderPricingMode}
                  onChange={(e) => update("powderPricingMode", e.target.value)}
                >
                  <option value="gm2">g/m²</option>
                  <option value="transfer">€/transfert</option>
                </select>
              </label>

              {form.powderPricingMode === "gm2" ? (
                <>
                  <label>
                    Consommation (g/m²)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.powderGm2}
                      onChange={(e) => update("powderGm2", e.target.value)}
                    />
                    <span className="dtf-hint">
                      Léger ~8 · moyen ~10 · dense ~15 g/m²
                    </span>
                  </label>

                  <label>
                    Prix poudre (€/kg)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.powderPricePerKg}
                      onChange={(e) => update("powderPricePerKg", e.target.value)}
                    />
                  </label>
                </>
              ) : (
                <label>
                  Coût poudre (€/transfert)
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.powderCostPerTransfer}
                    onChange={(e) => update("powderCostPerTransfer", e.target.value)}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>⏱️</span>
              <strong>Temps de production</strong>
            </div>

            <div className="dtf-grid">
              <label className="dtf-checkbox">
                <input
                  type="checkbox"
                  checked={form.autoEstimateTime}
                  onChange={(e) => update("autoEstimateTime", e.target.checked)}
                />
                Estimer automatiquement (surface + vitesse)
              </label>

              <label>
                Vitesse impression (m²/h)
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={form.printSpeedM2PerHour}
                  disabled={!form.autoEstimateTime}
                  onChange={(e) => update("printSpeedM2PerHour", e.target.value)}
                />
              </label>

              <label>
                Temps impression (min / pièce)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.printMinutes}
                  disabled={form.autoEstimateTime}
                  onChange={(e) => update("printMinutes", e.target.value)}
                />
              </label>

              <label>
                Temps poudreuse (min / pièce)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={
                    form.autoEstimateTime
                      ? calc.powderMinutesPerUnit.toFixed(1)
                      : form.powderMinutesPerUnit
                  }
                  disabled={form.autoEstimateTime}
                  onChange={(e) => update("powderMinutesPerUnit", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>🖨️</span>
              <strong>MyColor 30cm + poudreuse</strong>
            </div>

            <div className="dtf-grid">
              <label>
                Machine
                <input value={form.machineLabel} readOnly />
              </label>

              <label>
                Prix machine (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.printerPrice}
                  onChange={(e) => update("printerPrice", e.target.value)}
                />
                <span className="dtf-hint">
                  Imprimante + poudreuse — 7 000 € par défaut
                </span>
              </label>

              <label>
                Complément poudreuse (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.shakerPrice}
                  onChange={(e) => update("shakerPrice", e.target.value)}
                />
                <span className="dtf-hint">
                  Laisser à 0 si inclus dans le prix machine
                </span>
              </label>

              <label>
                Durée de vie (h)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.machineLifetimeHours}
                  onChange={(e) => update("machineLifetimeHours", e.target.value)}
                />
              </label>

              <label>
                Puissance moyenne (kW)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.powerKw}
                  onChange={(e) => update("powerKw", e.target.value)}
                />
              </label>

              <label>
                Prix électricité (€/kWh)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.electricityPrice}
                  onChange={(e) => update("electricityPrice", e.target.value)}
                />
              </label>

              <label>
                Maintenance (€/h)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.maintenancePerHour}
                  onChange={(e) => update("maintenancePerHour", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>🛠️</span>
              <strong>Main-d&apos;œuvre et options</strong>
            </div>

            <div className="dtf-grid">
              <label>
                Préparation fichier (min)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.preparationMinutes}
                  onChange={(e) => update("preparationMinutes", e.target.value)}
                />
              </label>

              <label>
                Main-d&apos;œuvre (€/h)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.laborRate}
                  onChange={(e) => update("laborRate", e.target.value)}
                />
              </label>

              <label>
                Facteur complexité
                <input
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={form.complexityFactor}
                  onChange={(e) => update("complexityFactor", e.target.value)}
                />
                <span className="dtf-hint">
                  Majoration pour détails fins, dégradés, petits textes (×1 = normal)
                </span>
              </label>

              <label className="dtf-checkbox">
                <input
                  type="checkbox"
                  checked={form.includePressing}
                  onChange={(e) => update("includePressing", e.target.checked)}
                />
                Inclure pressing (sec / pièce)
              </label>

              <label>
                Pressing (sec / pièce)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.pressingSecondsPerUnit}
                  disabled={!form.includePressing}
                  onChange={(e) => update("pressingSecondsPerUnit", e.target.value)}
                />
                <span className="dtf-hint">
                  Temps presse à chaud pour appliquer le transfert sur le vêtement
                </span>
              </label>
            </div>
          </div>

          <div className="dtf-section">
            <div className="dtf-section-title">
              <span>📈</span>
              <strong>Commercial</strong>
            </div>

            <div className="dtf-grid">
              <label>
                Coefficient marge
                <input
                  type="number"
                  min="1"
                  step="0.1"
                  value={form.marginCoef}
                  onChange={(e) => update("marginCoef", e.target.value)}
                />
              </label>

              <label>
                TVA (%)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.vatRate}
                  onChange={(e) => update("vatRate", e.target.value)}
                />
              </label>
            </div>
          </div>
        </form>

        <aside className="card dtf-result-card">
          <div className="dtf-price">
            <span>Prix conseillé TTC</span>
            <strong>{euro(calc.totalTTC)}</strong>
          </div>

          <div className="dtf-total-ht">
            <span>Total HT</span>
            <strong>{euro(calc.totalHT)}</strong>
          </div>

          <div className="dtf-unit-price">
            <span>Prix unitaire TTC</span>
            <strong>{euro(calc.pricePerUnitTTC)}</strong>
          </div>

          <div className="dtf-breakdown">
            <div>
              <span>Surface totale</span>
              <strong>{calc.totalAreaM2.toFixed(4)} m²</strong>
            </div>

            <div>
              <span>Temps machine total</span>
              <strong>{calc.totalMachineHours.toFixed(2)} h</strong>
            </div>

            <div>
              <span>Film DTF</span>
              <strong>{euro(calc.filmCost)}</strong>
            </div>

            <div>
              <span>Encre</span>
              <strong>{euro(calc.inkCost)}</strong>
            </div>

            <div>
              <span>Poudre adhésive</span>
              <strong>{euro(calc.powderCost)}</strong>
            </div>

            <div>
              <span>Amortissement machine</span>
              <strong>{euro(calc.machineCost)}</strong>
            </div>

            <div>
              <span>Électricité</span>
              <strong>{euro(calc.electricityCost)}</strong>
            </div>

            <div>
              <span>Maintenance</span>
              <strong>{euro(calc.maintenanceCost)}</strong>
            </div>

            <div>
              <span>Main-d&apos;œuvre</span>
              <strong>{euro(calc.laborCost)}</strong>
            </div>

            <div>
              <span>Marge</span>
              <strong>{euro(calc.marginAmount)}</strong>
            </div>

            <div>
              <span>TVA</span>
              <strong>{euro(calc.vatAmount)}</strong>
            </div>
          </div>

          <div className="dtf-actions">
            <button type="button" onClick={copySummary}>
              📋 Copier
            </button>

            <button type="button" onClick={createQuote}>
              📋 Créer un devis
            </button>

            <button type="button" className="primary" onClick={createProduct}>
              📦 Créer produit
            </button>
          </div>

          <p className="dtf-note">
            Formule : film + encre + poudre + amortissement machine + électricité +
            maintenance + main-d&apos;œuvre, puis complexité × marge + TVA.
          </p>
        </aside>
      </div>
    </section>
  );
}
