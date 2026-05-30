import { isHashRouterMode, pageToPath } from "./routes";
import { resolvePublicAppOrigin } from "./quoteShare";

export const QUOTE_OPEN_QUERY_KEY = "open";

/**
 * URL ouvrant un devis dans le CRM (page Devis + aperçu).
 * Par défaut : format web Vercel (`/devis?open=`) pour QR et liens scannables.
 * `localFormat: true` conserve le hash Electron (`#/devis?open=`) pour usage interne.
 */
export function buildQuoteOpenUrl(quoteId, options = {}) {
  if (!quoteId) return "";

  const origin = resolvePublicAppOrigin({
    settings: options.settings,
    origin: options.origin,
    warnOnLocalhost: options.warnOnLocalhost ?? false,
  });
  const path = pageToPath("quotes");
  const query = `${QUOTE_OPEN_QUERY_KEY}=${encodeURIComponent(String(quoteId))}`;

  if (options.localFormat !== true) {
    return `${origin}${path}?${query}`;
  }

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";

  if (typeof window !== "undefined" && isHashRouterMode()) {
    return `${origin}${pathname}#${path}?${query}`;
  }

  return `${origin}${path}?${query}`;
}

/** Chemin CRM interne pour ouvrir un devis (`/devis?open=id`). */
export function buildQuoteOpenPath(quoteId) {
  if (!quoteId) return "";
  const path = pageToPath("quotes");
  const query = `${QUOTE_OPEN_QUERY_KEY}=${encodeURIComponent(String(quoteId))}`;
  return `${path}?${query}`;
}

export function parseQuoteOpenIdFromSearch(search = "") {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  return params.get(QUOTE_OPEN_QUERY_KEY) || "";
}

/** Lit `open=` depuis la query ou le hash (Electron file:// + HashRouter). */
export function parseQuoteOpenIdFromLocation(location = {}) {
  const fromSearch = parseQuoteOpenIdFromSearch(location.search || "");
  if (fromSearch) return fromSearch;

  const hash = String(location.hash || "");
  if (hash.includes("?")) {
    const query = hash.split("?")[1] || "";
    return parseQuoteOpenIdFromSearch(`?${query}`);
  }

  if (typeof window !== "undefined" && window.location.hash.includes("?")) {
    const query = window.location.hash.split("?")[1] || "";
    return parseQuoteOpenIdFromSearch(`?${query}`);
  }

  return "";
}
