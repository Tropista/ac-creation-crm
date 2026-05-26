const DISMISSED_KEY = "crm_dismissed_public_acceptances";

export function isPublicLinkAcceptance(quote) {
  return (
    String(quote?.acceptedVia || "") === "public-link" &&
    String(quote?.status || "") === "Accepté" &&
    Boolean(quote?.acceptedAt)
  );
}

export function getDismissedPublicAcceptanceIds() {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function dismissPublicAcceptance(quoteId) {
  const ids = new Set(getDismissedPublicAcceptanceIds());
  ids.add(String(quoteId));
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

export function findNewPublicAcceptances(beforeQuotes = [], afterQuotes = []) {
  const beforeById = new Map(
    (beforeQuotes || []).map((quote) => [String(quote.id), quote])
  );

  return (afterQuotes || []).filter((quote) => {
    if (!isPublicLinkAcceptance(quote)) return false;
    const previous = beforeById.get(String(quote.id));
    if (!previous) return true;
    return (
      String(previous.acceptedVia || "") !== "public-link" ||
      !previous.acceptedAt
    );
  });
}

export function getRecentPublicAcceptances(quotes = [], { maxAgeDays = 30 } = {}) {
  const dismissed = new Set(getDismissedPublicAcceptanceIds());
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  return (quotes || [])
    .filter((quote) => {
      if (!isPublicLinkAcceptance(quote)) return false;
      if (dismissed.has(String(quote.id))) return false;
      const acceptedAt = Date.parse(String(quote.acceptedAt || ""));
      return Number.isFinite(acceptedAt) && acceptedAt >= cutoff;
    })
    .sort(
      (a, b) =>
        Date.parse(String(b.acceptedAt || "")) - Date.parse(String(a.acceptedAt || ""))
    );
}
