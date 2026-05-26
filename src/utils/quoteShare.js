import { money } from "./money";
import { isHashRouterMode, pageToPath, PUBLIC_QUOTE_PATH } from "./routes";
import { ensureQuoteShareToken, generateShareToken } from "../services/publicQuoteService";

export const DEFAULT_PUBLIC_APP_URL = "https://ac-creation-crm.vercel.app";

function normalizePublicOrigin(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isLocalOrigin(origin) {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "[::1]"
    );
  } catch {
    return true;
  }
}

export function resolvePublicAppOrigin(options = {}) {
  if (options.origin) {
    return normalizePublicOrigin(options.origin);
  }

  const env = typeof import.meta !== "undefined" ? import.meta.env : {};

  if (env.VITE_PUBLIC_APP_URL) {
    return normalizePublicOrigin(env.VITE_PUBLIC_APP_URL);
  }

  if (env.VITE_VERCEL_URL) {
    return normalizePublicOrigin(env.VITE_VERCEL_URL);
  }

  const settings = options.settings || {};
  if (settings.publicAppUrl) {
    return normalizePublicOrigin(settings.publicAppUrl);
  }

  const windowOrigin =
    typeof window !== "undefined" ? window.location.origin : "";
  const isFileProtocol =
    typeof window !== "undefined" && window.location.protocol === "file:";

  if (windowOrigin && !isFileProtocol && !isLocalOrigin(windowOrigin)) {
    return windowOrigin.replace(/\/+$/, "");
  }

  const fallback = DEFAULT_PUBLIC_APP_URL;

  if (
    options.warnOnLocalhost !== false &&
    typeof console !== "undefined" &&
    (isLocalOrigin(windowOrigin) || isFileProtocol)
  ) {
    console.warn(
      `[quoteShare] Lien public généré avec ${fallback} (localhost non partageable). ` +
        "Configurez Paramètres → URL publique du CRM ou VITE_PUBLIC_APP_URL."
    );
  }

  return fallback;
}

export function buildClientSnapshot(client) {
  if (!client) return null;
  return {
    id: client.id,
    name: client.name || "",
    company: client.company || "",
    email: client.email || "",
    phone: client.phone || "",
    address: client.address || "",
    zip: client.zip || "",
    city: client.city || "",
    country: client.country || "",
    vat: client.vat || "",
  };
}

export function prepareQuoteForShare(quote, client = null) {
  const withToken = ensureQuoteShareToken(quote);
  const snapshot = buildClientSnapshot(client);
  if (!snapshot) return withToken;
  return { ...withToken, clientSnapshot: snapshot };
}

export function buildQuoteShareUrl(quote, options = {}) {
  const path = options.public === false ? pageToPath("quotes") : PUBLIC_QUOTE_PATH;
  const prepared = ensureQuoteShareToken(quote);
  const ref = encodeURIComponent(String(prepared?.id || quote?.number || ""));
  const token = prepared?.shareToken ? `&token=${encodeURIComponent(prepared.shareToken)}` : "";
  const origin = resolvePublicAppOrigin(options);
  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "/";

  if (typeof window !== "undefined" && isHashRouterMode()) {
    return `${origin}${pathname}#${path}?id=${ref}${token}`;
  }

  const base = origin || "";
  return `${base}${path}?id=${ref}${token}`;
}

export function buildQuoteWhatsAppMessage(quote, settings = {}, client = null) {
  const companyName = settings.companyName || "AC Creation";
  const prepared = prepareQuoteForShare(quote, client);
  const url = buildQuoteShareUrl(prepared, { settings });
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

export async function copyQuoteShareLink(quote, options = {}) {
  const prepared = prepareQuoteForShare(quote, options.client);
  const url = buildQuoteShareUrl(prepared, {
    origin: options.origin,
    settings: options.settings || {},
  });
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return { ok: true, url, quote: prepared };
  }
  return { ok: false, url, quote: prepared, reason: "clipboard_unavailable" };
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

export function getShareTokenFromLocation(location) {
  const fromSearch = new URLSearchParams(location?.search || "").get("token");
  if (fromSearch) return fromSearch;

  if (typeof window !== "undefined" && window.location.hash.includes("?")) {
    const query = window.location.hash.split("?")[1] || "";
    return new URLSearchParams(query).get("token");
  }

  return null;
}

export { generateShareToken };
