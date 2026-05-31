import { getBankApiUrl } from "../utils/bankApi";
import { buildDocumentPdf, getDocumentFileName } from "../utils/documentPdf";

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
  const docLabel = isQuote ? "devis" : "facture";
  const docTitle = isQuote ? "Devis" : "Facture";

  const subject = `${docTitle} ${doc.number} — ${settings.companyName || ""}`.trim();

  const text = `Bonjour ${client.name || ""},

Veuillez trouver en pièce jointe votre ${docLabel} ${doc.number}.

Montant TTC : ${Number(doc.totalTTC || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} €
Statut : ${doc.status || "—"}

${settings.paymentTerms || ""}

${settings.bankInfo || ""}

Cordialement,
${settings.companyName || ""}
${settings.companyPhone || ""}
${settings.companyEmail || ""}`;

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
