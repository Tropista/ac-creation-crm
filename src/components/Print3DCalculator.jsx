import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast";
import { buildCalculatorQuoteLine, openQuoteFromCalculator } from "../utils/quoteDraft";
import CalculatorProjectLibrary from "./CalculatorProjectLibrary";
import { CALCULATOR_TYPES, syncCalculatorProjectsIntoSettings } from "../utils/calculatorProjects";
import "../styles/print3d-calculator.css";

function euro(value) {

  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + " €"
  );
}

function n(value) {
  return Number(value || 0);
}

export default function Print3DCalculator({
  data,
  setData,
  logActivity
}) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    projectName: "",
    material: "PLA",

    partWeight: 0,
    supportWeight: 0,
    spoolPrice: 20,
    spoolWeight: 1000,

    printHours: 0,
    printMinutes: 0,

    printerPrice: 2400,
    printerLifetimeHours: 5000,

    powerKw: 0.20,
    electricityPrice: 0.20,

    maintenancePerHour: 0.1,

    preparationMinutes: 0,
    sandingMinutes: 0,
    assemblyMinutes: 0,
    laborRate: 25,

    failureRate: 10,
    marginCoef: 2,
    vatRate: 17
  });

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  const calc = useMemo(() => {
    const totalWeight = n(form.partWeight) + n(form.supportWeight);
    const printTime = n(form.printHours) + n(form.printMinutes) / 60;
    const humanTime =
      (n(form.preparationMinutes) +
        n(form.sandingMinutes) +
        n(form.assemblyMinutes)) /
      60;

    const materialCost =
      (totalWeight / Math.max(1, n(form.spoolWeight))) * n(form.spoolPrice);

    const electricityCost =
      n(form.powerKw) * printTime * n(form.electricityPrice);

    const machineHourlyCost =
      n(form.printerPrice) / Math.max(1, n(form.printerLifetimeHours));

    const machineCost = machineHourlyCost * printTime;
    const maintenanceCost = printTime * n(form.maintenancePerHour);
    const laborCost = humanTime * n(form.laborRate);

    const subtotal =
      materialCost +
      electricityCost +
      machineCost +
      maintenanceCost +
      laborCost;

    const failureCost = subtotal * (n(form.failureRate) / 100);
    const costWithRisk = subtotal + failureCost;
    const totalHT = costWithRisk * n(form.marginCoef);
const marginAmount = totalHT - costWithRisk;
    const vatAmount = totalHT * (n(form.vatRate) / 100);
    const totalTTC = totalHT + vatAmount;

    return {
      totalWeight,
      printTime,
      humanTime,
      materialCost,
      electricityCost,
      machineHourlyCost,
      machineCost,
      maintenanceCost,
      laborCost,
      subtotal,
      failureCost,
      marginAmount,
      totalHT,
      vatAmount,
      totalTTC
    };
  }, [form]);

  function copySummary() {
    const text = `Calcul impression 3D - ${form.projectName || "Projet"}

Matière : ${form.material}
Poids pièce : ${form.partWeight} g
Poids supports : ${form.supportWeight} g
Poids total : ${calc.totalWeight} g
Temps impression : ${form.printHours} h ${form.printMinutes} min

Coût matière : ${euro(calc.materialCost)}
Électricité : ${euro(calc.electricityCost)}
Amortissement machine : ${euro(calc.machineCost)}
Maintenance : ${euro(calc.maintenanceCost)}
Main-d'œuvre : ${euro(calc.laborCost)}
Risque échec : ${euro(calc.failureCost)}
Coefficient : x${form.marginCoef}
Marge : ${euro(calc.marginAmount)}

Total HT : ${euro(calc.totalHT)}
TVA : ${euro(calc.vatAmount)}
Prix conseillé TTC : ${euro(calc.totalTTC)}`;

    navigator.clipboard.writeText(text);
    showToast("Calcul copié dans le presse-papier.", "success");
  }


  function createProduct() {
    if (!form.projectName.trim()) {
      showToast("Nom du projet manquant", "error");
      return;
    }

    const nextNumber =
      (data.products || []).length + 1;

    const sku =
      `3D-${String(nextNumber).padStart(4, "0")}`;

    const product = {
      id: crypto.randomUUID(),
      sku,
      name: form.projectName.trim(),
      description: `Impression 3D

Matière :
${form.material}

Poids total :
${calc.totalWeight} g

Temps impression :
${calc.printTime.toFixed(2)} h

Détail calcul :
Matière : ${euro(calc.materialCost)}
Électricité : ${euro(calc.electricityCost)}
Amortissement machine : ${euro(calc.machineCost)}
Maintenance : ${euro(calc.maintenanceCost)}
Main-d'œuvre : ${euro(calc.laborCost)}
Risque échec : ${euro(calc.failureCost)}
Coefficient : x${form.marginCoef}
Marge : ${euro(calc.marginAmount)}
Total HT : ${euro(calc.totalHT)}
TVA : ${euro(calc.vatAmount)}
TTC conseillé : ${euro(calc.totalTTC)}`,
      category: "Impression 3D",
      price: Number(calc.totalHT || 0),
      stock: 0,
      createdAt: new Date().toISOString()
    };

    setData({
      ...data,
      products: [
        ...(data.products || []),
        product
      ]
    });

    logActivity?.({
      action: "Produit 3D créé",
      target: product.name,
      details: euro(calc.totalHT)
    });

    showToast("Produit créé dans Produits.", "success");
  }

  function createQuote() {
    const label = form.projectName.trim() || `Impression 3D ${form.material}`;

    openQuoteFromCalculator(navigate, {
      source: "calculateur 3D",
      lines: [
        buildCalculatorQuoteLine({
          description: `${label}

Matière : ${form.material}
Poids pièce : ${form.partWeight} g
Temps impression : ${form.printHours}h ${form.printMinutes}min`,
          quantity: 1,
          priceHT: calc.totalHT,
          sku: "3D-CALC",
          category: "Impression 3D",
        }),
      ],
    });
  }

  return (
    <section className="print3d-page">
      <div className="page-header">
        <div>
          <h2>Calculateur impression 3D</h2>
          <p>Calcul pro avec matière, machine, électricité, main-d’œuvre, risque et marge.</p>
        </div>
      </div>

      <div className="print3d-layout">
        <form className="card print3d-form">
          <div className="print3d-section">
            <div className="print3d-section-title">
              <span>🧩</span>
              <strong>Projet</strong>
            </div>

            <div className="print3d-grid">
              <label>
                Nom du projet
                <input
                  value={form.projectName}
                  onChange={(e) => update("projectName", e.target.value)}
                  placeholder="Ex : Support mural"
                />
              </label>

              <label>
                Matière
                <select
                  value={form.material}
                  onChange={(e) => update("material", e.target.value)}
                >
                  <option>PLA</option>
                  <option>PETG</option>
                  <option>ABS</option>
                  <option>TPU</option>
                  <option>Résine</option>
                  <option>Autre</option>
                </select>
              </label>
            </div>
          </div>

          <div className="print3d-section">
            <div className="print3d-section-title">
              <span>🧵</span>
              <strong>Matière</strong>
            </div>

            <div className="print3d-grid">
              <label>
                Poids pièce (g)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.partWeight}
                  onChange={(e) => update("partWeight", e.target.value)}
                />
              </label>

              <label>
                Poids supports (g)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.supportWeight}
                  onChange={(e) => update("supportWeight", e.target.value)}
                />
              </label>

              <label>
                Prix bobine / résine (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.spoolPrice}
                  onChange={(e) => update("spoolPrice", e.target.value)}
                />
              </label>

              <label>
                Poids bobine / bouteille (g)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.spoolWeight}
                  onChange={(e) => update("spoolWeight", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="print3d-section">
            <div className="print3d-section-title">
              <span>⏱️</span>
              <strong>Impression et machine</strong>
            </div>

            <div className="print3d-grid">
              <label>
                Temps impression heures
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.printHours}
                  onChange={(e) => update("printHours", e.target.value)}
                />
              </label>

              <label>
                Temps impression minutes
                <input
                  type="number"
                  min="0"
                  max="59"
                  step="1"
                  value={form.printMinutes}
                  onChange={(e) => update("printMinutes", e.target.value)}
                />
              </label>

              <label>
                Prix imprimante (€)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.printerPrice}
                  onChange={(e) => update("printerPrice", e.target.value)}
                />
              </label>

              <label>
                Durée de vie imprimante (h)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.printerLifetimeHours}
                  onChange={(e) => update("printerLifetimeHours", e.target.value)}
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
            </div>
          </div>

          <div className="print3d-section">
            <div className="print3d-section-title">
              <span>🛠️</span>
              <strong>Post-traitement</strong>
            </div>

            <div className="print3d-grid">
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
                Ponçage / nettoyage (min)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.sandingMinutes}
                  onChange={(e) => update("sandingMinutes", e.target.value)}
                />
              </label>

              <label>
                Assemblage (min)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.assemblyMinutes}
                  onChange={(e) => update("assemblyMinutes", e.target.value)}
                />
              </label>

              <label>
                Main-d’œuvre (€/h)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.laborRate}
                  onChange={(e) => update("laborRate", e.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="print3d-section">
            <div className="print3d-section-title">
              <span>📈</span>
              <strong>Commercial</strong>
            </div>

            <div className="print3d-grid">
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

              <label>
                Risque échec (%)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.failureRate}
                  onChange={(e) => update("failureRate", e.target.value)}
                />
              </label>

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

        <aside className="card print3d-result-card">
          <div className="print3d-price">
            <span>Prix conseillé TTC</span>
            <strong>{euro(calc.totalTTC)}</strong>
          </div>

          <div className="print3d-total-ht">
            <span>Total HT</span>
            <strong>{euro(calc.totalHT)}</strong>
          </div>

          <div className="print3d-breakdown">
            <div>
              <span>Poids total</span>
              <strong>{calc.totalWeight.toLocaleString("fr-FR")} g</strong>
            </div>

            <div>
              <span>Temps impression</span>
              <strong>{calc.printTime.toFixed(2)} h</strong>
            </div>

            <div>
              <span>Matière</span>
              <strong>{euro(calc.materialCost)}</strong>
            </div>

            <div>
              <span>Électricité</span>
              <strong>{euro(calc.electricityCost)}</strong>
            </div>

            <div>
              <span>Amortissement machine</span>
              <strong>{euro(calc.machineCost)}</strong>
            </div>

            <div>
              <span>Maintenance</span>
              <strong>{euro(calc.maintenanceCost)}</strong>
            </div>

            <div>
              <span>Main-d’œuvre</span>
              <strong>{euro(calc.laborCost)}</strong>
            </div>

            <div>
              <span>Risque échec</span>
              <strong>{euro(calc.failureCost)}</strong>
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

         <div className="print3d-actions">
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

          <p className="print3d-note">
            Formule pro : matière + électricité + amortissement machine + maintenance + main-d’œuvre + risque + marge + TVA.
          </p>

          <CalculatorProjectLibrary
            calculatorType={CALCULATOR_TYPES.print3d}
            currentName={form.projectName}
            getFormSnapshot={() => form}
            onLoadForm={(snapshot) => setForm((current) => ({ ...current, ...snapshot }))}
            onSyncSettings={() =>
              setData((current) => ({
                ...current,
                settings: syncCalculatorProjectsIntoSettings(current.settings || {}),
              }))
            }
          />
        </aside>
      </div>
    </section>
  );
}