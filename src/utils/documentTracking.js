import { today } from "./documents";

export function markDocumentSent(doc) {
  return {
    ...doc,
    sentAt: new Date().toISOString(),
  };
}

export function markDocumentReminder(doc) {
  const count = Number(doc?.reminderCount || 0) + 1;
  const now = new Date().toISOString();
  return {
    ...doc,
    lastReminderAt: now,
    lastReminderDate: today(),
    reminderCount: count,
  };
}

export function formatTrackingDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("fr-FR");
}

function parseQuoteAgeDate(raw) {
  if (!raw) return null;
  const parts = String(raw).split("/");
  const parsed =
    parts.length === 3
      ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
      : new Date(raw);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function getStaleDraftQuotes(quotes = [], { minAgeDays = 7 } = {}) {
  const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;

  return (quotes || []).filter((quote) => {
    if (String(quote?.status || "").trim() !== "Brouillon") return false;
    if (quote?.sentAt) return false;

    const parsed = parseQuoteAgeDate(quote?.date || quote?.createdAt);
    return parsed && parsed.getTime() <= cutoff;
  });
}

/** Devis « Envoyé » avec sentAt, sans réponse client (pas Accepté / Refusé). */
export function getStaleSentQuotes(quotes = [], { minAgeDays = 7 } = {}) {
  const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;

  return (quotes || []).filter((quote) => {
    if (String(quote?.status || "").trim() !== "Envoyé") return false;
    if (!quote?.sentAt) return false;
    if (quote?.acceptedAt) return false;

    const sentDate = new Date(quote.sentAt);
    if (!Number.isFinite(sentDate.getTime())) return false;
    return sentDate.getTime() <= cutoff;
  });
}
