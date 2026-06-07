import { AUTOMATION_ALERT_TYPES, buildAutomationAlerts } from "./automations";

const TYPE_LABELS = {
  [AUTOMATION_ALERT_TYPES.STALE_QUOTE]: "Devis sans suite",
  [AUTOMATION_ALERT_TYPES.UNPAID_INVOICE]: "Factures impayées",
  [AUTOMATION_ALERT_TYPES.LOW_STOCK]: "Stock bas",
  [AUTOMATION_ALERT_TYPES.ORDER_READY]: "Commandes prêtes",
  [AUTOMATION_ALERT_TYPES.STALE_SAV]: "SAV en attente",
  [AUTOMATION_ALERT_TYPES.UNASSIGNED_SAV]: "SAV non assigné",
};

export function getAutomationNotificationRecipient(settings = {}) {
  return (
    settings.automationNotificationEmail ||
    settings.companyEmail ||
    settings.smtpEmail ||
    ""
  ).trim();
}

export function getAutomationNotificationAlerts(data = {}) {
  return buildAutomationAlerts(data).filter((alert) =>
    [
      AUTOMATION_ALERT_TYPES.STALE_QUOTE,
      AUTOMATION_ALERT_TYPES.UNPAID_INVOICE,
      AUTOMATION_ALERT_TYPES.LOW_STOCK,
      AUTOMATION_ALERT_TYPES.STALE_SAV,
      AUTOMATION_ALERT_TYPES.UNASSIGNED_SAV,
    ].includes(alert.type)
  );
}

export function buildAutomationDigestEmail(data = {}, referenceDate = new Date()) {
  const settings = data.settings || {};
  const alerts = getAutomationNotificationAlerts(data);
  const companyName = settings.companyName || "AC Creation CRM";
  const dateLabel = referenceDate.toLocaleDateString("fr-FR");

  const grouped = alerts.reduce((acc, alert) => {
    const label = TYPE_LABELS[alert.type] || "Autre";
    acc[label] = acc[label] || [];
    acc[label].push(alert);
    return acc;
  }, {});

  const sections = Object.entries(grouped).map(([label, entries]) => {
    const lines = entries
      .slice(0, 12)
      .map((alert) => `- ${alert.title} : ${alert.message}`)
      .join("\n");
    const more = entries.length > 12 ? `\n- ... ${entries.length - 12} autre(s)` : "";
    return `${label} (${entries.length})\n${lines}${more}`;
  });

  return {
    alerts,
    subject: `Résumé automatisations CRM — ${dateLabel}`,
    text:
      `Bonjour,\n\nVoici les alertes CRM à traiter pour ${companyName}.\n\n` +
      (sections.length ? sections.join("\n\n") : "Aucune alerte active.") +
      "\n\nCordialement,\nAC Creation CRM",
  };
}
