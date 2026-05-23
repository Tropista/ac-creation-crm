import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast";
import { buildCalculatorQuoteLine, openQuoteFromCalculator } from "../utils/quoteDraft";

const MATERIAL_PRESETS = {
  Bois: { costPerM2: 18, cutSpeed: 600, engraveSpeed: 45000 },
  Acrylique: { costPerM2: 28, cutSpeed: 900, engraveSpeed: 55000 },
  Contreplaqué: { costPerM2: 15, cutSpeed: 550, engraveSpeed: 40000 },
  MDF: { costPerM2: 12, cutSpeed: 500, engraveSpeed: 40000 },
  Cuir: { costPerM2: 45, cutSpeed: 300, engraveSpeed: 25000 },
  Autre: { costPerM2: 20, cutSpeed: 600, engraveSpeed: 45000 },
};

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

export default function LaserCalculator({ data, setData, logActivity }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    projectName: "",
    material: "Bois",
    customMaterialCost: 20,

    widthMm: 200,
    heightMm: 150,

    autoEstimateTime: true,
    cuttingMinutes: 0,
    engravingMinutes: 0,

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

  const calc = useMemo(() => {
    const preset = MATERIAL_PRESETS[form.material] || MATERIAL_PRESETS.Autre;
    const width = Math.max(0, n(form.widthMm));
    const height = Math.max(0, n(form.heightMm));
    const areaMm2 = width * height;
    const areaM2 = areaMm2 / 1_000_000;
    const perimeterMm = 2 * (width + height);
    const qty = Math.max(1, n(form.quantity));

    const materialCostPerM2 =
      form.material === "Autre"
        ? n(form.customMaterialCost)
        : preset.costPerM2;
    const materialCost = areaM2 * materialCostPerM2 * qty;

    let cuttingMinutes = n(form.cuttingMinutes);
    let engravingMinutes = n(form.engravingMinutes);

    if (form.autoEstimateTime) {
      cuttingMinutes = perimeterMm / Math.max(1, preset.cutSpeed);
      engravingMinutes = areaMm2 / Math.max(1, preset.engraveSpeed);
    }

    const machineMinutesPerUnit = cuttingMinutes + engravingMinutes;
    const totalMachineHours = (machineMinutesPerUnit * qty) / 60;

    const machineHourlyCost =
      n(form.laserPrice) / Math.max(1, n(form.laserLifetimeHours));
    const machineCost = machineHourlyCost * totalMachineHours;
    const electricityCost =
      n(form.powerKw) * totalMachineHours * n(form.electricityPrice);
    const maintenanceCost = totalMachineHours * n(form.maintenancePerHour);

    const laborHours = n(form.preparationMinutes) / 60;
    const laborCost = laborHours * n(form.laborRate);

    const setupCost = n(form.setupFee);

    const subtotal =
      materialCost +
      machineCost +
      electricityCost +
      maintenanceCost +
      laborCost +
      setupCost;

    const complexityMultiplier = Math.max(0.1, n(form.complexityFactor));
    const costWithComplexity = subtotal * complexityMultiplier;
    const totalHT = costWithComplexity * n(form.marginCoef);
    const marginAmount = totalHT - costWithComplexity;
    const vatAmount = totalHT * (n(form.vatRate) / 100);
    const totalTTC = totalHT + vatAmount;
    const pricePerUnitHT = totalHT / qty;
    const pricePerUnitTTC = totalTTC / qty;

    return {
      areaM2,
      perimeterMm,
      cuttingMinutes,
      engravingMinutes,
      machineMinutesPerUnit,
      totalMachineHours,
      materialCostPerM2,
      materialCost,
      machineHourlyCost,
      machineCost,
      electricityCost,
      maintenanceCost,
      laborCost,
      setupCost,
      subtotal,
      complexityMultiplier,
      marginAmount,
      totalHT,
      vatAmount,
      totalTTC,
      pricePerUnitHT,
      pricePerUnitTTC,
      qty,
    };
  }, [form]);

  function copySummary() {
    const text = `Calcul laser CO2 - ${form.projectName || "Projet"}

Matière : ${form.material}
Dimensions : ${form.widthMm} × ${form.heightMm} mm
Surface : ${calc.areaM2.toFixed(4)} m²
Périmètre : ${calc.perimeterMm.toLocaleString("fr-FR")} mm
Machine : ${form.machineLabel}
Quantité : ${calc.qty}

Temps découpe / pièce : ${calc.cuttingMinutes.toFixed(1)} min
Temps gravure / pièce : ${calc.engravingMinutes.toFixed(1)} min
Temps machine total : ${calc.totalMachineHours.toFixed(2)} h

Coût matière : ${euro(calc.materialCost)}
Temps machine : ${euro(calc.machineCost)}
Électricité : ${euro(calc.electricityCost)}
Maintenance : ${euro(calc.maintenanceCost)}
Main-d'œuvre : ${euro(calc.laborCost)}
Frais de setup : ${euro(calc.setupCost)}
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
    const sku = `LASER-${String(nextNumber).padStart(4, "0")}`;

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

Quantité :
${calc.qty}

Détail calcul :
Matière : ${euro(calc.materialCost)}
Temps machine : ${euro(calc.machineCost)}
Électricité : ${euro(calc.electricityCost)}
Maintenance : ${euro(calc.maintenanceCost)}
Main-d'œuvre : ${euro(calc.laborCost)}
Frais de setup : ${euro(calc.setupCost)}
Complexité : ×${calc.complexityMultiplier}
Coefficient : ×${form.marginCoef}
Marge : ${euro(calc.marginAmount)}
Total HT : ${euro(calc.totalHT)}
Prix unitaire HT : ${euro(calc.pricePerUnitHT)}
TVA : ${euro(calc.vatAmount)}
TTC conseillé : ${euro(calc.totalTTC)}`,
      category: "Laser CO2",
      price: Number(calc.totalHT || 0),
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
      details: euro(calc.totalHT),
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
Machine : ${form.machineLabel}`,
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
            Estimation pro avec matière, temps machine, électricité, setup,
            complexité et marge.
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
                  value={
                    form.material === "Autre"
                      ? form.customMaterialCost
                      : (MATERIAL_PRESETS[form.material] || MATERIAL_PRESETS.Autre)
                          .costPerM2
                  }
                  disabled={form.material !== "Autre"}
                  onChange={(e) => update("customMaterialCost", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="laser-section">
            <div className="laser-section-title">
              <span>⏱️</span>
              <strong>Temps de production</strong>
            </div>

            <div className="laser-grid">
              <label className="laser-checkbox">
                <input
                  type="checkbox"
                  checked={form.autoEstimateTime}
                  onChange={(e) => update("autoEstimateTime", e.target.checked)}
                />
                Estimer automatiquement (périmètre / surface)
              </label>

              <label>
                Temps découpe (min / pièce)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.cuttingMinutes}
                  disabled={form.autoEstimateTime}
                  onChange={(e) => update("cuttingMinutes", e.target.value)}
                />
              </label>

              <label>
                Temps gravure (min / pièce)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.engravingMinutes}
                  disabled={form.autoEstimateTime}
                  onChange={(e) => update("engravingMinutes", e.target.value)}
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
                Préparation (min)
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
                Frais de setup (€)
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
                  min="0.1"
                  step="0.1"
                  value={form.complexityFactor}
                  onChange={(e) => update("complexityFactor", e.target.value)}
                />
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
          <div className="laser-price">
            <span>Prix conseillé TTC</span>
            <strong>{euro(calc.totalTTC)}</strong>
          </div>

          <div className="laser-total-ht">
            <span>Total HT</span>
            <strong>{euro(calc.totalHT)}</strong>
          </div>

          <div className="laser-unit-price">
            <span>Prix unitaire TTC</span>
            <strong>{euro(calc.pricePerUnitTTC)}</strong>
          </div>

          <div className="laser-breakdown">
            <div>
              <span>Surface</span>
              <strong>{calc.areaM2.toFixed(4)} m²</strong>
            </div>

            <div>
              <span>Périmètre</span>
              <strong>{calc.perimeterMm.toLocaleString("fr-FR")} mm</strong>
            </div>

            <div>
              <span>Temps machine total</span>
              <strong>{calc.totalMachineHours.toFixed(2)} h</strong>
            </div>

            <div>
              <span>Matière</span>
              <strong>{euro(calc.materialCost)}</strong>
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
              <span>Frais de setup</span>
              <strong>{euro(calc.setupCost)}</strong>
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
            Formule : matière + amortissement machine + électricité + maintenance
            + main-d&apos;œuvre + setup, puis complexité × marge + TVA.
          </p>
        </aside>
      </div>
    </section>
  );
}
