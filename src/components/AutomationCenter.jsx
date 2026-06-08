import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AUTOMATION_ALERT_TYPES,
  buildAutomationAlerts,
  countAutomationAlerts,
} from "../utils/automations";
import { pageToPath } from "../utils/routes";
import { getInvoicesDueForReminder } from "../utils/autoReminderEngine";
import { markDocumentReminder } from "../utils/documentTracking";
import { sendReminderEmail } from "../services/emailService";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";

const TYPE_LABELS = {
  [AUTOMATION_ALERT_TYPES.STALE_QUOTE]: "Devis sans suite",
  [AUTOMATION_ALERT_TYPES.UNPAID_INVOICE]: "Factures impayées",
  [AUTOMATION_ALERT_TYPES.LOW_STOCK]: "Stock bas",
  [AUTOMATION_ALERT_TYPES.ORDER_READY]: "Commandes prêtes",
  [AUTOMATION_ALERT_TYPES.STALE_SAV]: "SAV en attente",
  [AUTOMATION_ALERT_TYPES.UNASSIGNED_SAV]: "SAV non assigné",
  [AUTOMATION_ALERT_TYPES.LOW_MARGIN]: "Marge faible",
  [AUTOMATION_ALERT_TYPES.MISSING_COST]: "Coûts manquants",
};

const TYPE_ICONS = {
  [AUTOMATION_ALERT_TYPES.STALE_QUOTE]: "🧾",
  [AUTOMATION_ALERT_TYPES.UNPAID_INVOICE]: "💶",
  [AUTOMATION_ALERT_TYPES.LOW_STOCK]: "📦",
  [AUTOMATION_ALERT_TYPES.ORDER_READY]: "✅",
  [AUTOMATION_ALERT_TYPES.STALE_SAV]: "🔧",
  [AUTOMATION_ALERT_TYPES.UNASSIGNED_SAV]: "!",
  [AUTOMATION_ALERT_TYPES.LOW_MARGIN]: "%",
  [AUTOMATION_ALERT_TYPES.MISSING_COST]: "€",
};

function alertTargetPath(alert) {
  if (alert.type === AUTOMATION_ALERT_TYPES.UNPAID_INVOICE) return pageToPath("invoices");
  if (alert.type === AUTOMATION_ALERT_TYPES.STALE_QUOTE) return pageToPath("quotes");
  if (alert.type === AUTOMATION_ALERT_TYPES.ORDER_READY) return pageToPath("atelier");
  if (alert.type === AUTOMATION_ALERT_TYPES.LOW_STOCK) return pageToPath("products");
  if (alert.type === AUTOMATION_ALERT_TYPES.STALE_SAV) return pageToPath("sav");
  if (alert.type === AUTOMATION_ALERT_TYPES.UNASSIGNED_SAV) return pageToPath("sav");
  if (alert.type === AUTOMATION_ALERT_TYPES.LOW_MARGIN) return pageToPath("invoices");
  if (alert.type === AUTOMATION_ALERT_TYPES.MISSING_COST) return pageToPath("invoices");
  return pageToPath("dashboard");
}

