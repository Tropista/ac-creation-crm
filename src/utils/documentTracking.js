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

export function getStaleDraftQuotes(quotes = [], { minAgeDays = 7 } = {}) {
  const cutoff = Date.now() - minAgeDays * 24 * 60 * 60 * 1000;

  return (quotes || []).filter((quote) => {
    if (String(quote?.status || "").trim() !== "Brouillon") return false;
    if (quote?.sentAt) return false;

    const raw = quote?.date || quote?.createdAt;
    if (!raw) return false;

    const parts = String(raw).split("/");
    const parsed =
      parts.length === 3
        ? new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
        : new Date(raw);

    return Number.isFinite(parsed.getTime()) && parsed.getTime() <= cutoff;
  });
}
