import { buildAutomationAlerts, AUTOMATION_ALERT_TYPES } from "./automations";
import { getInvoicesDueForReminder } from "./autoReminderEngine";
import { isInvoiceOverdue, isPaidInvoice, isCancelledInvoice } from "./invoices";
import { getQuotesToLaunchToday, getDeliveryUrgencyMeta } from "./quoteDelivery";
import { getLeadFollowUpState, normalizeLeadCommercialFields } from "../services/leadsService";

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameDay(value, referenceDate = new Date()) {
  const date = parseDate(value);
  if (!date) return false;
  return (
    date.getFullYear() === referenceDate.getFullYear() &&
    date.getMonth() === referenceDate.getMonth() &&
    date.getDate() === referenceDate.getDate()
  );
}

function clientName(data, clientId) {
  const client = (data.clients || []).find((entry) => String(entry.id) === String(clientId));
  return client?.name || client?.company || client?.email || "Client";
}

function byPriority(a, b) {
  const rank = { danger: 4, warning: 3, success: 2, info: 1 };
  return (rank[b.severity] || 0) - (rank[a.severity] || 0);
}

export function buildTodayAgenda(data = {}, referenceDate = new Date()) {
  const reminders = getInvoicesDueForReminder(
    data.invoices || [],
    data.clients || [],
    data.settings || {}
  ).map(({ invoice, client, reminderNumber, daysOverdue }) => ({
    id: `reminder-${invoice.id}`,
    type: "reminder",
    severity: "danger",
    title: `Relancer ${invoice.number}`,
    detail: `${client.name || client.email} - ${daysOverdue}j de retard - relance n°${reminderNumber}`,
    page: "automations",
    invoiceId: invoice.id,
  }));

  const unpaidInvoices = (data.invoices || [])
    .filter(
      (invoice) =>
        !isPaidInvoice(invoice) &&
        !isCancelledInvoice(invoice) &&
        isInvoiceOverdue(invoice, referenceDate)
    )
    .map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: "invoice",
      severity: "danger",
      title: `Encaisser ${invoice.number}`,
      detail: `${clientName(data, invoice.clientId)} - reste ${Number(invoice.remaining ?? invoice.totalTTC ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} EUR`,
      page: "invoices",
      invoiceId: invoice.id,
    }));

  const workshop = getQuotesToLaunchToday(data.quotes || [], referenceDate).map((quote) => {
    const urgency = getDeliveryUrgencyMeta(quote, referenceDate) || {};
    return {
      id: `workshop-${quote.id}`,
      type: "workshop",
      severity: urgency.tone === "danger" ? "danger" : "warning",
      title: `Atelier ${quote.number}`,
      detail: `${clientName(data, quote.clientId)} - ${urgency.label}`,
      page: "atelier",
      quoteId: quote.id,
    };
  });

  const quoteFollowUps = (data.quotes || [])
    .filter((quote) => isSameDay(quote.nextFollowUpAt || quote.followUpDate, referenceDate))
    .map((quote) => ({
      id: `quote-followup-${quote.id}`,
      type: "quote",
      severity: "warning",
      title: `Suivre ${quote.number}`,
      detail: `${clientName(data, quote.clientId)} - devis à relancer`,
      page: "quotes",
      quoteId: quote.id,
    }));

  const leadFollowUps = (data.leads || [])
    .map(normalizeLeadCommercialFields)
    .filter((lead) => ["today", "overdue"].includes(getLeadFollowUpState(lead).key))
    .map((lead) => {
      const state = getLeadFollowUpState(lead);
      return {
        id: `lead-${lead.id}`,
        type: "lead",
        severity: state.key === "overdue" ? "danger" : "warning",
        title: `Relancer lead ${lead.metadata?.projectName || lead.email || ""}`.trim(),
        detail: `${lead.source || "Source inconnue"} - ${state.label}`,
        page: "leads",
        leadId: lead.id,
      };
    });

  const sav = (data.afterSalesCases || [])
    .filter((entry) => {
      const status = String(entry.status || "").toLowerCase();
      return !["clos", "fermé", "resolu", "résolu"].some((word) => status.includes(word));
    })
    .filter((entry) => isSameDay(entry.nextFollowUpAt || entry.dueDate, referenceDate))
    .map((entry) => ({
      id: `sav-${entry.id}`,
      type: "sav",
      severity: "warning",
      title: `SAV ${entry.subject || entry.type || entry.reference || ""}`.trim(),
      detail: `${clientName(data, entry.clientId)} - action prévue aujourd'hui`,
      page: "sav",
      caseId: entry.id,
    }));

  const criticalAlerts = buildAutomationAlerts(data)
    .filter((alert) =>
      alert.severity === "danger" ||
      [
        AUTOMATION_ALERT_TYPES.LOW_STOCK,
        AUTOMATION_ALERT_TYPES.LOW_MARGIN,
        AUTOMATION_ALERT_TYPES.MISSING_COST,
      ].includes(alert.type)
    )
    .slice(0, 8)
    .map((alert, index) => ({
      id: `alert-${alert.type}-${index}`,
      type: "alert",
      severity: alert.severity || "warning",
      title: alert.title,
      detail: alert.message,
      page: alert.invoiceId ? "invoices" : alert.quoteId ? "quotes" : alert.productId ? "products" : "automations",
      invoiceId: alert.invoiceId,
      quoteId: alert.quoteId,
      productId: alert.productId,
      caseId: alert.caseId,
    }));

  const tasks = [
    ...reminders,
    ...unpaidInvoices,
    ...workshop,
    ...quoteFollowUps,
    ...leadFollowUps,
    ...sav,
  ].sort(byPriority);

  return {
    tasks,
    criticalAlerts: criticalAlerts.sort(byPriority),
    counts: {
      reminders: reminders.length,
      unpaidInvoices: unpaidInvoices.length,
      workshop: workshop.length,
      quoteFollowUps: quoteFollowUps.length,
      leadFollowUps: leadFollowUps.length,
      sav: sav.length,
    },
  };
}
