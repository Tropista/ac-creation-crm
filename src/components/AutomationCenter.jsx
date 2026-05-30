import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AUTOMATION_ALERT_TYPES,
  buildAutomationAlerts,
  countAutomationAlerts,
} from "../utils/automations";
import { pageToPath } from "../utils/routes";

const TYPE_LABELS = {
  [AUTOMATION_ALERT_TYPES.STALE_QUOTE]: "Devis sans suite",
  [AUTOMATION_ALERT_TYPES.UNPAID_INVOICE]: "Factures impayées",
  [AUTOMATION_ALERT_TYPES.LOW_STOCK]: "Stock bas",
  [AUTOMATION_ALERT_TYPES.ORDER_READY]: "Commandes prêtes",
  [AUTOMATION_ALERT_TYPES.STALE_SAV]: "SAV en attente",
};

const TYPE_ICONS = {
  [AUTOMATION_ALERT_TYPES.STALE_QUOTE]: "🧾",
  [AUTOMATION_ALERT_TYPES.UNPAID_INVOICE]: "💶",
  [AUTOMATION_ALERT_TYPES.LOW_STOCK]: "📦",
  [AUTOMATION_ALERT_TYPES.ORDER_READY]: "✅",
  [AUTOMATION_ALERT_TYPES.STALE_SAV]: "🔧",
};

function alertTargetPath(alert) {
  if (alert.type === AUTOMATION_ALERT_TYPES.UNPAID_INVOICE) return pageToPath("invoices");
  if (alert.type === AUTOMATION_ALERT_TYPES.STALE_QUOTE) return pageToPath("quotes");
  if (alert.type === AUTOMATION_ALERT_TYPES.ORDER_READY) return pageToPath("atelier");
  if (alert.type === AUTOMATION_ALERT_TYPES.LOW_STOCK) return pageToPath("products");
  if (alert.type === AUTOMATION_ALERT_TYPES.STALE_SAV) return pageToPath("sav");
  return pageToPath("dashboard");
}

export default function AutomationCenter({ data, compact = false, limit = 50 }) {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState("");

  const { total, byType } = useMemo(() => countAutomationAlerts(data), [data]);

  const alerts = useMemo(() => {
    const all = buildAutomationAlerts(data);
    const filtered = typeFilter ? all.filter((a) => a.type === typeFilter) : all;
    return compact ? filtered.slice(0, limit) : filtered;
  }, [data, typeFilter, compact, limit]);

  function openAlert(alert) {
    navigate(alertTargetPath(alert));
  }

  if (compact) {
    return (
      <div className="dashboard-automations">
        {alerts.length === 0 ? (
          <p className="muted">Aucune alerte pour le moment.</p>
        ) : (
          <div className="dashboard-automations__list">
            {alerts.map((alert, index) => (
              <button
                key={`${alert.type}-${alert.title}-${index}`}
                type="button"
                className={`automation-alert automation-alert--${alert.severity}`}
                onClick={() => openAlert(alert)}
              >
                <span className="automation-alert__icon">{TYPE_ICONS[alert.type]}</span>
                <span className="automation-alert__body">
                  <p className="automation-alert__title">{alert.title}</p>
                  <p className="automation-alert__message">{alert.message}</p>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="automations-page">
      <div>
        <h1>Centre d'automatisations</h1>
        <p className="muted">Alertes visuelles uniquement — pas d'envoi email automatique</p>
      </div>

      <div className="automations-summary">
        <div className="card stat">
          <span>Alertes actives</span>
          <strong>{total}</strong>
        </div>
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="card stat">
            <span>{label}</span>
            <strong>{byType[type] || 0}</strong>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="automations-filters">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            <option value="">Toutes les alertes</option>
            {Object.entries(TYPE_LABELS).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {alerts.length === 0 ? (
          <p className="automations-empty">Rien à signaler — tout est à jour.</p>
        ) : (
          <div className="automations-list">
            {alerts.map((alert, index) => (
              <div
                key={`${alert.type}-${alert.title}-${index}`}
                className={`automation-alert automation-alert--${alert.severity}`}
              >
                <span className="automation-alert__icon">{TYPE_ICONS[alert.type]}</span>
                <div className="automation-alert__body">
                  <p className="automation-alert__title">{alert.title}</p>
                  <p className="automation-alert__message">{alert.message}</p>
                </div>
                <button
                  type="button"
                  className="automation-alert__action"
                  onClick={() => openAlert(alert)}
                >
                  Voir
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
