import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast";
import { buildCalculatorQuoteLine, openQuoteFromCalculator } from "../utils/quoteDraft";
import {
  computeLaserCalc,
  getLaserCompactSummary,
  MATERIAL_PRESETS,
} from "../utils/laserCalc";
import "../styles/laser-calculator.css";

function euro(value) {
  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

export default function LaserCalculator({ data, setData, logActivity }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    projectName: "",
    material: "Bois",
    customMaterialCost: 20,

    widthMm: 200,
    heightMm: 150,

    autoEstimateTime: true,
    cutTime: 0,
    engraveTime: 0,

    machineLabel: "CO2 80W",
    laserPrice: 3500,
    laserLifetimeHours: 4000,
    powerKw: 0.85,
    electricityPrice: 0.2,
    maintenancePerHour: 0.15,

    setupFee: 5,
    preparationMinutes: 10,
    laborRate: 25,
    complexityFactor: 1,

    quantity: 1,
    marginCoef: 2,
    vatRate: 17,
  });

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyMaterialPreset(material) {
    const preset = MATERIAL_PRESETS[material] || MATERIAL_PRESETS.Autre;
    setForm((current) => ({
      ...current,
      material,
      customMaterialCost: preset.costPerM2,
    }));
  }

  const calc = useMemo(() => computeLaserCalc(form), [form]);
  const multiQty = calc.qty > 1;
  const compactSummary = useMemo(
    () => getLaserCompactSummary(calc),
    [calc]
  );

  function copySummary() {
    const perPieceBlock = multiQty
      ? `
--- Par pièce (×${calc.qty}) ---
Matière / pièce : ${euro(calc.materialCostPerUnit)}
Amortissement / pièce : ${euro(calc.machineCostPerUnit)}
Électricité / pièce : ${euro(calc.electricityCostPerUnit)}
Maintenance / pièce : ${euro(calc.maintenanceCostPerUnit)}
Coût production / pièce : ${euro(calc.sortieAtelierBasePerUnit)}
Sortie d'atelier / pièce : ${euro(calc.sortieAtelierPerUnit)}
Prix unitaire HT : ${euro(calc.pricePerUnitHT)}
Prix unitaire TTC : ${euro(calc.pricePerUnitTTC)}`
      : "";

    const orderBlock = multiQty
      ? `
--- Total commande ---
Frais commande (MO + setup) : ${euro(calc.orderFixedCost)}
Coût production (commande) : ${euro(calc.sortieAtelierBase)}
Sortie d'atelier (commande) : ${euro(calc.sortieAtelier)}
Total HT commande : ${euro(calc.totalHT)}
Prix conseillé TTC commande : ${euro(calc.totalTTC)}`
      : `
Coût production : ${euro(calc.sortieAtelierBase)}
Sortie d'atelier : ${euro(calc.sortieAtelier)}
Total HT : ${euro(calc.totalHT)}
Prix conseillé TTC : ${euro(calc.totalTTC)}`;

    const text = `Calcul laser CO2 - ${form.projectName || "Projet"}

Matière : ${form.material}
Dimensions : ${form.widthMm} × ${form.heightMm} mm
Surface : ${calc.areaM2.toFixed(4)} m²
Périmètre : ${calc.perimeterMm.toLocaleString("fr-FR")} mm
Machine : ${form.machineLabel}
Quantité : ${calc.qty}

Temps découpe / pièce : ${calc.cutTime.toFixed(1)} s
Temps gravure / pièce : ${calc.engraveTime.toFixed(1)} s
Temps machine total : ${calc.totalMachineHours.toFixed(2)} h
${perPieceBlock}
${orderBlock}

Coût matière (commande) : ${euro(calc.materialCost)}
Temps machine (commande) : ${euro(calc.machineCost)}
Électricité (commande) : ${euro(calc.electricityCost)}
Maintenance (commande) : ${euro(calc.maintenanceCost)}
Main-d'œuvre (1× commande) : ${euro(calc.laborCost)}
Frais de setup (1× commande) : ${euro(calc.setupCost)}
Complexité : ×${calc.complexityMultiplier}
Coefficient : ×${form.marginCoef}
Marge (commande) : ${euro(calc.marginAmount)}
TVA (commande) : ${euro(calc.vatAmount)}`;

    navigator.clipboard.writeText(text);
    showToast("Calcul copié dans le presse-papier.", "success");
  }

  function createProduct() {
    if (!form.projectName.trim()) {
      showToast("Nom du projet manquant", "error");
      return;
    }

    const nextNumber = (data.products || []).length + 1;
    const sku = `LASER-${String(nextNumber).padStart(4, "0")}`;

    const qtyLine = multiQty
      ? `Quantité de référence : ${calc.qty} pièces
Prix catalogue : HT / pièce (${euro(calc.pricePerUnitHT)})
Total commande type : HT ${euro(calc.totalHT)} · TTC ${euro(calc.totalTTC)}`
      : `Prix catalogue : HT ${euro(calc.totalHT)} · TTC ${euro(calc.totalTTC)}`;

    const product = {
      id: crypto.randomUUID(),
      sku,
      name: form.projectName.trim(),
      description: `Découpe / gravure laser

Matière :
${form.material}

Dimensions :
${form.widthMm} × ${form.heightMm} mm

Machine :
${form.machineLabel}

${qtyLine}

Détail calcul (commande) :
Matière : ${euro(calc.materialCost)}
Temps machine : ${euro(calc.machineCost)}
Électricité : ${euro(calc.electricityCost)}
Maintenance : ${euro(calc.maintenanceCost)}
Main-d'œuvre (1×) : ${euro(calc.laborCost)}
Frais de setup (1×) : ${euro(calc.setupCost)}
Coût production : ${euro(calc.sortieAtelierBase)}
Sortie d'atelier : ${euro(calc.sortieAtelier)}
Sortie d'atelier / pièce : ${euro(calc.sortieAtelierPerUnit)}
Complexité : ×${calc.complexityMultiplier}
Coefficient : ×${form.marginCoef}
Marge : ${euro(calc.marginAmount)}
TVA : ${euro(calc.vatAmount)}`,
      category: "Laser CO2",
      price: Number(calc.pricePerUnitHT || 0),
      stock: 0,
      createdAt: new Date().toISOString(),
    };

    setData({
      ...data,
      products: [...(data.products || []), product],
    });

    logActivity?.({
      action: "Produit laser créé",
      target: product.name,
      details: euro(calc.pricePerUnitHT),
    });

    showToast("Produit créé dans Produits.", "success");
  }

  function createQuote() {
    const label =
      form.projectName.trim() ||
      `Laser ${form.material} ${form.widthMm}×${form.heightMm} mm`;

    openQuoteFromCalculator(navigate, {
      source: "calculateur laser",
      lines: [
        buildCalculatorQuoteLine({
          description: `${label}

Matière : ${form.material}
Dimensions : ${form.widthMm} × ${form.heightMm} mm
Machine : ${form.machineLabel}
${multiQty ? `Calcul : ${euro(calc.pricePerUnitHT)} HT / pièce` : ""}`,
          quantity: calc.qty,
          priceHT: calc.pricePerUnitHT,
          sku: "LASER-CALC",
          category: "Laser CO2",
        }),
      ],
    });
  }

  return (
    <section className="laser-page">
      <div className="page-header">
        <div>
          <h2>Calculateur laser CO2 80W</h2>
          <p>
            Estimation pro avec matière, temps machine, électricité, setup
            et marge.
          </p>
        </div>
      </div>

      <div className="laser-layout">
        <form className="card laser-form">
          <div className="laser-section">
            <div className="laser-section-title">
              <span>🧩</span>
              <strong>Projet</strong>
            </div>

            <div className="laser-grid">
              <label>
                Nom du projet
                <input
                  value={form.projectName}
                  onChange={(e) => update("projectName", e.target.value)}
                  placeholder="Ex : Plaque signalétique"
                />
              </label>

              <label>
                Matière
                <select
                  value={form.material}
                  onChange={(e) => applyMaterialPreset(e.target.value)}
                >
                  {Object.keys(MATERIAL_PRESETS).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>

              <label>
                Quantité
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.quantity}
                  onChange={(e) => update("quantity", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="laser-section">
            <div className="laser-section-title">
              <span>📐</span>
              <strong>Dimensions et matière</strong>
            </div>

            <div className="laser-grid">
              <label>
                Largeur (mm)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.widthMm}
                  onChange={(e) => update("widthMm", e.target.value)}
                />
              </label>

              <label>
                Hauteur (mm)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.heightMm}
                  onChange={(e) => update("heightMm", e.target.value)}
                />
              </label>

              <label>
                Coût matière (€/m²)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.customMaterialCost}
                  onChange={(e) => update("customMaterialCost", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="laser-section">
            <div className="laser-section-title">
              <span>⏱️</span>
              <strong>Temps machine (secondes)</strong>
            </div>

            <div className="laser-grid">
              <label className="laser-checkbox">
                <input
                  type="checkbox"
                  checked={form.autoEstimateTime}
                  onChange={(e) => update("autoEstimateTime", e.target.checked)}
                />
                Estimer automatiquement (résultat en sec / pièce)
              </label>

              <label>
                Temps découpe (sec / pièce)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.cutTime}
                  disabled={form.autoEstimateTime}
                  onChange={(e) => update("cutTime", e.target.value)}
                />
              </label>

              <label>
                Temps gravure (sec / pièce)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.engraveTime}
                  disabled={form.autoEstimateTime}
                  onChange={(e) => update("engraveTime", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="laser-section">
            <div className="laser-section-title">
              <span>🔥</span>
              <strong>Machine CO2 80W</strong>
            </div>

            <div className="laser-grid">
              <label>
                Machine
                <input value={form.machineLabel} readOnly />
              </label>

              <label>
                Prix laser (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.laserPrice}
                  onChange={(e) => update("laserPrice", e.target.value)}
                />
              </label>

              <label>
                Durée de vie (h)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.laserLifetimeHours}
                  onChange={(e) => update("laserLifetimeHours", e.target.value)}
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

          <div className="laser-section">
            <div className="laser-section-title">
              <span>🛠️</span>
              <strong>Main-d&apos;œuvre et options</strong>
            </div>

            <div className="laser-grid">
              <label>
                Préparation (min, 1× par commande)
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
                Frais de setup (€, 1× par commande)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.setupFee}
                  onChange={(e) => update("setupFee", e.target.value)}
                />
              </label>

              <label>
                Facteur complexité
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder="1"
                  value={form.complexityFactor}
                  onChange={(e) => update("complexityFactor", e.target.value)}
                />
                <small className="laser-field-hint">
                  1 = normal, &gt;1 = majoration — laisser vide ou 1 si pas de
                  surcoût
                </small>
              </label>
            </div>
          </div>

          <div className="laser-section">
            <div className="laser-section-title">
              <span>📈</span>
              <strong>Commercial</strong>
            </div>

            <div className="laser-grid">
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

        <aside className="card laser-result-card">
          {compactSummary.map((row) => (
            <div key={row.key} className={row.className}>
              <span>{row.label}</span>
              <strong>{euro(row.main)}</strong>
              {row.sub != null && (
                <small className={row.subClassName}>
                  {row.subPrefix} : {euro(row.sub)}
                </small>
              )}
            </div>
          ))}

          <div className="laser-breakdown">
            <p className="laser-breakdown-heading">Technique</p>
            <div>
              <span>Surface / pièce</span>
              <strong>{calc.areaM2.toFixed(4)} m²</strong>
            </div>
            <div>
              <span>Périmètre / pièce</span>
              <strong>{calc.perimeterMm.toLocaleString("fr-FR")} mm</strong>
            </div>
            <div>
              <span>Temps machine total</span>
              <strong>{calc.totalMachineHours.toFixed(2)} h</strong>
            </div>

            <p className="laser-breakdown-heading">
              {multiQty ? `Coûts par pièce (×${calc.qty})` : "Coûts"}
            </p>
            <div>
              <span>Matière{multiQty ? " / pièce" : ""}</span>
              <strong>
                {euro(multiQty ? calc.materialCostPerUnit : calc.materialCost)}
              </strong>
            </div>
            <div>
              <span>Amortissement machine{multiQty ? " / pièce" : ""}</span>
              <strong>
                {euro(multiQty ? calc.machineCostPerUnit : calc.machineCost)}
              </strong>
            </div>
            <div>
              <span>Électricité{multiQty ? " / pièce" : ""}</span>
              <strong>
                {euro(
                  multiQty ? calc.electricityCostPerUnit : calc.electricityCost
                )}
              </strong>
            </div>
            <div>
              <span>Maintenance{multiQty ? " / pièce" : ""}</span>
              <strong>
                {euro(
                  multiQty ? calc.maintenanceCostPerUnit : calc.maintenanceCost
                )}
              </strong>
            </div>

            <p className="laser-breakdown-heading">Frais commande (1×)</p>
            <div>
              <span>Main-d&apos;œuvre</span>
              <strong>{euro(calc.laborCost)}</strong>
            </div>
            <div>
              <span>Frais de setup</span>
              <strong>{euro(calc.setupCost)}</strong>
            </div>

            {multiQty && (
              <>
                <p className="laser-breakdown-heading">
                  Total commande (×{calc.qty} pièces)
                </p>
                <div>
                  <span>Matière (ligne)</span>
                  <strong>{euro(calc.materialCost)}</strong>
                </div>
                <div>
                  <span>Amortissement (ligne)</span>
                  <strong>{euro(calc.machineCost)}</strong>
                </div>
                <div>
                  <span>Électricité (ligne)</span>
                  <strong>{euro(calc.electricityCost)}</strong>
                </div>
                <div>
                  <span>Maintenance (ligne)</span>
                  <strong>{euro(calc.maintenanceCost)}</strong>
                </div>
                {calc.complexityMultiplier !== 1 && (
                  <div className="laser-sortie-atelier">
                    <span>Coût production (commande)</span>
                    <strong>{euro(calc.sortieAtelierBase)}</strong>
                  </div>
                )}
                <div className="laser-sortie-atelier">
                  <span>
                    Sortie d&apos;atelier (commande)
                    {calc.complexityMultiplier !== 1 ? " (× complexité)" : ""}
                  </span>
                  <strong>{euro(calc.sortieAtelier)}</strong>
                </div>
              </>
            )}

            <p className="laser-breakdown-heading">Prix de vente</p>
            {calc.complexityMultiplier !== 1 && (
              <div>
                <span>
                  Coût production{multiQty ? " (commande)" : ""}
                </span>
                <strong>{euro(calc.sortieAtelierBase)}</strong>
              </div>
            )}
            {calc.complexityMultiplier !== 1 && (
              <div>
                <span>
                  Complexité (×{calc.complexityMultiplier})
                </span>
                <strong>{euro(calc.sortieAtelier)}</strong>
              </div>
            )}
            <div className="laser-sortie-atelier">
              <span>
                Sortie d&apos;atelier{multiQty ? " (commande)" : ""}
                {calc.complexityMultiplier !== 1 ? " (× complexité)" : ""}
              </span>
              <strong>{euro(calc.sortieAtelier)}</strong>
            </div>
            <div>
              <span>Marge{multiQty ? " (commande)" : ""}</span>
              <strong>{euro(calc.marginAmount)}</strong>
            </div>
            <div>
              <span>TVA{multiQty ? " (commande)" : ""}</span>
              <strong>{euro(calc.vatAmount)}</strong>
            </div>
            {multiQty && (
              <>
                <div>
                  <span>Marge / pièce</span>
                  <strong>{euro(calc.marginAmountPerUnit)}</strong>
                </div>
                <div>
                  <span>TVA / pièce</span>
                  <strong>{euro(calc.vatAmountPerUnit)}</strong>
                </div>
              </>
            )}
          </div>

          <div className="laser-actions">
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

          <p className="laser-note">
            Matière et temps machine sont calculés par pièce puis multipliés par
            la quantité. La préparation et le setup sont facturés une seule fois
            par commande. Avec quantité 1, les trois montants en tête (sortie
            d&apos;atelier, HT, TTC) sont les totaux commande. Au-delà de 1
            pièce, le prix par pièce est affiché en principal et le total
            commande en sous-ligne.
          </p>
        </aside>
      </div>
    </section>
  );
}
