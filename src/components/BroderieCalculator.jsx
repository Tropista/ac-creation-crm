import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showToast } from "../utils/toast";
import {
  buildCalculatorQuoteLine,
  openQuoteFromCalculator,
} from "../utils/quoteDraft";
import "../styles/broderie-calculator.css";

const SUPPORT_TYPES = ["Polo", "T-shirt", "Veste", "Casquette", "Sac", "Autre"];
const COLOR_OPTIONS  = Array.from({ length: 15 }, (_, i) => i + 1);

const STITCH_PRESETS = [
  { label: "Logo simple",    points: 3000  },
  { label: "Logo moyen",     points: 8000  },
  { label: "Logo complexe",  points: 15000 },
  { label: "Grand motif",    points: 25000 },
  { label: "Dos complet",    points: 50000 },
];

function euro(v) {
  return Number(v || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function BroderieCalculator({ data, setData, logActivity }) {
  const navigate = useNavigate();

  // ── Projet ─────────────────────────────────────────────────────────
  const [projectName,  setProjectName]  = useState("");
  const [supportType,  setSupportType]  = useState("Polo");

  // ── Motif ──────────────────────────────────────────────────────────
  const [inputMode,     setInputMode]    = useState("manual");
  const [manualPoints,  setManualPoints] = useState(8000);
  const [logoWidth,     setLogoWidth]    = useState(10);
  const [logoHeight,    setLogoHeight]   = useState(8);
  const [numColors,     setNumColors]    = useState(3);

  // ── Machine & matière ──────────────────────────────────────────────
  const [costPer1000,   setCostPer1000]  = useState(0.50);
  const [threadCost,    setThreadCost]   = useState(0.30);
  const [garmentCost,   setGarmentCost]  = useState(0);
  const [machinePrice,  setMachinePrice] = useState(8000);
  const [machineLife,   setMachineLife]  = useState(10000);
  const [machineSpeed,  setMachineSpeed] = useState(800);  // pts/min

  // ── Setup & atelier ────────────────────────────────────────────────
  const [setupMin,      setSetupMin]     = useState(15);
  const [finishMin,     setFinishMin]    = useState(5);
  const [hourlyRate,    setHourlyRate]   = useState(25);
  const [maintenance,   setMaintenance]  = useState(0.10);

  // ── Commercial ─────────────────────────────────────────────────────
  const [riskPct,       setRiskPct]      = useState(5);
  const [coefMarge,     setCoefMarge]    = useState(2);
  const [tvaPct,        setTvaPct]       = useState(17);
  const [quantity,      setQuantity]     = useState(1);

  // ── Calculs ────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const points = inputMode === "size"
      ? Math.round(logoWidth * logoHeight * 1000)
      : manualPoints;

    const timeMachineH = points / machineSpeed / 60;

    const cFil          = threadCost * numColors;
    const cMachine      = (points / 1000) * costPer1000;
    const cAmort        = machineLife > 0 ? (timeMachineH / machineLife) * machinePrice : 0;
    const cMaintenance  = timeMachineH * maintenance;
    const timeMOH       = (setupMin + finishMin) / 60;
    const cMO           = timeMOH * hourlyRate;
    const cVetement     = garmentCost;

    const sousTotal = cFil + cMachine + cAmort + cMaintenance + cMO + cVetement;

    const cRisque = (cFil + cMachine + cAmort + cMaintenance + cMO) * (riskPct / 100);
    const totalAvantMarge = sousTotal + cRisque;

    const priceHT  = totalAvantMarge * coefMarge;
    const tva      = priceHT * (tvaPct / 100);
    const priceTTC = priceHT + tva;

    const totalHTQte  = priceHT * quantity;
    const totalTTCQte = priceTTC * quantity;

    const margeAmount = priceHT - totalAvantMarge;

    return {
      points, timeMachineH,
      cFil, cMachine, cAmort, cMaintenance, cMO, cVetement,
      sousTotal, cRisque, totalAvantMarge,
      margeAmount, priceHT, tva, priceTTC,
      totalHTQte, totalTTCQte,
    };
  }, [inputMode, manualPoints, logoWidth, logoHeight, numColors,
      costPer1000, threadCost, garmentCost, machinePrice, machineLife, machineSpeed,
      setupMin, finishMin, hourlyRate, maintenance,
      riskPct, coefMarge, tvaPct, quantity]);

  function applyPreset(points) {
    setInputMode("manual");
    setManualPoints(points);
  }

  function copySummary() {
    const label = projectName.trim() || `Broderie ${supportType}`;
    const text = [
      `🧵 ${label} — ${calc.points.toLocaleString("fr-FR")} points · ${numColors} couleurs`,
      `Support : ${supportType}`,
      ``,
      `Fil (${numColors} couleurs)  : ${euro(calc.cFil)} €`,
      `Coût machine        : ${euro(calc.cMachine)} €`,
      `Amortissement       : ${euro(calc.cAmort)} €`,
      `Maintenance         : ${euro(calc.cMaintenance)} €`,
      `Main-d'œuvre        : ${euro(calc.cMO)} €`,
      garmentCost > 0 ? `Vêtement            : ${euro(calc.cVetement)} €` : "",
      `Sous-total          : ${euro(calc.sousTotal)} €`,
      `Risque échec (${riskPct}%) : ${euro(calc.cRisque)} €`,
      `Marge (×${coefMarge})         : ${euro(calc.margeAmount)} €`,
      `TVA (${tvaPct}%)             : ${euro(calc.tva)} €`,
      ``,
      `Prix unitaire HT    : ${euro(calc.priceHT)} €`,
      `Prix unitaire TTC   : ${euro(calc.priceTTC)} €`,
      quantity > 1 ? `Total ${quantity} pcs TTC : ${euro(calc.totalTTCQte)} €` : "",
      `⏱ Temps machine     : ${calc.timeMachineH.toFixed(2)} h`,
    ].filter(Boolean).join("\n");

    navigator.clipboard.writeText(text)
      .then(() => showToast("Résultats copiés.", "success"))
      .catch(() => showToast("Copie impossible.", "error"));

    logActivity?.("Copie broderie", `${calc.points} pts — ${euro(calc.priceTTC)} € TTC`);
  }

  function createQuote() {
    const label = projectName.trim() || `Broderie ${supportType} ${calc.points.toLocaleString("fr-FR")} pts`;
    openQuoteFromCalculator(navigate, {
      source: "calculateur broderie",
      lines: [
        buildCalculatorQuoteLine({
          description: `${label}

Support : ${supportType}
Points : ${calc.points.toLocaleString("fr-FR")} · ${numColors} couleurs
Temps machine : ${calc.timeMachineH.toFixed(2)} h`,
          quantity,
          priceHT: calc.priceHT,
          sku: "BROD-CALC",
          category: "Broderie",
          technique: "broderie",
        }),
      ],
    });
  }

  function createProduct() {
    const name = projectName.trim();
    if (!name) { showToast("Nom du projet manquant.", "error"); return; }

    const nextN = (data.products || []).length + 1;
    const sku = `BROD-${String(nextN).padStart(4, "0")}`;

    const product = {
      id:   crypto.randomUUID(),
      sku,
      name,
      description: `Broderie — ${calc.points.toLocaleString("fr-FR")} points · ${numColors} couleurs\nSupport : ${supportType}\n\nCoût HT unitaire : ${euro(calc.priceHT)} €`,
      price:    calc.priceHT,
      category: "Broderie",
      stock:    0,
      stockMin: 0,
    };

    setData({ ...data, products: [...(data.products || []), product] });
    logActivity?.("Produit broderie créé", name, euro(calc.priceHT) + " € HT");
    showToast(`Produit « ${name} » créé.`, "success");
  }

  return (
    <section className="broderie-page">
      <div className="page-header">
        <div>
          <h2>🧵 Calculateur Broderie</h2>
          <p>Coût de revient professionnel — broderie machine · Luxembourg (TVA 17 %)</p>
        </div>
      </div>

      <div className="broderie-layout">

        {/* ── Formulaire ─────────────────────────────────────────── */}
        <div className="broderie-form">

          {/* Projet */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">📋</span>Projet
            </div>
            <div className="broderie-grid">
              <label className="broderie-field">
                <span>Nom du projet (optionnel)</span>
                <input type="text" placeholder="Ex : Logo client Polo M" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
              </label>
              <label className="broderie-field">
                <span>Support</span>
                <select value={supportType} onChange={(e) => setSupportType(e.target.value)}>
                  {SUPPORT_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="broderie-field">
                <span>Quantité (pièces)</span>
                <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
              </label>
            </div>
          </div>

          {/* Motif */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">🎨</span>Définition du motif
            </div>
            <div className="broderie-mode-toggle">
              <button type="button" className={inputMode === "manual" ? "active" : ""} onClick={() => setInputMode("manual")}>Saisie directe (points)</button>
              <button type="button" className={inputMode === "size"   ? "active" : ""} onClick={() => setInputMode("size")}>Par taille (cm)</button>
            </div>

            {inputMode === "manual" ? (
              <div className="broderie-grid">
                <label className="broderie-field">
                  <span>Nombre de points</span>
                  <input type="number" min="100" step="100" value={manualPoints} onChange={(e) => setManualPoints(Number(e.target.value))} />
                </label>
                <label className="broderie-field">
                  <span>Couleurs de fil</span>
                  <select value={numColors} onChange={(e) => setNumColors(Number(e.target.value))}>
                    {COLOR_OPTIONS.map((n) => <option key={n} value={n}>{n} couleur{n > 1 ? "s" : ""}</option>)}
                  </select>
                </label>
              </div>
            ) : (
              <div className="broderie-grid">
                <label className="broderie-field">
                  <span>Largeur logo (cm)</span>
                  <input type="number" min="1" step="0.5" value={logoWidth} onChange={(e) => setLogoWidth(Number(e.target.value))} />
                </label>
                <label className="broderie-field">
                  <span>Hauteur logo (cm)</span>
                  <input type="number" min="1" step="0.5" value={logoHeight} onChange={(e) => setLogoHeight(Number(e.target.value))} />
                </label>
                <label className="broderie-field">
                  <span>Couleurs de fil</span>
                  <select value={numColors} onChange={(e) => setNumColors(Number(e.target.value))}>
                    {COLOR_OPTIONS.map((n) => <option key={n} value={n}>{n} couleur{n > 1 ? "s" : ""}</option>)}
                  </select>
                </label>
                <div className="broderie-field">
                  <span>Points estimés</span>
                  <div className="broderie-computed">{calc.points.toLocaleString("fr-FR")} pts</div>
                </div>
              </div>
            )}

            <div className="broderie-presets">
              {STITCH_PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => applyPreset(p.points)}>
                  {p.label} ({(p.points / 1000).toFixed(0)}k)
                </button>
              ))}
            </div>
          </div>

          {/* Machine & matière */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">⚙️</span>Machine & matière
            </div>
            <div className="broderie-grid">
              <label className="broderie-field">
                <span>Coût / 1 000 points (€)</span>
                <input type="number" min="0" step="0.01" value={costPer1000} onChange={(e) => setCostPer1000(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Coût fil / couleur (€)</span>
                <input type="number" min="0" step="0.05" value={threadCost} onChange={(e) => setThreadCost(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Coût vêtement (€)</span>
                <input type="number" min="0" step="0.50" value={garmentCost} onChange={(e) => setGarmentCost(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Prix machine (€)</span>
                <input type="number" min="0" step="100" value={machinePrice} onChange={(e) => setMachinePrice(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Durée vie machine (h)</span>
                <input type="number" min="100" step="500" value={machineLife} onChange={(e) => setMachineLife(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Vitesse machine (pts/min)</span>
                <input type="number" min="100" step="50" value={machineSpeed} onChange={(e) => setMachineSpeed(Number(e.target.value))} />
              </label>
            </div>
          </div>

          {/* Setup & atelier */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">🏭</span>Setup & atelier
            </div>
            <div className="broderie-grid">
              <label className="broderie-field">
                <span>Temps setup (min)</span>
                <input type="number" min="0" step="1" value={setupMin} onChange={(e) => setSetupMin(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Temps finition / contrôle (min)</span>
                <input type="number" min="0" step="1" value={finishMin} onChange={(e) => setFinishMin(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Taux horaire atelier (€/h)</span>
                <input type="number" min="0" step="1" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Maintenance (€/h machine)</span>
                <input type="number" min="0" step="0.01" value={maintenance} onChange={(e) => setMaintenance(Number(e.target.value))} />
              </label>
            </div>
          </div>

          {/* Commercial */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">📊</span>Commercial
            </div>
            <div className="broderie-grid">
              <label className="broderie-field">
                <span>Risque échec (%)</span>
                <input type="number" min="0" max="50" step="1" value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Coefficient marge (×)</span>
                <input type="number" min="1" step="0.1" value={coefMarge} onChange={(e) => setCoefMarge(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>TVA (%)</span>
                <input type="number" min="0" max="30" step="1" value={tvaPct} onChange={(e) => setTvaPct(Number(e.target.value))} />
              </label>
            </div>
          </div>
        </div>

        {/* ── Résultats ────────────────────────────────────────────── */}
        <aside className="card broderie-result-card">

          <div className="broderie-price">
            <span>Prix conseillé TTC</span>
            <strong>{euro(calc.priceTTC)} €</strong>
            <small>
              {calc.points.toLocaleString("fr-FR")} pts ·{" "}
              {numColors} couleur{numColors > 1 ? "s" : ""} ·{" "}
              {quantity} pce{quantity > 1 ? "s" : ""}
            </small>
          </div>

          <div className="broderie-kpis">
            <div className="stat">
              <span>Prix unitaire HT</span>
              <strong>{euro(calc.priceHT)} €</strong>
            </div>
            <div className="stat">
              <span>Total {quantity} pce{quantity > 1 ? "s" : ""} HT</span>
              <strong>{euro(calc.totalHTQte)} €</strong>
            </div>
            <div className="stat">
              <span>Total TTC</span>
              <strong>{euro(calc.totalTTCQte)} €</strong>
            </div>
          </div>

          <div className="broderie-breakdown">
            <div><span>Fil ({numColors} couleurs)</span><strong>{euro(calc.cFil)} €</strong></div>
            <div><span>Coût machine</span><strong>{euro(calc.cMachine)} €</strong></div>
            <div><span>Amortissement</span><strong>{euro(calc.cAmort)} €</strong></div>
            <div><span>Maintenance</span><strong>{euro(calc.cMaintenance)} €</strong></div>
            <div><span>Main-d&apos;œuvre</span><strong>{euro(calc.cMO)} €</strong></div>
            {garmentCost > 0 && <div><span>Vêtement</span><strong>{euro(calc.cVetement)} €</strong></div>}
            <div className="broderie-breakdown--subtotal">
              <span>Sous-total direct</span><strong>{euro(calc.sousTotal)} €</strong>
            </div>
            <div><span>Risque échec ({riskPct} %)</span><strong>+{euro(calc.cRisque)} €</strong></div>
            <div><span>Marge (×{coefMarge})</span><strong>+{euro(calc.margeAmount)} €</strong></div>
            <div><span>TVA ({tvaPct} %)</span><strong>+{euro(calc.tva)} €</strong></div>
          </div>

          <div className="broderie-time">
            <span>⏱ Temps machine estimé</span>
            <strong>{calc.timeMachineH.toFixed(2)} h</strong>
          </div>

          <div className="broderie-actions">
            <button type="button" onClick={copySummary}>📋 Copier</button>
            <button type="button" onClick={createQuote}>📄 Créer devis</button>
            <button type="button" className="primary" onClick={createProduct}>✨ Créer produit</button>
          </div>

          <p className="broderie-formula">
            Formule pro : fil + machine + amortissement + maintenance + main-d&apos;œuvre
            + vêtement + risque × marge + TVA {tvaPct} %
          </p>
        </aside>
      </div>
    </section>
  );
}
