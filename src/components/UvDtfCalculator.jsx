import { useMemo, useState } from "react";
import { showToast } from "../utils/toast";

/*
 * Specs Tristar 30 cm UV-DTF — source : creadhesif.com/imprimante-dtf-uv-30cm-tristar.html
 * - Prix : 7 900 € TTC / 6 583,33 € HT (SKU ZHS_AF230UV)
 * - Laize max : 30 cm · 2 têtes Epson I1600 · 720×2400 DPI
 * - Encres : CMYK + Blanc + Vernis (encre DTF UV)
 * - Consommation fabricant : 10–30 ml/couleur pour 2,7 m²
 * - Puissance : 1 200 W · 220 V 50/60 Hz · temp. 20–28 °C · RH 40–60 %
 * - Pack démarrage : 6 L encre (1 L × C/M/Y/K/Blanc/Vernis) + 2 rouleaux 100 m (film A + B)
 * - Lamination intégrée · pas de poudreuse ni presse textile
 */

const OBJECT_PRESETS = {
  "Coque téléphone": { complexityFactor: 1.05, whiteMultiplier: 1.2 },
  Mug: { complexityFactor: 1.1, whiteMultiplier: 1.15 },
  Sticker: { complexityFactor: 1, whiteMultiplier: 1.1 },
  Plaque: { complexityFactor: 1, whiteMultiplier: 1.05 },
  Autre: { complexityFactor: 1, whiteMultiplier: 1.2 },
};

const COVERAGE_PRESETS = {
  "Logo / texte (léger)": { cmyk: 15, white: 8, varnish: 5 },
  Moyen: { cmyk: 30, white: 15, varnish: 10 },
  "Plein format / dense": { cmyk: 45, white: 28, varnish: 15 },
};

const MAX_WIDTH_CM = 30;
const ROLL_WIDTH_M = MAX_WIDTH_CM / 100;

// Films A + B — placeholder dérivé du marché UV-DTF (~69 € / 100 m rouleau 30 cm, à ajuster)
const FILM_A_COST_PER_LINEAR_M = 0.69;
const FILM_B_COST_PER_LINEAR_M = 0.69;
const FILM_A_COST_PER_M2 = FILM_A_COST_PER_LINEAR_M / ROLL_WIDTH_M;
const FILM_B_COST_PER_M2 = FILM_B_COST_PER_LINEAR_M / ROLL_WIDTH_M;

// Encre UV — CMYK + blanc : 89 €/L · Vernis : 99 €/L
const INK_COST_PER_ML = 89 / 1000;
const VARNISH_COST_PER_ML = 99 / 1000;
const INK_ML_CMYK_DEFAULT = 30;
const INK_ML_WHITE_DEFAULT = 15;
const INK_ML_VARNISH_DEFAULT = 10;
const INK_COST_PER_M2_DEFAULT =
  INK_ML_CMYK_DEFAULT * INK_COST_PER_ML +
  INK_ML_WHITE_DEFAULT * INK_COST_PER_ML +
  INK_ML_VARNISH_DEFAULT * VARNISH_COST_PER_ML;

// Prix machine Tristar 30 cm (HT) — creadhesif.com
const TRISTAR_PRICE_HT = 6583.33;
const TRISTAR_POWER_KW = 1.2;

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