export default function AutomationCenter({
  data,
  setData,
  logActivity,
  compact = false,
  limit = 50,
}) {
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState("");
  const [sendingReminderId, setSendingReminderId] = useState("");
  const [sendingAllReminders, setSendingAllReminders] = useState(false);

  const { total, byType } = useMemo(() => countAutomationAlerts(data), [data]);
  const remindersDue = useMemo(
    () => getInvoicesDueForReminder(data.invoices || [], data.clients || [], data.settings || {}),
    [data.invoices, data.clients, data.settings]
  );

  const alerts = useMemo(() => {
    const all = buildAutomationAlerts(data);
    const filtered = typeFilter ? all.filter((a) => a.type === typeFilter) : all;
    return compact ? filtered.slice(0, limit) : filtered;
  }, [data, typeFilter, compact, limit]);

  function openAlert(alert) {
    navigate(alertTargetPath(alert));
  }

  function assertReminderConfig() {
    if (!data.settings?.smtpEmail || !data.settings?.smtpAppPassword) {
      showToast("Configure Gmail dans Paramètres avant d'envoyer des relances.", "error");
      return false;
    }
    if (typeof setData !== "function") {
      showToast("Envoi indisponible dans cette vue.", "error");
      return false;
    }
    return true;
  }

  async function markReminderSent(invoice, client) {
    await setData((current) => ({
      ...current,
      invoices: (current.invoices || []).map((entry) =>
        String(entry.id) === String(invoice.id) ? markDocumentReminder(entry) : entry
      ),
    }));
    await logActivity?.("Relance automatique", invoice.number, client?.name || "");
  }

  async function sendSingleReminder({ invoice, client, reminderNumber }) {
    if (!assertReminderConfig()) return;

    const confirmed = await confirmAction({
      title: "Envoyer la relance",
      message: `Envoyer la relance n°${reminderNumber} pour ${invoice.number} à ${client.email} ?`,
      confirmLabel: "Envoyer",
    });
    if (!confirmed) return;

    setSendingReminderId(String(invoice.id));
    try {
      await sendReminderEmail({ invoice, client, settings: data.settings, reminderNumber });
      await markReminderSent(invoice, client);
      showToast(`Relance n°${reminderNumber} envoyée pour ${invoice.number}.`, "success");
    } catch (error) {
      showToast(`Erreur relance ${invoice.number} : ${error.message}`, "error");
    } finally {
      setSendingReminderId("");
    }
  }

  async function sendAllReminders() {
    if (!assertReminderConfig() || remindersDue.length === 0) return;

    const confirmed = await confirmAction({
      title: "Envoyer toutes les relances",
      message: `${remindersDue.length} relance(s) email vont être envoyée(s).`,
      detail: "Chaque facture sera marquée avec une relance supplémentaire après l'envoi réussi.",
      confirmLabel: "Envoyer",
    });
    if (!confirmed) return;

    setSendingAllReminders(true);
    let sent = 0;

    for (const { invoice, client, reminderNumber } of remindersDue) {
      setSendingReminderId(String(invoice.id));
      try {
        await sendReminderEmail({ invoice, client, settings: data.settings, reminderNumber });
        await markReminderSent(invoice, client);
        sent += 1;
      } catch (error) {
        showToast(`Erreur relance ${invoice.number} : ${error.message}`, "error");
      }
    }

    setSendingReminderId("");
    setSendingAllReminders(false);
    if (sent > 0) showToast(`${sent} relance(s) envoyée(s).`, "success");
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
        <p className="muted">Alertes, relances clients et actions à traiter.</p>
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

      <div className="card automations-reminders">
        <div className="automations-reminders__header">
          <div>
            <h2>Relances factures</h2>
            <p className="muted">
              {remindersDue.length > 0
                ? `${remindersDue.length} facture(s) prête(s) à relancer`
                : "Aucune relance email à envoyer pour le moment."}
            </p>
          </div>
          {remindersDue.length > 0 ? (
            <button
              type="button"
              className="primary"
              onClick={sendAllReminders}
              disabled={sendingAllReminders || Boolean(sendingReminderId)}
            >
              {sendingAllReminders ? "Envoi en cours..." : `Tout envoyer (${remindersDue.length})`}
            </button>
          ) : null}
        </div>

        {remindersDue.length > 0 ? (
          <div className="automations-reminders__list">
            {remindersDue.map(({ invoice, client, reminderNumber, daysOverdue }) => (
              <div key={invoice.id} className="automation-reminder-row">
                <div>
                  <strong>{invoice.number}</strong>
                  <p className="muted">
                    {client.name || client.email} · {daysOverdue}j de retard · relance n°{reminderNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => sendSingleReminder({ invoice, client, reminderNumber })}
                  disabled={sendingAllReminders || sendingReminderId === String(invoice.id)}
                >
                  {sendingReminderId === String(invoice.id) ? "Envoi..." : "Envoyer"}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="automations-empty">Les prochaines relances apparaîtront ici selon l'échéancier configuré.</p>
        )}
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
