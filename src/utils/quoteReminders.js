import { getNextReminderNumber, getReminderTemplateKey } from "./invoiceReminders";
import { formatTrackingDate } from "./documentTracking";

export const DEFAULT_QUOTE_REMINDER_TEMPLATES = {
  1: {
    label: "Première relance devis",
    intro:
      "Nous vous avons transmis le devis ci-dessous et souhaitions savoir si vous aviez des questions ou souhaitez valider la commande.",
    closing: "Merci de nous indiquer votre décision ou de nous contacter pour ajuster le projet.",
  },
  2: {
    label: "Deuxième relance devis",
    intro:
      "Sauf erreur de notre part, nous n'avons pas encore reçu votre retour concernant le devis ci-dessous.",
    closing:
      "Pouvez-vous nous confirmer si le projet est toujours d'actualité ? Nous restons disponibles pour toute modification.",
  },
  3: {
    label: "Relance finale devis",
    intro:
      "Nous n'avons toujours pas reçu de réponse à notre devis ci-dessous, malgré nos relances précédentes.",
    closing:
      "Sans retour de votre part sous 7 jours, nous clôturerons ce dossier. Contactez-nous si le projet reste pertinent.",
  },
};

export function getQuoteReminderTemplate(settings = {}, reminderNumber = 1) {
  const key = getReminderTemplateKey(reminderNumber);
  const custom = settings.quoteReminderTemplates?.[key];
  const defaults = DEFAULT_QUOTE_REMINDER_TEMPLATES[key];

  return {
    ...defaults,
    ...custom,
    key,
    reminderNumber: Number(reminderNumber) || 1,
  };
}

export function buildQuoteReminderEmail(quote, client, settings = {}, options = {}) {
  const companyName = settings.companyName || "AC Creation";
  const reminderNumber =
    options.reminderNumber ?? getNextReminderNumber(quote);
  const template = getQuoteReminderTemplate(settings, reminderNumber);
  const subject = `Relance n°${reminderNumber} — Devis ${quote.number} — ${companyName}`;
  const sentLabel = quote.sentAt ? formatTrackingDate(quote.sentAt) : quote.date || "—";

  const customNote = String(settings.quoteReminderNote || "").trim();
  const noteBlock = customNote ? `\n${customNote}\n` : "";

  const body = `Bonjour ${client?.name || ""},

${template.intro}

Devis : ${quote.number}
Envoyé le : ${sentLabel}
Montant TTC : ${Number(quote.totalTTC || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
Statut : ${quote.status || "Envoyé"}
${noteBlock}
${template.closing}

Cordialement,
${companyName}
${settings.companyPhone || ""}
${settings.companyEmail || ""}`;

  return { subject, body, reminderNumber, template };
}

export function openQuoteReminderMailto(quote, client, settings = {}, options = {}) {
  if (!client?.email) {
    return { ok: false, reason: "no_email" };
  }

  const reminderNumber =
    options.reminderNumber ?? getNextReminderNumber(quote);
  const { subject, body } = buildQuoteReminderEmail(
    quote,
    client,
    settings,
    { reminderNumber }
  );
  window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { ok: true, reminderNumber };
}
