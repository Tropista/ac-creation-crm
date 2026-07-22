import { useMemo, useState } from "react";
import { groupAnomaliesByType } from "./vatUiUtils";

function sourceType(sourceId = "") {
  if (String(sourceId).startsWith("sale:")) return "ventes";
  if (String(sourceId).startsWith("expense:")) return "dépenses";
  if (String(sourceId).includes("supplier")) return "fournisseurs";
  return "rapport";
}

function assistantTabFor(entry = {}) {
  if (entry.code === "CASH_BASIS_PAYMENTS_INCOMPLETE") return "payments";
  if (entry.code === "SALE_CLASSIFICATION_TO_REVIEW" || sourceType(entry.sourceId) === "ventes") return "sales";
  if (
    entry.code === "UNREVIEWED_EXPENSE_CLASSIFICATION" ||
    entry.code === "EU_ZERO_MISSING_TRANSACTION_TYPE" ||
    entry.code === "EU_EXPENSE_CATEGORY_MISSING" ||
    entry.code === "REVERSE_CHARGE_RATE_NOT_CONFIRMED" ||
    sourceType(entry.sourceId) === "dépenses"
  ) {
    return "expenses";
  }
  if (entry.code === "supplier_missing_country" || sourceType(entry.sourceId) === "fournisseurs") return "suppliers";
  return "suppliers";
}

function helpFor(entry = {}) {
  const guides = {
    SALE_CLASSIFICATION_TO_REVIEW: {
      title: "Classer la vente",
      text: "Choisis la catégorie fiscale de la facture : produit fabriqué/transformé, marchandise revendue, prestation, ou cession d'immobilisation.",
      action: "Ouvrir Ventes",
    },
    UNREVIEWED_EXPENSE_CLASSIFICATION: {
      title: "Classer la dépense",
      text: "Complète l'origine TVA, la catégorie fiscale, la déductibilité et, si besoin, le type UE bien/service.",
      action: "Ouvrir Dépenses",
    },
    EU_ZERO_MISSING_TRANSACTION_TYPE: {
      title: "Préciser bien ou service UE",
      text: "Pour un achat UE à 0 %, indique si c'est un bien intracommunautaire ou un service intracommunautaire.",
      action: "Ouvrir Dépenses",
    },
    EU_EXPENSE_CATEGORY_MISSING: {
      title: "Préciser la nature de la dépense UE",
      text: "Choisis si la dépense est matière première, marchandise, service, immobilisation, véhicule ou frais généraux.",
      action: "Ouvrir Dépenses",
    },
    UNKNOWN_INVOICE_STATUS: {
      title: "Valider le statut de facture",
      text: "Corrige le statut de la facture dans Factures : payée, non payée, partiellement payée, en retard ou annulée.",
      action: "Voir les lignes",
    },
    supplier_missing_country: {
      title: "Compléter le fournisseur",
      text: "Ajoute le pays du fournisseur. Il permet de déterminer si l'achat est LU, UE ou hors UE.",
      action: "Ouvrir Fournisseurs",
    },
    expense_missing_vat_origin: {
      title: "Définir l'origine TVA",
      text: "Indique si la dépense vient du Luxembourg, de l'Union européenne ou hors UE.",
      action: "Ouvrir Dépenses",
    },
    expense_missing_tax_category: {
      title: "Définir la catégorie fiscale",
      text: "Choisis la catégorie comptable/TVA de la dépense pour l'affecter aux bonnes cases eCDF.",
      action: "Ouvrir Dépenses",
    },
    REVERSE_CHARGE_RATE_NOT_CONFIRMED: {
      title: "Confirmer le taux d'autoliquidation",
      text: "Le taux proposé doit être confirmé avant que la ligne soit considérée comme totalement vérifiée.",
      action: "Ouvrir Dépenses",
    },
    CASH_BASIS_PAYMENTS_INCOMPLETE: {
      title: "Créer le paiement historique",
      text: "Ajoute un paiement reçu avec montant et date d'encaissement. Le rapprochement bancaire reste facultatif.",
      action: "Créer le paiement historique",
    },
  };
  return guides[entry.code] || {
    title: "Contrôle à vérifier",
    text: "Ouvre l'élément source puis complète les champs fiscaux manquants.",
    action: "Voir les lignes",
  };
}

export default function VatControlsPanel({
  anomalies = [],
  onFilterFixes,
  onOpenAssistant,
  onQuickFix,
  onCreateHistoricalPayment,
}) {
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
          {onQuickFix ? (
            <button type="button" onClick={onQuickFix}>
              Corriger automatiquement ce qui est fiable
            </button>
          ) : null}
          <button type="button" onClick={onFilterFixes}>
            Voir uniquement les éléments à corriger
          </button>
          <button type="button" onClick={() => onOpenAssistant?.()}>
            Corriger dans l'assistant
          </button>
        </div>
      </div>

      <div className="vat-help-box">
        <strong>Comment supprimer les erreurs bloquantes ?</strong>
        <p>
          Les erreurs rouges disparaissent quand chaque vente et chaque dépense a une classification TVA validée.
          Commence par le bouton automatique, puis traite les lignes restantes dans l'assistant.
        </p>
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
        ) : filtered.map((entry, index) => {
          const guide = helpFor(entry);
          const assistantTab = assistantTabFor(entry);
          return (
            <article key={`${entry.code}-${entry.sourceId}-${index}`} className={`vat-control-card ${entry.level}`}>
              <span className={`badge ${entry.level}`}>{entry.level}</span>
              <strong>{entry.code}</strong>
              <p>{entry.message}</p>
              <div className="vat-control-help">
                <strong>{guide.title}</strong>
                <span>{guide.text}</span>
              </div>
              <small className="muted">
                Document : {entry.sourceId || "rapport"} - Source : {sourceType(entry.sourceId)}
              </small>
              <div className="button-row">
                <button type="button" onClick={onFilterFixes}>Voir les lignes concernées</button>
                {entry.code === "CASH_BASIS_PAYMENTS_INCOMPLETE" && onCreateHistoricalPayment ? (
                  <>
                    <button type="button" onClick={() => onCreateHistoricalPayment(entry)}>
                      Créer le paiement historique
                    </button>
                    <button type="button" onClick={() => onOpenAssistant?.("payments")}>
                      Créer en masse
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => onOpenAssistant?.(assistantTab)}>{guide.action}</button>
                )}
                {entry.level !== "error" ? <button type="button">Ignorer temporairement</button> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
