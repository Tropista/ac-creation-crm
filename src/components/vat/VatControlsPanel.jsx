import { useMemo, useState } from "react";
import { groupAnomaliesByType } from "./vatUiUtils";

function sourceType(sourceId = "") {
  if (String(sourceId).startsWith("sale:")) return "ventes";
  if (String(sourceId).startsWith("expense:")) return "dépenses";
  if (String(sourceId).includes("supplier")) return "fournisseurs";
  return "rapport";
}

export default function VatControlsPanel({ anomalies = [], onFilterFixes, onOpenAssistant }) {
  const [levelFilter, setLevelFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const grouped = useMemo(() => groupAnomaliesByType(anomalies), [anomalies]);
  const filtered = anomalies.filter((entry) => {
    if (levelFilter && entry.level !== levelFilter) return false;
    if (sourceFilter && sourceType(entry.sourceId) !== sourceFilter) return false;
    return true;
  });

  return (
    <div className="card vat-controls-panel">
      <div className="section-title-row">
        <h3>Contrôles avant déclaration</h3>
        <div className="button-row">
          <button type="button" onClick={onFilterFixes}>
            Voir uniquement les éléments à corriger
          </button>
          <button type="button" onClick={onOpenAssistant}>
            Corriger dans l'assistant
          </button>
        </div>
      </div>

      <div className="vat-control-summary">
        {grouped.slice(0, 6).map((entry) => (
          <span key={`${entry.level}-${entry.code}`} className={`badge ${entry.level}`}>
            {entry.label}
          </span>
        ))}
      </div>

      <div className="form-grid vat-control-filters">
        <label>
          <span>Sévérité</span>
          <select value={levelFilter} onChange={(event) => setLevelFilter(event.target.value)}>
            <option value="">Toutes</option>
            <option value="error">Erreurs</option>
            <option value="warning">Avertissements</option>
            <option value="info">Informations</option>
          </select>
        </label>
        <label>
          <span>Source</span>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
            <option value="">Toutes</option>
            <option value="ventes">Ventes</option>
            <option value="dépenses">Dépenses</option>
            <option value="fournisseurs">Fournisseurs</option>
            <option value="rapport">Rapport</option>
          </select>
        </label>
      </div>

      <div className="vat-control-list">
        {filtered.length === 0 ? (
          <p className="muted">Aucun élément.</p>
        ) : filtered.map((entry, index) => (
          <article key={`${entry.code}-${entry.sourceId}-${index}`} className={`vat-control-card ${entry.level}`}>
            <span className={`badge ${entry.level}`}>{entry.level}</span>
            <strong>{entry.code}</strong>
            <p>{entry.message}</p>
            <small className="muted">Document: {entry.sourceId || "rapport"} - Source: {sourceType(entry.sourceId)}</small>
            <div className="button-row">
              <button type="button" onClick={onFilterFixes}>Ouvrir l'élément</button>
              <button type="button" onClick={onOpenAssistant}>Corriger dans l'assistant</button>
              {entry.level !== "error" ? <button type="button">Ignorer temporairement</button> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