export default function UvDtfCalculator({ data, setData, logActivity }) {
  const [form, setForm] = useState({
    projectName: "",
    objectType: "Coque téléphone",
    coverageType: "Moyen",

    widthCm: 10,
    heightCm: 18,
    quantity: 1,

    filmPricingMode: "linear",
    filmACostPerM2: Number(FILM_A_COST_PER_M2.toFixed(2)),
    filmBCostPerM2: Number(FILM_B_COST_PER_M2.toFixed(2)),
    filmACostPerLinearM: FILM_A_COST_PER_LINEAR_M,
    filmBCostPerLinearM: FILM_B_COST_PER_LINEAR_M,
    filmWasteLinearM: 0.5,

    inkPricingMode: "ml",
    inkCostPerM2: Number(INK_COST_PER_M2_DEFAULT.toFixed(2)),
    inkMlPerM2Cmyk: INK_ML_CMYK_DEFAULT,
    inkMlPerM2White: INK_ML_WHITE_DEFAULT,
    inkMlPerM2Varnish: INK_ML_VARNISH_DEFAULT,
    inkCostPerMl: Number(INK_COST_PER_ML.toFixed(4)),
    varnishCostPerMl: Number(VARNISH_COST_PER_ML.toFixed(4)),
    usesWhiteInk: true,
    usesVarnish: true,

    autoEstimateTime: true,
    printSpeedM2PerHour: 3,
    printMinutes: 0,
    laminationMinutesPerUnit: 0.3,

    machineLabel: "Tristar UV-DTF 30 cm",
    printerPrice: TRISTAR_PRICE_HT,
    machineLifetimeHours: 6000,
    powerKw: TRISTAR_POWER_KW,
    electricityPrice: 0.2,
    maintenancePerHour: 0.15,

    preparationMinutes: 0,
    includeApplication: true,
    applicationSecondsPerUnit: 30,
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

  function applyObjectPreset(objectType) {
    const preset = OBJECT_PRESETS[objectType] || OBJECT_PRESETS.Autre;
    setForm((current) => ({
      ...current,
      objectType,
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
      inkMlPerM2Varnish: preset.varnish,
      inkCostPerM2: Number(
        (
          preset.cmyk * INK_COST_PER_ML +
          preset.white * INK_COST_PER_ML +
          preset.varnish * VARNISH_COST_PER_ML
        ).toFixed(2)
      ),
    }));
  }

  const calc = useMemo(() => {
    const preset = OBJECT_PRESETS[form.objectType] || OBJECT_PRESETS.Autre;
    const widthCm = Math.min(MAX_WIDTH_CM, Math.max(0, n(form.widthCm)));
    const heightCm = Math.max(0, n(form.heightCm));
    const areaCm2 = widthCm * heightCm;
    const areaM2 = areaCm2 / 10_000;
    const qty = Math.max(1, n(form.quantity));
    const totalAreaM2 = areaM2 * qty;
    const linearMetersUsed = (heightCm / 100) * qty;
    const linearWasteM = n(form.filmWasteLinearM);

    let filmACost = 0;
    let filmBCost = 0;
    if (form.filmPricingMode === "linear") {
      const totalLinear = linearMetersUsed + linearWasteM;
      filmACost = totalLinear * n(form.filmACostPerLinearM);
      filmBCost = totalLinear * n(form.filmBCostPerLinearM);
    } else {
      const wasteAreaM2 = linearWasteM * ROLL_WIDTH_M;
      const totalFilmArea = totalAreaM2 + wasteAreaM2;
      filmACost = totalFilmArea * n(form.filmACostPerM2);
      filmBCost = totalFilmArea * n(form.filmBCostPerM2);
    }
    const filmCost = filmACost + filmBCost;

    const whiteMultiplier = form.usesWhiteInk ? preset.whiteMultiplier : 1;
    let inkCost = 0;
    if (form.inkPricingMode === "ml") {
      const cmykMl = totalAreaM2 * n(form.inkMlPerM2Cmyk);
      const whiteMl = form.usesWhiteInk
        ? totalAreaM2 * n(form.inkMlPerM2White) * whiteMultiplier
        : 0;
      const varnishMl = form.usesVarnish
        ? totalAreaM2 * n(form.inkMlPerM2Varnish)
        : 0;
      inkCost =
        cmykMl * n(form.inkCostPerMl) +
        whiteMl * n(form.inkCostPerMl) +
        varnishMl * n(form.varnishCostPerMl);
    } else {
      const inkMult =
        whiteMultiplier *
        (form.usesWhiteInk ? 1 : 0.7) *
        (form.usesVarnish ? 1 : 0.85);
      inkCost = totalAreaM2 * n(form.inkCostPerM2) * inkMult;
    }

    let printMinutesPerUnit = n(form.printMinutes);
    let laminationMinutesPerUnit = n(form.laminationMinutesPerUnit);

    if (form.autoEstimateTime) {
      const printHoursPerUnit =
        areaM2 / Math.max(0.01, n(form.printSpeedM2PerHour));
      printMinutesPerUnit = printHoursPerUnit * 60;
      laminationMinutesPerUnit = Math.max(0.2, areaM2 * 6);
    }

    const machineMinutesPerUnit =
      printMinutesPerUnit + laminationMinutesPerUnit;
    const totalMachineHours = (machineMinutesPerUnit * qty) / 60;

    const machineHourlyCost =
      n(form.printerPrice) / Math.max(1, n(form.machineLifetimeHours));
    const machineCost = machineHourlyCost * totalMachineHours;
    const electricityCost =
      n(form.powerKw) * totalMachineHours * n(form.electricityPrice);
    const maintenanceCost = totalMachineHours * n(form.maintenancePerHour);

    const laborMinutes =
      n(form.preparationMinutes) +
      (form.includeApplication
        ? (n(form.applicationSecondsPerUnit) * qty) / 60
        : 0);
    const laborCost = (laborMinutes / 60) * n(form.laborRate);

    const subtotal =
      filmCost +
      inkCost +
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
      filmACost,
      filmBCost,
      filmCost,
      inkCost,
      printMinutesPerUnit,
      laminationMinutesPerUnit,
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
    const text = `Calcul UV-DTF Tristar 30cm - ${form.projectName || "Projet"}

Type d'objet : ${form.objectType}
Type de couverture : ${form.coverageType}
Dimensions : ${calc.widthCm} × ${calc.heightCm} cm (max ${MAX_WIDTH_CM} cm)
Surface / pièce : ${calc.areaM2.toFixed(4)} m²
Surface totale : ${calc.totalAreaM2.toFixed(4)} m²
Machine : ${form.machineLabel}
Quantité : ${calc.qty}
Encre blanche : ${form.usesWhiteInk ? "Oui" : "Non"}
Vernis : ${form.usesVarnish ? "Oui" : "Non"}

Temps impression / pièce : ${calc.printMinutesPerUnit.toFixed(1)} min
Temps lamination / pièce : ${calc.laminationMinutesPerUnit.toFixed(1)} min
Temps machine total : ${calc.totalMachineHours.toFixed(2)} h

Coût film A : ${euro(calc.filmACost)}
Coût film B : ${euro(calc.filmBCost)}
Coût encre UV : ${euro(calc.inkCost)}
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
    const sku = `UVDTF-${String(nextNumber).padStart(4, "0")}`;

    const product = {
      id: crypto.randomUUID(),
      sku,
      name: form.projectName.trim(),
      description: `Marquage UV-DTF Tristar 30cm

Type d'objet :
${form.objectType}

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

Vernis :
${form.usesVarnish ? "Oui" : "Non"}

Détail calcul :
Film A : ${euro(calc.filmACost)}
Film B : ${euro(calc.filmBCost)}
Encre UV : ${euro(calc.inkCost)}
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
      category: "UV-DTF",
      price: Number(calc.totalHT || 0),
      stock: 0,
      createdAt: new Date().toISOString(),
    };

    setData({
      ...data,
      products: [...(data.products || []), product],
    });

    logActivity?.({
      action: "Produit UV-DTF créé",
      target: product.name,
      details: euro(calc.totalHT),
    });

    showToast("Produit créé dans Produits.", "success");
  }

  return (
    <section className="uvdtf-page">
      <div className="page-header">
        <div>
          <h2>Calculateur UV-DTF Tristar 30cm</h2>
          <p>
            Estimation pro pour marquage sur objets rigides : films A + B, encre
            UV CMYK + blanc + vernis, lamination intégrée, amortissement machine,
            électricité, application et marge.
          </p>
        </div>
      </div>

      <div className="uvdtf-layout">
        <form className="card uvdtf-form">
          <div className="uvdtf-section">
            <div className="uvdtf-section-title">
              <span>🧩</span>
              <strong>Projet</strong>
            </div>

            <div className="uvdtf-grid">
              <label>
                Nom du projet
                <input
                  value={form.projectName}
                  onChange={(e) => update("projectName", e.target.value)}
                  placeholder="Ex : Autocollants mugs entreprise"
                />
              </label>

              <label>
                Type d&apos;objet
                <select
                  value={form.objectType}
                  onChange={(e) => applyObjectPreset(e.target.value)}
                >
                  {Object.keys(OBJECT_PRESETS).map((name) => (
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

              <label className="uvdtf-checkbox">
                <input
                  type="checkbox"
                  checked={form.usesWhiteInk}
                  onChange={(e) => update("usesWhiteInk", e.target.checked)}
                />
                Couche blanche (encre blanche)
              </label>

              <label className="uvdtf-checkbox">
                <input
                  type="checkbox"
                  checked={form.usesVarnish}
                  onChange={(e) => update("usesVarnish", e.target.checked)}
                />
                Vernis / finition brillante
              </label>
            </div>
          </div>

          <div className="uvdtf-section">
            <div className="uvdtf-section-title">
              <span>📐</span>
              <strong>Dimensions impression</strong>
            </div>

            <div className="uvdtf-grid">
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

          <div className="uvdtf-section">
            <div className="uvdtf-section-title">
              <span>🎞️</span>
              <strong>Films A + B (système AB)</strong>
            </div>

            <div className="uvdtf-grid">
              <label>
                Mode tarification films
                <select
                  value={form.filmPricingMode}
                  onChange={(e) => update("filmPricingMode", e.target.value)}
                >
                  <option value="m2">€/m²</option>
                  <option value="linear">€/mètre linéaire (30 cm)</option>
                </select>
              </label>

              {form.filmPricingMode === "m2" ? (
                <>
                  <label>
                    Coût film A (€/m²)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.filmACostPerM2}
                      onChange={(e) => update("filmACostPerM2", e.target.value)}
                    />
                    <span className="uvdtf-hint">
                      Estimation — à ajuster selon votre fournisseur
                    </span>
                  </label>

                  <label>
                    Coût film B (€/m²)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.filmBCostPerM2}
                      onChange={(e) => update("filmBCostPerM2", e.target.value)}
                    />
                    <span className="uvdtf-hint">
                      Film B = couche adhésive / transfert
                    </span>
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Coût film A (€/m linéaire)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.filmACostPerLinearM}
                      onChange={(e) =>
                        update("filmACostPerLinearM", e.target.value)
                      }
                    />
                    <span className="uvdtf-hint">
                      ~0,69 €/m rouleau 30 cm — à ajuster
                    </span>
                  </label>

                  <label>
                    Coût film B (€/m linéaire)
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.filmBCostPerLinearM}
                      onChange={(e) =>
                        update("filmBCostPerLinearM", e.target.value)
                      }
                    />
                    <span className="uvdtf-hint">
                      Pack Tristar : 2 × 100 m inclus au démarrage
                    </span>
                  </label>
                </>
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
                <span className="uvdtf-hint">
                  Appliqué une fois par calcul (films A + B)
                </span>
              </label>
            </div>
          </div>

          <div className="uvdtf-section">
            <div className="uvdtf-section-title">
              <span>🎨</span>
              <strong>Encre UV CMYK + blanc + vernis</strong>
            </div>

            <div className="uvdtf-grid">
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
                <span className="uvdtf-hint">
                  Basé sur 10–30 ml/couleur pour 2,7 m² (spec Tristar)
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
                  <span className="uvdtf-hint">
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
                    <span className="uvdtf-hint">
                      Léger ~15 · moyen ~30 · dense ~45 ml/m²
                    </span>
                  </label>

                  <label>
                    Consommation blanc (ml/m²)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.inkMlPerM2White}
                      onChange={(e) =>
                        update("inkMlPerM2White", e.target.value)
                      }
                      disabled={!form.usesWhiteInk}
                    />
                    <span className="uvdtf-hint">
                      Léger ~8 · moyen ~15 · dense ~28 ml/m²
                    </span>
                  </label>

                  <label>
                    Consommation vernis (ml/m²)
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={form.inkMlPerM2Varnish}
                      onChange={(e) =>
                        update("inkMlPerM2Varnish", e.target.value)
                      }
                      disabled={!form.usesVarnish}
                    />
                    <span className="uvdtf-hint">
                      Léger ~5 · moyen ~10 · dense ~15 ml/m²
                    </span>
                  </label>

                  <label>
                    Coût encre CMYK + blanc (€/ml)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.inkCostPerMl}
                      onChange={(e) => update("inkCostPerMl", e.target.value)}
                    />
                    <span className="uvdtf-hint">
                      89 €/L (0,089 €/ml)
                    </span>
                  </label>

                  <label>
                    Coût vernis (€/ml)
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={form.varnishCostPerMl}
                      onChange={(e) =>
                        update("varnishCostPerMl", e.target.value)
                      }
                      disabled={!form.usesVarnish}
                    />
                    <span className="uvdtf-hint">
                      99 €/L (0,099 €/ml)
                    </span>
                  </label>
                </>
              )}
            </div>
          </div>

          <div className="uvdtf-section">
            <div className="uvdtf-section-title">
              <span>⏱️</span>
              <strong>Temps de production</strong>
            </div>

            <div className="uvdtf-grid">
              <label className="uvdtf-checkbox">
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
                <span className="uvdtf-hint">
                  UV-DTF 30 cm : ~2–5 m²/h selon qualité — à ajuster
                </span>
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
                Temps lamination (min / pièce)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={
                    form.autoEstimateTime
                      ? calc.laminationMinutesPerUnit.toFixed(1)
                      : form.laminationMinutesPerUnit
                  }
                  disabled={form.autoEstimateTime}
                  onChange={(e) =>
                    update("laminationMinutesPerUnit", e.target.value)
                  }
                />
                <span className="uvdtf-hint">
                  Lamination intégrée à l&apos;imprimante Tristar
                </span>
              </label>
            </div>
          </div>

          <div className="uvdtf-section">
            <div className="uvdtf-section-title">
              <span>🖨️</span>
              <strong>Tristar UV-DTF 30 cm</strong>
            </div>

            <div className="uvdtf-grid">
              <label>
                Machine
                <input value={form.machineLabel} readOnly />
              </label>

              <label>
                Prix machine (€ HT)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.printerPrice}
                  onChange={(e) => update("printerPrice", e.target.value)}
                />
                <span className="uvdtf-hint">
                  6 583,33 € HT / 7 900 € TTC — creadhesif.com
                </span>
              </label>

              <label>
                Durée de vie (h)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.machineLifetimeHours}
                  onChange={(e) =>
                    update("machineLifetimeHours", e.target.value)
                  }
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
                <span className="uvdtf-hint">
                  Spec fabricant : 1 200 W
                </span>
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

          <div className="uvdtf-section">
            <div className="uvdtf-section-title">
              <span>🛠️</span>
              <strong>Main-d&apos;œuvre et application</strong>
            </div>

            <div className="uvdtf-grid">
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
                <span className="uvdtf-hint">
                  Majoration surfaces courbes, petits formats (×1 = normal)
                </span>
              </label>

              <label className="uvdtf-checkbox">
                <input
                  type="checkbox"
                  checked={form.includeApplication}
                  onChange={(e) =>
                    update("includeApplication", e.target.checked)
                  }
                />
                Inclure application / pose sur objet
              </label>

              <label>
                Application (sec / pièce)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.applicationSecondsPerUnit}
                  disabled={!form.includeApplication}
                  onChange={(e) =>
                    update("applicationSecondsPerUnit", e.target.value)
                  }
                />
                <span className="uvdtf-hint">
                  Découpe, décollage et pose sur coque, mug, plaque…
                </span>
              </label>
            </div>
          </div>

          <div className="uvdtf-section">
            <div className="uvdtf-section-title">
              <span>📈</span>
              <strong>Commercial</strong>
            </div>

            <div className="uvdtf-grid">
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

        <aside className="card uvdtf-result-card">
          <div className="uvdtf-price">
            <span>Prix conseillé TTC</span>
            <strong>{euro(calc.totalTTC)}</strong>
          </div>

          <div className="uvdtf-total-ht">
            <span>Total HT</span>
            <strong>{euro(calc.totalHT)}</strong>
          </div>

          <div className="uvdtf-unit-price">
            <span>Prix unitaire TTC</span>
            <strong>{euro(calc.pricePerUnitTTC)}</strong>
          </div>

          <div className="uvdtf-breakdown">
            <div>
              <span>Surface totale</span>
              <strong>{calc.totalAreaM2.toFixed(4)} m²</strong>
            </div>

            <div>
              <span>Temps machine total</span>
              <strong>{calc.totalMachineHours.toFixed(2)} h</strong>
            </div>

            <div>
              <span>Film A</span>
              <strong>{euro(calc.filmACost)}</strong>
            </div>

            <div>
              <span>Film B</span>
              <strong>{euro(calc.filmBCost)}</strong>
            </div>

            <div>
              <span>Encre UV</span>
              <strong>{euro(calc.inkCost)}</strong>
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

          <div className="uvdtf-actions">
            <button type="button" onClick={copySummary}>
              📋 Copier
            </button>

            <button type="button" className="primary" onClick={createProduct}>
              📦 Créer produit
            </button>
          </div>

          <p className="uvdtf-note">
            Formule : films A + B + encre UV + amortissement machine + électricité
            + maintenance + main-d&apos;œuvre, puis complexité × marge + TVA.
            Pas de poudreuse ni presse textile (UV-DTF sur objets rigides).
          </p>
        </aside>
      </div>
    </section>
  );
}
