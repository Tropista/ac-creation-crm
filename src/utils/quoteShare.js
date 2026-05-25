import { money } from "./money";
import { isHashRouterMode, pageToPath } from "./routes";

export function buildQuoteShareUrl(quote, options = {}) {
  const path = pageToPath("quotes");
  const ref = encodeURIComponent(String(quote?.id || quote?.number || ""));
  const origin =
    options.origin ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";

  if (typeof window !== "undefined" && isHashRouterMode()) {
    return `${origin}${pathname}#${path}?id=${ref}`;
  }

  const base = origin || "";
  return `${base}${path}?id=${ref}`;
}

export function buildQuoteWhatsAppMessage(quote, settings = {}, client = null) {
  const companyName = settings.companyName || "AC Creation";
  const url = buildQuoteShareUrl(quote);
  const clientName = client?.name ? ` ${client.name}` : "";
  const total = money(quote?.totalTTC || 0);

  return `Bonjour${clientName},

Voici votre devis ${quote?.number || ""} (${total} TTC) de ${companyName}.

Consultez-le ici : ${url}

Pour toute question, répondez à ce message.

Cordialement,
${companyName}`;
}

export function buildWhatsAppShareUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyQuoteShareLink(quote) {
  const url = buildQuoteShareUrl(quote);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return { ok: true, url };
  }
  return { ok: false, url, reason: "clipboard_unavailable" };
}

export function openQuoteWhatsAppShare(quote, settings = {}, client = null) {
  const message = buildQuoteWhatsAppMessage(quote, settings, client);
  const url = buildWhatsAppShareUrl(message);
  window.open(url, "_blank", "noopener,noreferrer");
  return { ok: true, url };
}

export function getQuoteIdFromLocation(location) {
  const fromSearch = new URLSearchParams(location?.search || "").get("id");
  if (fromSearch) return fromSearch;

  if (typeof window !== "undefined" && window.location.hash.includes("?")) {
    const query = window.location.hash.split("?")[1] || "";
    return new URLSearchParams(query).get("id");
  }

  return null;
}
