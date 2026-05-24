/** Client-side LMDT image classification (mirrors backend/lmdtParser.js). */

const MODEL_COLOR_VARIANT_PATH = /\/c\/(?:p\/)?\d+\/\d+-\d+-\d+\.(jpe?g|webp)/i;
const MODEL_SEQUENCE_SUFFIX = /\/\d+-\d+-\d+\.(jpe?g|webp)(?:\?|$)/i;
const PRODUCT_PATH_HINTS =
  /(?:^|[/_-])(p-blank|p-mt|packshot|product|ghost|flat|blank)(?:[/_-]|$)/i;
const MODEL_PATH_HINTS =
  /(?:^|[/_-])(model|modele|look|lookbook|portrait|worn|mannequin|face|tete|head|wear)(?:[/_-]|$)/i;

function decodeBase64UrlSegment(value = "") {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4;
  const base64 = padded + (pad ? "=".repeat(4 - pad) : "");
  try {
    if (typeof atob === "function") {
      return atob(base64);
    }
  } catch {
    return "";
  }
  return "";
}

export function decodeLmdtMediaPath(url = "") {
  const match = String(url).match(/\/aHR0c[^/?]+/);
  if (!match) return "";
  return decodeBase64UrlSegment(match[0].slice(1));
}

export function isLmdtPackshotImageUrl(url = "") {
  const decoded = decodeLmdtMediaPath(url).toLowerCase();
  if (!decoded) return false;
  if (PRODUCT_PATH_HINTS.test(decoded)) return true;
  if (decoded.includes("p-blank") || decoded.includes("/p-mt/")) return true;
  if (String(url).includes("greybg") || String(url).includes("whitebg")) return true;
  return false;
}

export function isLmdtModelImageUrl(url = "") {
  const decoded = decodeLmdtMediaPath(url).toLowerCase();
  if (!decoded) return false;
  if (isLmdtPackshotImageUrl(url)) return false;
  if (MODEL_COLOR_VARIANT_PATH.test(decoded)) return true;
  if (MODEL_SEQUENCE_SUFFIX.test(decoded)) return true;
  if (MODEL_PATH_HINTS.test(decoded)) return true;
  if (/\/c\/p\/\d+\/\d+-\d+-/i.test(decoded)) return true;
  return false;
}

/** Prefer packshot URLs; never persist model/worn shots in the catalog. */
export function resolveCatalogImageUrl(scrapedUrl = "", existingUrl = "") {
  const scraped = String(scrapedUrl || "").trim();
  const existing = String(existingUrl || "").trim();

  if (scraped && !isLmdtModelImageUrl(scraped)) return scraped;
  if (existing && !isLmdtModelImageUrl(existing)) return existing;
  return "";
}
