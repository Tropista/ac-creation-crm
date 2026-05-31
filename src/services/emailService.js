import { getBankApiUrl } from "../utils/bankApi";
import { buildDocumentPdf, getDocumentFileName } from "../utils/documentPdf";
import { buildInvoiceReminderEmail } from "../utils/invoiceReminders";
import { buildEmailFromTemplate, buildDocVars } from "../utils/emailTemplates";

export async function sendDocumentByEmail({ doc, type, data, client }) {
  const settings = data.settings || {};

  if (!settings.smtpEmail || !settings.smtpAppPassword) {
    throw new Error("Adresse Gmail et mot de passe d'application non configurés dans les Paramètres.");
  }
  if (!client?.email) {
    throw new Error("Ce client n'a pas d'adresse email enregistrée.");
  }

  const pdf = buildDocumentPdf({ doc, type, data });
  const pdfBase64 = pdf.output("datauristring").split(",")[1];
  const pdfFilename = getDocumentFileName(doc, type);

  const isQuote = type === "quote";
  const templateKey = isQuote ? "quote" : "invoice";
  const vars = buildDocVars(doc, client, settings);
  const { subject, body: text } = buildEmailFromTemplate(templateKey, vars, settings);

  const apiUrl = getBankApiUrl();
  const response = await fetch(`${apiUrl}/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: client.email,
      subject,
      text,
      attachmentBase64: pdfBase64,
      attachmentName: pdfFilename,
      smtpEmail: settings.smtpEmail,
      smtpAppPassword: settings.smtpAppPassword,
      fromName: settings.companyName || "",
    }),
  });

  if (response.status === 413) {
    throw new Error("Le PDF est trop volumineux pour être envoyé. Contacte le support.");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error || "";
    if (detail.toLowerCase().includes("invalid login") || detail.toLowerCase().includes("username and password")) {
      throw new Error("Identifiants Gmail incorrects. Vérifie ton adresse et ton mot de passe d'application Google.");
    }
    if (detail.toLowerCase().includes("self signed") || detail.toLowerCase().includes("certificate")) {
      throw new Error("Erreur de certificat SSL. Vérifie ta connexion réseau.");
    }
    throw new Error(detail || `Erreur ${response.status} lors de l'envoi.`);
  }
  return payload;
}

async function callSendEmail({ to, subject, text, settings }) {
  const apiUrl = getBankApiUrl();
  const response = await fetch(`${apiUrl}/send-email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      subject,
      text,
      smtpEmail: settings.smtpEmail,
      smtpAppPassword: settings.smtpAppPassword,
      fromName: settings.companyName || "",
    }),
  });
  if (response.status === 413) throw new Error("Email trop volumineux.");
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error || "";
    if (detail.toLowerCase().includes("invalid login") || detail.toLowerCase().includes("username and password")) {
      throw new Error("Identifiants Gmail incorrects.");
    }
    throw new Error(detail || `Erreur ${response.status}`);
  }
  return payload;
}

export async function sendReminderEmail({ invoice, client, settings, reminderNumber }) {
  if (!settings.smtpEmail || !settings.smtpAppPassword) {
    throw new Error("Gmail non configuré dans les Paramètres.");
  }
  if (!client?.email) {
    throw new Error(`Le client ${client?.name || ""} n'a pas d'adresse email.`);
  }
  const key = `reminder${Math.min(reminderNumber, 3)}`;
  const vars = buildDocVars(invoice, client, settings);
  const { subject, body } = buildEmailFromTemplate(key, vars, settings);
  return callSendEmail({ to: client.email, subject, text: body, settings });
}
