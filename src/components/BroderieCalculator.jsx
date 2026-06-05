import { useMemo, useState } from "react";
import { showToast } from "../utils/toast";
import "../styles/broderie-calculator.css";

const VAT_RATE = 0.20;

const STITCH_PRESETS = [
  { label: "Logo simple (3 000 pts)",  points: 3000  },
  { label: "Logo moyen (8 000 pts)",   points: 8000  },
  { label: "Logo complexe (15 000 pts)", points: 15000 },
  { label: "Grand motif (25 000 pts)", points: 25000  },
  { label: "Dos complet (50 000 pts)", points: 50000  },
];

const COLOR_OPTIONS = Array.from({ length: 15 }, (_, i) => i + 1);

export default function BroderieCalculator({ logActivity }) {
  // ── Saisie manuelle des points ou via dimensions ──────────────────────
  const [inputMode, setInputMode]         = useState("manual"); // "manual" | "size"
  const [manualPoints, setManualPoints]   = useState(8000);
  const [logoWidth,  setLogoWidth]        = useState(10);   // cm
  const [logoHeight, setLogoHeight]       = useState(8);    // cm

  // ── Coûts ────────────────────────────────────────────────────────────
  const [costPer1000,    setCostPer1000]   = useState(0.50);  // € / 1000 pts
  const [threadCost,     setThreadCost]    = useState(0.30);  // € par couleur
  const [setupMinutes,   setSetupMinutes]  = useState(15);    // minutes
  const [hourlyRate,     setHourlyRate]    = useState(45);    // €/h
  const [garmentCost,    setGarmentCost]   = useState(0);     // € vêtement
  const [margin,         setMargin]        = useState(30);    // %
  const [quantity,       setQuantity]      = useState(1);
  const [numColors,      setNumColors]     = useState(3);     // couleurs fil

  // ── Calculs ──────────────────────────────────────────────────────────
  const calc = useMemo(() => {
    const points = inputMode === "size"
      ? Math.round(logoWidth * logoHeight * 1000)
      : manualPoints;

    const machineCost = (points / 1000) * costPer1000;
    const filCost     = threadCost * numColors;
    const setupCost   = (setupMinutes / 60) * hourlyRate;
    const subtotal    = machineCost + filCost + setupCost + garmentCost;
    const margeAmount = subtotal * (margin / 100);
    const unitPrice   = subtotal + margeAmount;
    const totalPrice  = unitPrice * quantity;
    const totalHT     = totalPrice;
    const totalTTC    = totalPrice * (1 + VAT_RATE);

    return {
      points,
      machineCost,
      filCost,
      setupCost,
      subtotal,
      margeAmount,
      unitPrice,
      totalPrice,
      totalHT,
      totalTTC,
    };
  }, [inputMode, manualPoints, logoWidth, logoHeight, costPer1000, threadCost,
      setupMinutes, hourlyRate, garmentCost, margin, quantity, numColors]);

  function fmt(v, decimals = 2) {
    return Number(v || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function applyPreset(points) {
    setInputMode("manual");
    setManualPoints(points);
  }

  function copyResults() {
    const text = `Broderie — ${calc.points.toLocaleString("fr-FR")} points × ${quantity} pce
Prix unitaire HT : ${fmt(calc.unitPrice)} €
Total HT : ${fmt(calc.totalHT)} €
Total TTC : ${fmt(calc.totalTTC)} €`;
    navigator.clipboard.writeText(text).then(() => showToast("Résultats copiés.", "success"));
    logActivity?.("Copie résultats broderie", `${calc.points} pts × ${quantity}`);
  }

  return (
    <section className="broderie-page">
      <div className="page-header">
        <div>
          <h2>🧵 Calculateur Broderie</h2>
          <p>Calcul du coût de revient et prix de vente pour la broderie machine</p>
        </div>
      </div>

      <div className="broderie-layout">
        {/* ── Formulaire ─────────────────────────────────────────── */}
        <div className="broderie-form">

          {/* Mode de saisie */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">📐</span>
              Définition du motif
            </div>
            <div className="broderie-mode-toggle">
              <button
                type="button"
                className={inputMode === "manual" ? "active" : ""}
                onClick={() => setInputMode("manual")}
              >
                Saisie directe (points)
              </button>
              <button
                type="button"
                className={inputMode === "size" ? "active" : ""}
                onClick={() => setInputMode("size")}
              >
                Par taille (cm)
              </button>
            </div>

            {inputMode === "manual" ? (
              <div className="broderie-grid">
                <label className="broderie-field">
                  <span>Nombre de points</span>
                  <input
                    type="number"
                    min="100"
                    step="100"
                    value={manualPoints}
                    onChange={(e) => setManualPoints(Number(e.target.value))}
                  />
                </label>
                <label className="broderie-field">
                  <span>Couleurs de fil</span>
                  <select value={numColors} onChange={(e) => setNumColors(Number(e.target.value))}>
                    {COLOR_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} couleur{n > 1 ? "s" : ""}</option>
                    ))}
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
                    {COLOR_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} couleur{n > 1 ? "s" : ""}</option>
                    ))}
                  </select>
                </label>
                <div className="broderie-field">
                  <span>Points estimés</span>
                  <div className="broderie-computed">{calc.points.toLocaleString("fr-FR")} pts</div>
                </div>
              </div>
            )}

            {/* Presets */}
            <div className="broderie-presets">
              {STITCH_PRESETS.map((p) => (
                <button key={p.label} type="button" onClick={() => applyPreset(p.points)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Coûts machine */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">⚙️</span>
              Coûts machine & matière
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
            </div>
          </div>

          {/* Setup & atelier */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">🏭</span>
              Setup & atelier
            </div>
            <div className="broderie-grid">
              <label className="broderie-field">
                <span>Temps setup (min)</span>
                <input type="number" min="0" step="1" value={setupMinutes} onChange={(e) => setSetupMinutes(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Taux horaire atelier (€/h)</span>
                <input type="number" min="0" step="1" value={hourlyRate} onChange={(e) => setHourlyRate(Number(e.target.value))} />
              </label>
            </div>
          </div>

          {/* Marge & quantité */}
          <div className="card broderie-section">
            <div className="broderie-section-title">
              <span className="broderie-icon">💰</span>
              Marge & quantité
            </div>
            <div className="broderie-grid">
              <label className="broderie-field">
                <span>Marge bénéficiaire (%)</span>
                <input type="number" min="0" max="200" step="1" value={margin} onChange={(e) => setMargin(Number(e.target.value))} />
              </label>
              <label className="broderie-field">
                <span>Quantité (pièces)</span>
                <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))} />
              </label>
            </div>
          </div>
        </div>

        {/* ── Résultats ────────────────────────────────────────────── */}
        <aside className="card broderie-result-card">

          {/* Prix principal */}
          <div className="broderie-price">
            <span>Prix de vente unitaire TTC</span>
            <strong>{fmt(calc.unitPrice * (1 + VAT_RATE))} €</strong>
            <small>{calc.points.toLocaleString("fr-FR")} points · {numColors} couleur{numColors > 1 ? "s" : ""}</small>
          </div>

          {/* Stats rapides */}
          <div className="broderie-stats-row">
            <div className="stat">
              <span>Prix unitaire HT</span>
              <strong>{fmt(calc.unitPrice)} €</strong>
            </div>
            <div className="stat">
              <span>Total {quantity} pce{quantity > 1 ? "s" : ""} HT</span>
              <strong>{fmt(calc.totalHT)} €</strong>
            </div>
            <div className="stat">
              <span>Total TTC</span>
              <strong>{fmt(calc.totalTTC)} €</strong>
            </div>
          </div>

          {/* Détail des coûts */}
          <div className="broderie-breakdown">
            <div><span>Coût machine</span><strong>{fmt(calc.machineCost)} €</strong></div>
            <div><span>Coût fil ({numColors} couleurs)</span><strong>{fmt(calc.filCost)} €</strong></div>
            <div><span>Setup atelier</span><strong>{fmt(calc.setupCost)} €</strong></div>
            {garmentCost > 0 && <div><span>Vêtement</span><strong>{fmt(garmentCost)} €</strong></div>}
            <div className="broderie-breakdown--subtotal">
              <span>Sous-total / pièce</span>
              <strong>{fmt(calc.subtotal)} €</strong>
            </div>
            <div><span>Marge ({margin} %)</span><strong>+ {fmt(calc.margeAmount)} €</strong></div>
          </div>

          <div className="broderie-actions">
            <button type="button" className="primary" onClick={copyResults}>
              📋 Copier les résultats
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
