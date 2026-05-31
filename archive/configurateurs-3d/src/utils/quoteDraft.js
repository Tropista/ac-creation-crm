import { isHashRouterMode, pageToPath } from "./routes";

export const QUOTE_DRAFT_KEY = "crm_quote_draft";

/** Lien vers la page Devis (compatible Electron file:// + hash). */
export function getCrmQuotesUrl() {
  const path = pageToPath("quotes");
  if (typeof window === "undefined") return path;
  if (isHashRouterMode()) {
    return `${window.location.pathname}#${path}`;
  }
  return path;
}

export function saveQuoteDraft(draft) {
  localStorage.setItem(
    QUOTE_DRAFT_KEY,
    JSON.stringify({
      ...draft,
      savedAt: Date.now(),
    })
  );
}

export function peekQuoteDraft() {
  const raw = localStorage.getItem(QUOTE_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function consumeQuoteDraft() {
  const draft = peekQuoteDraft();
  if (draft) {
    localStorage.removeItem(QUOTE_DRAFT_KEY);
  }
  return draft;
}

export function openQuoteFromCalculator(navigate, draft) {
  const payload = {
    clientId: draft.clientId || "",
    lines: draft.lines || [],
    source: draft.source || "calculateur",
    notes: draft.notes || "",
  };
  saveQuoteDraft(payload);
  navigate(pageToPath("quotes"), { state: { quoteDraft: payload } });
}

export function buildCalculatorQuoteLine({
  description,
  quantity = 1,
  priceHT = 0,
  sku = "",
  category = "",
}) {
  return {
    productId: "",
    sku,
    category,
    description,
    quantity: Number(quantity) || 1,
    price: Number(priceHT) || 0,
    discount: 0,
  };
}
