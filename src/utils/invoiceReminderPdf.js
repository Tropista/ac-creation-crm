import {
  getInvoicePaidAmount,
  getInvoiceRemaining,
  isCancelledInvoice,
  isPaidInvoice,
  parseDocumentDate,
} from "./invoices.js";
import {
  computeDueDate,
  getNextReminderNumber,
  getReminderTemplate,
  getReminderTemplateKey,
} from "./invoiceReminders.js";

export const REMINDER_HISTORY_TYPES = { PDF: "PDF", PRINT: "impression" };

export function canGenerateInvoiceReminder(invoice) {
  return (
    Boolean(invoice) &&
    !isPaidInvoice(invoice) &&
    !isCancelledInvoice(invoice) &&
    getInvoiceRemaining(invoice) > 0.01
  );
}

export function getReminderLevel(reminderNumber) {
  const key = getReminderTemplateKey(reminderNumber);
  return key === 1 ? "reminder_1" : key === 2 ? "reminder_2" : "final_reminder";
}

export function getReminderDisplayLabel(reminderNumber) {
  const key = getReminderTemplateKey(reminderNumber);
  return key === 1 ? "1er rappel" : key === 2 ? "2e rappel" : "Dernier rappel";
}

export function getReminderFileName(
  invoice,
  reminderNumber = getNextReminderNumber(invoice),
) {
  const suffix =
    getReminderTemplateKey(reminderNumber) === 3
      ? "FINAL"
      : String(getReminderTemplateKey(reminderNumber));
  const number = String(invoice?.number || "FACTURE").replace(
    /[^a-z0-9-]+/gi,
    "-",
  );
  return `RAPPEL-${suffix}-${number}.pdf`;
}

export function buildInvoiceReminderPdfData(
  invoice,
  settings = {},
  referenceDate = new Date(),
) {
  const reminderNumber = getNextReminderNumber(invoice);
  const dueDate =
    invoice?.dueDate ||
    (invoice?.date ? computeDueDate(invoice.date, settings.paymentDays) : "");
  const parsedDueDate = parseDocumentDate(dueDate);
  const issueDate = new Date(referenceDate);
  issueDate.setHours(0, 0, 0, 0);
  if (parsedDueDate) parsedDueDate.setHours(0, 0, 0, 0);
  const daysOverdue = parsedDueDate
    ? Math.max(0, Math.floor((issueDate - parsedDueDate) / 86400000))
    : 0;
  const template = getReminderTemplate(settings, reminderNumber);
  const newDeadlineDays = Number(
    settings.invoiceReminderDeadlineDays?.[template.key] || 0,
  );
  const newDeadline = newDeadlineDays > 0 ? new Date(issueDate) : null;
  if (newDeadline) newDeadline.setDate(newDeadline.getDate() + newDeadlineDays);

  return {
    reminderNumber,
    level: getReminderLevel(reminderNumber),
    label: getReminderDisplayLabel(reminderNumber),
    issueDate: issueDate.toLocaleDateString("fr-FR"),
    dueDate,
    daysOverdue,
    initialAmount: Number(invoice?.totalTTC || 0),
    paidAmount: getInvoicePaidAmount(invoice),
    remainingAmount: getInvoiceRemaining(invoice),
    newDeadline: newDeadline?.toLocaleDateString("fr-FR") || "",
    intro: template.intro,
    closing: template.closing,
    note: String(settings.invoiceReminderNote || "").trim(),
    fileName: getReminderFileName(invoice, reminderNumber),
  };
}

export function appendInvoiceReminderHistory(
  invoice,
  reminderData,
  type,
  user,
  generatedAt = new Date(),
) {
  return {
    ...invoice,
    reminderHistory: [
      ...(Array.isArray(invoice?.reminderHistory)
        ? invoice.reminderHistory
        : []),
      {
        id: `reminder-${generatedAt.getTime()}-${type}`,
        date: generatedAt.toISOString(),
        level: reminderData.level,
        reminderNumber: reminderData.reminderNumber,
        type,
        user: user || "Utilisateur",
        remainingAmount: reminderData.remainingAmount,
      },
    ],
  };
}
