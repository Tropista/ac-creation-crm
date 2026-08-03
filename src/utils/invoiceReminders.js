import { parseDocumentDate } from "./invoices.js";

export const DEFAULT_PAYMENT_DAYS = 30;
export const MIN_PAYMENT_DAYS = 1;
export const MAX_PAYMENT_DAYS = 365;

export const DEFAULT_REMINDER_TEMPLATES = {
  1: {
    label: "Première relance",
    intro:
      "Sauf erreur de notre part, la facture ci-dessous reste impayée à ce jour.",
    closing: "Merci de procéder au règlement dans les meilleurs délais.",
  },
  2: {
    label: "Deuxième relance",
    intro:
      "Malgré notre précédent rappel, nous constatons que la facture ci-dessous demeure impayée.",
    closing:
      "Nous vous remercions de régulariser votre situation sous 7 jours ouvrés.",
  },
  3: {
    label: "Relance finale",
    intro:
      "Nous n'avons toujours pas reçu le règlement de la facture ci-dessous, malgré nos relances précédentes.",
    closing:
      "Sans règlement sous 5 jours ouvrés, nous nous verrons contraints d'engager une procédure de recouvrement.",
  },
};

export function normalizePaymentDays(value, fallback = DEFAULT_PAYMENT_DAYS) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < MIN_PAYMENT_DAYS) return fallback;
  return Math.min(MAX_PAYMENT_DAYS, n);
}

export function computeDueDate(fromDate, paymentDays = DEFAULT_PAYMENT_DAYS) {
  const base = parseDocumentDate(fromDate) || new Date();
  const due = new Date(base);
  due.setDate(due.getDate() + normalizePaymentDays(paymentDays));
  return due.toLocaleDateString("fr-FR");
}

export function getNextReminderNumber(invoice) {
  return Number(invoice?.reminderCount || 0) + 1;
}

export function getReminderTemplateKey(reminderNumber) {
  const n = Math.max(1, Number(reminderNumber) || 1);
  return n >= 3 ? 3 : n;
}

export function getReminderTemplate(settings = {}, reminderNumber = 1) {
  const key = getReminderTemplateKey(reminderNumber);
  const custom = settings.invoiceReminderTemplates?.[key];
  const defaults = DEFAULT_REMINDER_TEMPLATES[key];

  return {
    ...defaults,
    ...custom,
    key,
    reminderNumber: Number(reminderNumber) || 1,
  };
}

export function buildInvoiceReminderEmail(
  invoice,
  client,
  settings = {},
  options = {},
) {
  const companyName = settings.companyName || "AC Creation";
  const reminderNumber =
    options.reminderNumber ?? getNextReminderNumber(invoice);
  const template = getReminderTemplate(settings, reminderNumber);
  const subject = `Relance n°${reminderNumber} — Facture ${invoice.number} — ${companyName}`;
  const dueDate =
    invoice.dueDate ||
    (invoice.date ? computeDueDate(invoice.date, settings.paymentDays) : "");

  const customNote = String(settings.invoiceReminderNote || "").trim();
  const noteBlock = customNote ? `\n${customNote}\n` : "";

  const body = `Bonjour ${client?.name || ""},

${template.intro}

Facture : ${invoice.number}
Date d'émission : ${invoice.date}
${dueDate ? `Échéance : ${dueDate}\n` : ""}Montant TTC : ${Number(invoice.totalTTC || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
Statut : ${invoice.status}
${noteBlock}
${template.closing}

${settings.paymentTerms || ""}

${settings.bankInfo || ""}

Cordialement,
${companyName}
${settings.companyPhone || ""}
${settings.companyEmail || ""}`;

  return { subject, body, reminderNumber, template };
}

export function openInvoiceReminderMailto(
  invoice,
  client,
  settings = {},
  options = {},
) {
  if (!client?.email) {
    return { ok: false, reason: "no_email" };
  }

  const reminderNumber =
    options.reminderNumber ?? getNextReminderNumber(invoice);
  const { subject, body } = buildInvoiceReminderEmail(
    invoice,
    client,
    settings,
    { reminderNumber },
  );
  window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { ok: true, reminderNumber };
}
