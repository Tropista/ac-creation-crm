import { useMemo, useState } from "react";
import {
  mergeProductionSheetUpdate,
  normalizeProductionSheet,
} from "../utils/profitability";

const MACHINE_OPTIONS = ["Laser", "DTF", "UV-DTF", "Impression 3D", "Sublimation", "Autre"];

export default function AtelierProductionPanel({ quote, data, onUpdate, onDownloadPdf }) {
  const [expanded, setExpanded] = useState(false);
  const sheet = useMemo(() => normalizeProductionSheet(quote), [quote]);

  if (!quote) return null;

  function patch(field, value) {
    onUpdate?.(mergeProductionSheetUpdate(quote, { [field]: value }));
  }

  function toggleChecklist(index) {
    const checklist = sheet.checklist.map((item, i) =>
      i === index ? { ...item, done: !item.done } : item
    );
    onUpdate?.(mergeProductionSheetUpdate(quote, { checklist }));
  }

  function handleFileChange(event) {
    const files = [...event.target.files].map((file) => ({
      name: file.name,
      type: file.type,
      size: file.size,
      addedAt: new Date().toISOString(),
    }));
    onUpdate?.(
      mergeProductionSheetUpdate(quote, {
        files: [...sheet.files, ...files],
      })
    );
    event.target.value = "";
  }

  return (
    <div className="atelier-production-panel">
      <button
        type="button"
        className="atelier-production-toggle"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "▾ Fiche production" : "▸ Fiche production avancée"}
      </button>

      {expanded ? (
        <div className="atelier-production-body">
          <div className="atelier-production-grid">
            <label>
              Machine
              <select
                value={sheet.machine}
                onChange={(e) => patch("machine", e.target.value)}
              >
                <option value="">—</option>
                {MACHINE_OPTIONS.map((machine) => (
                  <option key={machine} value={machine}>
                    {machine}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Matériau
              <input
                value={sheet.material}
                onChange={(e) => patch("material", e.target.value)}
                placeholder="Bois, textile, PLA…"
              />
            </label>
            <label>
              Temps estimé (min)
              <input
                type="number"
                min="0"
                value={sheet.estimatedMinutes || ""}
                onChange={(e) => patch("estimatedMinutes", Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Temps réel (min)
              <input
                type="number"
                min="0"
                value={sheet.realMinutes || ""}
                onChange={(e) => patch("realMinutes", Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Opérateur
              <select
                value={sheet.operatorId}
                onChange={(e) => patch("operatorId", e.target.value)}
              >
                <option value="">—</option>
                {(data.users || [])
                  .filter((user) => String(user?.status || "Actif") !== "Désactivé")
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name || user.email}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Coût matière (€)
              <input
                type="number"
                min="0"
                step="0.01"
                value={sheet.materialCost || ""}
                onChange={(e) => patch("materialCost", Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Coût machine (€)
              <input
                type="number"
                min="0"
                step="0.01"
                value={sheet.machineCost || ""}
                onChange={(e) => patch("machineCost", Number(e.target.value) || 0)}
                placeholder="Auto si vide"
              />
            </label>
            <label>
              Sous-traitance (€)
              <input
                type="number"
                min="0"
                step="0.01"
                value={sheet.subcontractingCost || ""}
                onChange={(e) => patch("subcontractingCost", Number(e.target.value) || 0)}
              />
            </label>
          </div>

          <label className="atelier-production-note">
            Note production
            <textarea
              rows={2}
              value={sheet.productionNote}
              onChange={(e) => patch("productionNote", e.target.value)}
            />
          </label>

          <div className="atelier-production-checklist">
            <strong>Checklist</strong>
            <ul>
              {sheet.checklist.map((item, index) => (
                <li key={item.label}>
                  <label>
                    <input
                      type="checkbox"
                      checked={item.done}
                      onChange={() => toggleChecklist(index)}
                    />
                    {item.label}
                  </label>
                </li>
              ))}
            </ul>
          </div>

          <div className="atelier-production-files">
            <strong>Fichiers (SVG / STL / PDF / image)</strong>
            <input type="file" multiple accept=".svg,.stl,.pdf,image/*" onChange={handleFileChange} />
            {sheet.files.length > 0 ? (
              <ul>
                {sheet.files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>{file.name}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Aucun fichier attaché (métadonnées locales).</p>
            )}
          </div>

          <button type="button" className="atelier-fiche-btn" onClick={() => onDownloadPdf?.(quote)}>
            Fiche production PDF
          </button>
        </div>
      ) : null}
    </div>
  );
}
