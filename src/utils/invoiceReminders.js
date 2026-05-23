import { parseDocumentDate } from "./invoices";

export function computeDueDate(fromDate, paymentDays = 30) {
  const base = parseDocumentDate(fromDate) || new Date();
  const due = new Date(base);
  due.setDate(due.getDate() + Number(paymentDays || 30));
  return due.toLocaleDateString("fr-FR");
}

export function buildInvoiceReminderEmail(invoice, client, settings = {}) {
  const companyName = settings.companyName || "AC Creation";
  const subject = `Relance — Facture ${invoice.number} — ${companyName}`;

  const body = `Bonjour ${client?.name || ""},

Sauf erreur de notre part, la facture ci-dessous reste impayée à ce jour.

Facture : ${invoice.number}
Date d'émission : ${invoice.date}
${invoice.dueDate ? `Échéance : ${invoice.dueDate}\n` : ""}Montant TTC : ${Number(invoice.totalTTC || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
Statut : ${invoice.status}

Merci de procéder au règlement dans les meilleurs délais.

${settings.paymentTerms || ""}

${settings.bankInfo || ""}

Cordialement,
${companyName}
${settings.companyPhone || ""}
${settings.companyEmail || ""}`;

  return { subject, body };
}

export function openInvoiceReminderMailto(invoice, client, settings = {}) {
  if (!client?.email) {
    return { ok: false, reason: "no_email" };
  }

  const { subject, body } = buildInvoiceReminderEmail(invoice, client, settings);
  window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { ok: true };
}
