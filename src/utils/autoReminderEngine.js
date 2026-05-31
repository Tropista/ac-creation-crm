import { isPaidInvoice, isCancelledInvoice, parseDocumentDate } from "./invoices";

export const DEFAULT_REMINDER_SCHEDULE = [7, 14, 30]; // jours après échéance

function daysBetween(dateA, dateB) {
  const msA = new Date(dateA).setHours(0, 0, 0, 0);
  const msB = new Date(dateB).setHours(0, 0, 0, 0);
  return Math.round((msB - msA) / 86400000);
}

export function getAutoReminderConfig(settings = {}) {
  return {
    enabled:  settings.autoReminderEnabled !== false, // true par défaut
    schedule: Array.isArray(settings.autoReminderSchedule)
      ? settings.autoReminderSchedule.map(Number).filter((n) => n > 0)
      : DEFAULT_REMINDER_SCHEDULE,
  };
}

export function getDueReminderStep(invoice, schedule, referenceDate = new Date()) {
  if (isPaidInvoice(invoice) || isCancelledInvoice(invoice)) return null;

  const dueDate = parseDocumentDate(invoice.dueDate) || parseDocumentDate(invoice.date);
  if (!dueDate) return null;

  const daysOverdue = daysBetween(dueDate, referenceDate);
  if (daysOverdue <= 0) return null; // pas encore échu

  const reminderCount = Number(invoice.reminderCount || 0);
  const nextStep = reminderCount; // index dans schedule (0-based)

  if (nextStep >= schedule.length) return null; // toutes les relances déjà envoyées

  const daysThreshold = schedule[nextStep];
  if (daysOverdue < daysThreshold) return null; // pas encore le moment

  return {
    reminderNumber: reminderCount + 1,
    daysOverdue,
    daysThreshold,
  };
}

export function getInvoicesDueForReminder(invoices = [], clients = [], settings = {}, referenceDate = new Date()) {
  const { enabled, schedule } = getAutoReminderConfig(settings);
  if (!enabled) return [];

  const results = [];

  for (const invoice of invoices) {
    const step = getDueReminderStep(invoice, schedule, referenceDate);
    if (!step) continue;

    const client = clients.find((c) => String(c.id) === String(invoice.clientId));
    if (!client?.email) continue;

    results.push({ invoice, client, ...step });
  }

  return results.sort((a, b) => b.daysOverdue - a.daysOverdue);
}
