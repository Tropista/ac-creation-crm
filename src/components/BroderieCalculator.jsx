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
  { label: "Logo simple",   points: 3000  },
  { label: "Logo moyen",    points: 8000  },
  { label: "Logo complexe", points: 15000 },
  { label: "Grand motif",   points: 25000 },
  { label: "Dos complet",   points: 50000 },
];

function euro(v) {
  return Number(v || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function num(v, digits = 3) {
  return Number(v || 0).toLocaleString("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function BroderieCalculator({ data, setData, logActivity }) {
  const navigate = useNavigate();

  // ── Projet ─────────────────────────────────────────────────────────
  const [projectName, setProjectName] = useState("");
  const [supportType, setSupportType] = useState("Polo");

  // ── Motif ──────────────────────────────────────────────────────────
  const [inputMode,    setInputMode]    = useState("manual");
  const [manualPoints, setManualPoints] = useState(8000);
  const [logoWidth,    setLogoWidth]    = useState(10);
  const [logoHeight,   setLogoHeight]   = useState(8);
  const [numColors,    setNumColors]    = useState(3);

  // ── Machine & matière ──────────────────────────────────────────────
  const [costPer1000,          setCostPer1000]          = useState(0.50);
  const [isCalibrated_machine, setIsCalibrated_machine] = useState(false);
  const [showCalibMachine,     setShowCalibMachine]     = useState(false);
  const [calibMachine,         setCalibMachine]         = useState({
    prixMachine:   1600,
    dureeVieH:     10000,
    maintenanceH:  0.10,
    consommablesH: 0.05,
  });

  const [threadCost,       setThreadCost]       = useState(0.25);
  const [isCalibrated_fil, setIsCalibrated_fil] = useState(false);
  const [showCalibFil,     setShowCalibFil]     = useState(false);
  const [calibFil,         setCalibFil]         = useState({
    prixBobine:  5.00,
    metraBobine: 5000,
    consoPieceM: 100,
    pertesPct:   15,
  });

  const [garmentCost,  setGarmentCost]  = useState(0);
  const [machineSpeed, setMachineSpeed] = useState(800);

  // ── Setup & atelier ────────────────────────────────────────────────
  const [setupMin,    setSetupMin]    = useState(15);
  const [finishMin,   setFinishMin]   = useState(5);
  const [hourlyRate,  setHourlyRate]  = useState(25);
  const [maintenance, setMaintenance] = useState(0.10);

  // ── Commercial ─────────────────────────────────────────────────────
  const [riskPct,   setRiskPct]   = useState(5);
  const [coefMarge, setCoefMarge] = useState(2);
  const [tvaPct,    setTvaPct]    = useState(17);
  const [quantity,  setQuantity]  = useState(1);

  // ── Résultats calibration machine (temps réel) ─────────────────────
  const calibMachineResult = useMemo(() => {
    const ptsParHeure = machineSpeed * 60;
    const coutHoraire =
      (calibMachine.dureeVieH > 0 ? calibMachine.prixMachine / calibMachine.dureeVieH : 0) +
      calibMachine.maintenanceH +
      calibMachine.consommablesH;
    const cout1000pts = ptsParHeure > 0 ? (coutHoraire / ptsParHeure) * 1000 : 0;
    return { ptsParHeure, coutHoraire, cout1000pts };
  }, [calibMachine, machineSpeed]);

  // ── Résultats calibration fil (temps réel) ─────────────────────────
  const calibFilResult = useMemo(() => {
    const coutMetre       = calibFil.metraBobine > 0 ? calibFil.prixBobine / calibFil.metraBobine : 0;
    const coutMetrePertes = coutMetre * (1 + calibFil.pertesPct / 100);
    const coutFilCouleur  = coutMetrePertes * calibFil.consoPieceM;
    return { coutMetre, coutMetrePertes, coutFilCouleur };
  }, [calibFil]);

  // ── Calculs principaux ─────────────────────────────────────────────
  const calc = useMemo(() => {
    const points = inputMode === "size"
      ? Math.round(logoWidth * logoHeight * 1000)
      : manualPoints;

    const timeMachineH = machineSpeed > 0 ? points / machineSpeed / 60 : 0;

    const cFil         = threadCost * numColors;
    const cMachine     = (points / 1000) * costPer1000;
    const cAmort       = calibMachine.dureeVieH > 0
      ? (timeMachineH / calibMachine.dureeVieH) * calibMachine.prixMachine
      : 0;
    const cMaintenance = timeMachineH * maintenance;
    const timeMOH      = (setupMin + finishMin) / 60;
    const cMO          = timeMOH * hourlyRate;
    const cVetement    = garmentCost;

    const sousTotal = cFil + cMachine + cAmort + cMaintenance + cMO + cVetement;
    const cRisque   = (cFil + cMachine + cAmort + cMaintenance + cMO) * (riskPct / 100);
    const totalAvantMarge = sousTotal + cRisque;

    const priceHT   = totalAvantMarge * coefMarge;
    const tva       = priceHT * (tvaPct / 100);
    const priceTTC  = priceHT + tva;
    const margeAmount  = priceHT - totalAvantMarge;
    const totalHTQte   = priceHT * quantity;
    const totalTTCQte  = priceTTC * quantity;

    return {
      points, timeMachineH,
      cFil, cMachine, cAmort, cMaintenance, cMO, cVetement,
      sousTotal, cRisque, totalAvantMarge,
      margeAmount, priceHT, tva, priceTTC,
      totalHTQte, totalTTCQte,
    };
  }, [inputMode, manualPoints, logoWidth, logoHeight, numColors,
      costPer1000, threadCost, garmentCost, calibMachine, machineSpeed,
      setupMin, finishMin, hourlyRate, maintenance,
      riskPct, coefMarge, tvaPct, quantity]);

  function applyPreset(pts) {
    setInputMode("manual");
    setManualPoints(pts);
  }

  function applyCalibMachine() {
    const v = Math.round(calibMachineResult.cout1000pts * 10000) / 10000;
    setCostPer1000(v);
    setIsCalibrated_machine(true);
    setShowCalibMachine(false);
  }

  function applyCalibFil() {
    const v = Math.round(calibFilResult.coutFilCouleur * 10000) / 10000;
    setThreadCost(v);
    setIsCalibrated_fil(true);
    setShowCalibFil(false);
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
    const label = projectName.trim() ||
      `Broderie ${supportType} ${calc.points.toLocaleString("fr-FR")} pts`;
    openQuoteFromCalculator(navigate, {
      source: "calculateur broderie",
      lines: [
        buildCalculatorQuoteLine({
          description: `${label}\n\nSupport : ${supportType}\nPoints : ${calc.points.toLocaleString("fr-FR")} · ${numColors} couleurs\nTemps machine : ${calc.timeMachineH.toFixed(2)} h`,
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
    const sku   = `BROD-${String(nextN).padStart(4, "0")}`;

    const product = {
      id:          crypto.randomUUID(),
      sku,
      name,
      description: `Broderie — ${calc.points.toLocaleString("fr-FR")} points · ${numColors} couleurs\nSupport : ${supportType}\n\nCoût HT unitaire : ${euro(calc.priceHT)} €`,
      price:       calc.priceHT,
      category:    "Broderie",
      stock:       0,
      stockMin:    0,
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

        {/* ── Formulaire ──────────────────────────────────────────────── */}
        <div className="broderie-form">

          {/* Projet */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">📋</span>Projet
            </div>
            <div className="broderie-grid">
              <label className="broderie-field">
                <span>Nom du projet (optionnel)</span>
                <input
                  type="text" placeholder="Ex : Logo client Polo M"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </label>
              <label className="broderie-field">
                <span>Support</span>
                <select value={supportType} onChange={(e) => setSupportType(e.target.value)}>
                  {SUPPORT_TYPES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="broderie-field">
                <span>Quantité (pièces)</span>
                <input
                  type="number" min="1" step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                />
              </label>
            </div>
          </div>

          {/* Motif */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">🎨</span>Définition du motif
            </div>
            <div className="broderie-mode-toggle">
              <button type="button" className={inputMode === "manual" ? "active" : ""} onClick={() => setInputMode("manual")}>
                Saisie directe (points)
              </button>
              <button type="button" className={inputMode === "size" ? "active" : ""} onClick={() => setInputMode("size")}>
                Par taille (cm)
              </button>
            </div>

            {inputMode === "manual" ? (
              <div className="broderie-grid">
                <label className="broderie-field">
                  <span>Nombre de points</span>
                  <input
                    type="number" min="100" step="100"
                    value={manualPoints}
                    onChange={(e) => setManualPoints(Number(e.target.value))}
                  />
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

            {/* Coût / 1 000 points */}
            <div className="broderie-field">
              <div className="broderie-field-header">
                <span>Coût / 1 000 points (€)</span>
                {isCalibrated_machine && <span className="broderie-calibrated-badge">CALIBRÉ</span>}
                <div className="broderie-mode-toggle broderie-field-toggle">
                  <button
                    type="button"
                    className={!showCalibMachine ? "active" : ""}
                    onClick={() => setShowCalibMachine(false)}
                  >
                    Manuel
                  </button>
                  <button
                    type="button"
                    className={showCalibMachine ? "active" : ""}
                    onClick={() => setShowCalibMachine(true)}
                  >
                    Calibrer
                  </button>
                </div>
              </div>
              <input
                type="number" min="0" step="0.01"
                value={costPer1000}
                onChange={(e) => {
                  setCostPer1000(Number(e.target.value));
                  setIsCalibrated_machine(false);
                }}
              />
              {showCalibMachine && (
                <div className="broderie-calib-panel">
                  <div className="broderie-calib-title">🔧 Calibration coût machine</div>
                  <div className="broderie-grid">
                    <label className="broderie-field">
                      <span>Prix machine (€)</span>
                      <input
                        type="number" min="0" step="100"
                        value={calibMachine.prixMachine}
                        onChange={(e) => setCalibMachine((p) => ({ ...p, prixMachine: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="broderie-field">
                      <span>Durée de vie (h)</span>
                      <input
                        type="number" min="100" step="500"
                        value={calibMachine.dureeVieH}
                        onChange={(e) => setCalibMachine((p) => ({ ...p, dureeVieH: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="broderie-field">
                      <span>Vitesse (pts/min)</span>
                      <input
                        type="number" min="100" step="50"
                        value={machineSpeed}
                        onChange={(e) => setMachineSpeed(Number(e.target.value))}
                      />
                    </label>
                    <label className="broderie-field">
                      <span>Maintenance (€/h)</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={calibMachine.maintenanceH}
                        onChange={(e) => setCalibMachine((p) => ({ ...p, maintenanceH: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="broderie-field">
                      <span>Consommables/h (€)</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={calibMachine.consommablesH}
                        onChange={(e) => setCalibMachine((p) => ({ ...p, consommablesH: Number(e.target.value) }))}
                      />
                    </label>
                  </div>
                  <div className="broderie-calib-divider" />
                  <div className="broderie-calib-result">
                    <div>Coût horaire machine : <strong>{euro(calibMachineResult.coutHoraire)} €/h</strong></div>
                    <div>Points / heure : <strong>{calibMachineResult.ptsParHeure.toLocaleString("fr-FR")} pts/h</strong></div>
                    <div className="broderie-calib-highlight">
                      ➜ Coût calculé / 1 000 pts : <strong>{num(calibMachineResult.cout1000pts)} €</strong>
                    </div>
                  </div>
                  <button type="button" className="primary broderie-calib-apply" onClick={applyCalibMachine}>
                    ✅ Appliquer {num(calibMachineResult.cout1000pts)} €
                  </button>
                </div>
              )}
            </div>

            {/* Coût fil / couleur */}
            <div className="broderie-field">
              <div className="broderie-field-header">
                <span>Coût fil / couleur (€)</span>
                {isCalibrated_fil && <span className="broderie-calibrated-badge">CALIBRÉ</span>}
                <div className="broderie-mode-toggle broderie-field-toggle">
                  <button
                    type="button"
                    className={!showCalibFil ? "active" : ""}
                    onClick={() => setShowCalibFil(false)}
                  >
                    Manuel
                  </button>
                  <button
                    type="button"
                    className={showCalibFil ? "active" : ""}
                    onClick={() => setShowCalibFil(true)}
                  >
                    Calibrer
                  </button>
                </div>
              </div>
              <input
                type="number" min="0" step="0.05"
                value={threadCost}
                onChange={(e) => {
                  setThreadCost(Number(e.target.value));
                  setIsCalibrated_fil(false);
                }}
              />
              {showCalibFil && (
                <div className="broderie-calib-panel">
                  <div className="broderie-calib-title">🔧 Calibration coût fil</div>
                  <div className="broderie-grid">
                    <label className="broderie-field">
                      <span>Prix bobine (€)</span>
                      <input
                        type="number" min="0" step="0.5"
                        value={calibFil.prixBobine}
                        onChange={(e) => setCalibFil((p) => ({ ...p, prixBobine: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="broderie-field">
                      <span>Métrage bobine (m)</span>
                      <input
                        type="number" min="1" step="100"
                        value={calibFil.metraBobine}
                        onChange={(e) => setCalibFil((p) => ({ ...p, metraBobine: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="broderie-field">
                      <span>Consommation / pièce (m)</span>
                      <input
                        type="number" min="1" step="5"
                        value={calibFil.consoPieceM}
                        onChange={(e) => setCalibFil((p) => ({ ...p, consoPieceM: Number(e.target.value) }))}
                      />
                    </label>
                    <label className="broderie-field">
                      <span>Chutes / pertes (%)</span>
                      <input
                        type="number" min="0" max="50" step="1"
                        value={calibFil.pertesPct}
                        onChange={(e) => setCalibFil((p) => ({ ...p, pertesPct: Number(e.target.value) }))}
                      />
                    </label>
                  </div>
                  <div className="broderie-calib-divider" />
                  <div className="broderie-calib-result">
                    <div>Coût / mètre : <strong>{num(calibFilResult.coutMetre)} €/m</strong></div>
                    <div>Avec pertes ({calibFil.pertesPct}%) : <strong>{num(calibFilResult.coutMetrePertes)} €/m</strong></div>
                    <div className="broderie-calib-highlight">
                      ➜ Coût calculé / couleur : <strong>{euro(calibFilResult.coutFilCouleur)} €</strong>
                    </div>
                  </div>
                  <button type="button" className="primary broderie-calib-apply" onClick={applyCalibFil}>
                    ✅ Appliquer {euro(calibFilResult.coutFilCouleur)} €
                  </button>
                </div>
              )}
            </div>

            <div className="broderie-grid">
              <label className="broderie-field">
                <span>Coût vêtement (€)</span>
                <input
                  type="number" min="0" step="0.50"
                  value={garmentCost}
                  onChange={(e) => setGarmentCost(Number(e.target.value))}
                />
              </label>
              <label className="broderie-field">
                <span>Vitesse machine (pts/min)</span>
                <input
                  type="number" min="100" step="50"
                  value={machineSpeed}
                  onChange={(e) => setMachineSpeed(Number(e.target.value))}
                />
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

        {/* ── Résultats ─────────────────────────────────────────────── */}
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
