const DEFAULT_CATALOG_API_URL = "http://127.0.0.1:3001";
export const EXPECTED_CATALOG_PARSER_VERSION = 4;
export const CATALOG_SERVER_UNAVAILABLE_MESSAGE =
  "Serveur catalogue indisponible — lancez npm run bank:win";
const REFRESH_BATCH_SIZE = 50;

function isElectronRenderer() {
  return typeof window !== "undefined" && window.electronAPI?.isElectron;
}

export function getCatalogApiUrl() {
  if (isElectronRenderer() && window.electronAPI.getBankApiUrl) {
    return window.electronAPI.getBankApiUrl();
  }
  return import.meta.env.VITE_CATALOG_API_URL || import.meta.env.VITE_BANK_API_URL || DEFAULT_CATALOG_API_URL;
}

function isHtmlPayload(text = "", contentType = "") {
  const trimmed = String(text || "").trimStart();
  return (
    /text\/html/i.test(contentType) ||
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    (trimmed.startsWith("<") && trimmed.includes("</"))
  );
}

export async function parseCatalogJsonResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (isHtmlPayload(text, contentType)) {
    throw new Error(CATALOG_SERVER_UNAVAILABLE_MESSAGE);
  }

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(CATALOG_SERVER_UNAVAILABLE_MESSAGE);
  }
}

async function catalogFetch(path, options) {
  const url = `${getCatalogApiUrl()}${path}`;

  let response;
  try {
    response = await fetch(url, options);
  } catch {
    throw new Error(CATALOG_SERVER_UNAVAILABLE_MESSAGE);
  }

  const payload = await parseCatalogJsonResponse(response);
  return { response, payload };
}

async function fetchJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    return { response: null, payload: null, unreachable: true, htmlResponse: false };
  }

  let payload = null;
  let htmlResponse = false;
  try {
    payload = await parseCatalogJsonResponse(response);
  } catch (error) {
    htmlResponse = error?.message === CATALOG_SERVER_UNAVAILABLE_MESSAGE;
    payload = null;
  }

  return { response, payload, unreachable: false, htmlResponse };
}

function chunkArray(items = [], batchSize = REFRESH_BATCH_SIZE) {
  const chunks = [];
  for (let index = 0; index < items.length; index += batchSize) {
    chunks.push(items.slice(index, index + batchSize));
  }
  return chunks;
}

/**
 * @returns {Promise<{
 *   status: "ok" | "outdated" | "unreachable" | "error",
 *   url: string,
 *   provider?: string,
 *   message?: string,
 * }>}
 */
export async function probeCatalogApi() {
  const url = getCatalogApiUrl();

  try {
    const { response: catalogResponse, payload: catalogPayload, unreachable, htmlResponse } =
      await fetchJson(`${url}/api/catalog/health`);

    if (unreachable || !catalogResponse) {
      return {
        status: "unreachable",
        url,
        message:
          `Impossible de joindre ${url}. Lancez npm run bank:win dans un terminal séparé, ` +
          "puis vérifiez que VITE_BANK_API_URL pointe vers la même adresse.",
      };
    }

    if (htmlResponse) {
      return {
        status: "unreachable",
        url,
        message: CATALOG_SERVER_UNAVAILABLE_MESSAGE,
      };
    }

    if (catalogResponse.ok && catalogPayload) {
      const parserVersion = Number(catalogPayload?.parserVersion);
      if (
        !Number.isFinite(parserVersion) ||
        parserVersion < EXPECTED_CATALOG_PARSER_VERSION
      ) {
        return {
          status: "outdated",
          url,
          message:
            `API détectée sur ${url} mais le parseur catalogue est obsolète (v${parserVersion || "?"}). ` +
            "Arrêtez tout processus sur le port 3001 (Ctrl+C ou Gestionnaire des tâches), " +
            "puis relancez l'application ou npm run bank:win.",
        };
      }

      return {
        status: "ok",
        url,
        provider: catalogPayload?.provider || "lamaisonduteeshirt",
        parserVersion,
      };
    }

    if (catalogResponse.status === 404) {
      try {
        const { response: bankResponse } = await fetchJson(`${url}/api/bank/status`);
        if (bankResponse?.ok) {
          return {
            status: "outdated",
            url,
            message:
              `API détectée sur ${url} mais sans import catalogue (version obsolète). ` +
              "Arrêtez le processus sur le port 3001, puis relancez npm run bank:win.",
          };
        }
      } catch {
        // Fall through to generic error below.
      }
    }

    if (!catalogPayload && isHtmlPayload("", catalogResponse.headers.get("content-type") || "")) {
      return {
        status: "unreachable",
        url,
        message: CATALOG_SERVER_UNAVAILABLE_MESSAGE,
      };
    }

    return {
      status: "error",
      url,
      message: `API catalogue indisponible sur ${url} (HTTP ${catalogResponse.status}).`,
    };
  } catch {
    return {
      status: "unreachable",
      url,
      message: CATALOG_SERVER_UNAVAILABLE_MESSAGE,
    };
  }
}

export async function fetchCatalogApiHealth() {
  const probe = await probeCatalogApi();
  if (probe.status === "ok") {
    return { ok: true, provider: probe.provider };
  }
  throw new Error(probe.message || CATALOG_SERVER_UNAVAILABLE_MESSAGE);
}

export async function scrapeCatalogUrl({
  url,
  maxPages = 1,
  maxProducts = 200,
  importAll = false,
}) {
  const { response, payload } = await catalogFetch("/api/catalog/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, maxPages, maxProducts, importAll }),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        "Route /api/catalog/scrape introuvable — redémarrez npm run bank:win avec la dernière version."
      );
    }
    throw new Error(payload?.error || "Import catalogue impossible");
  }

  return payload;
}

async function refreshCatalogBatch(path, sourceUrls = []) {
  const uniqueUrls = [...new Set((sourceUrls || []).filter(Boolean))];
  if (!uniqueUrls.length) return [];

  const results = [];
  for (const batch of chunkArray(uniqueUrls)) {
    const { response, payload } = await catalogFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceUrls: batch }),
    });

    if (!response.ok) {
      throw new Error(
        payload?.error ||
          (path.includes("colors")
            ? "Rafraîchissement des couleurs impossible"
            : "Rafraîchissement des images impossible")
      );
    }

    results.push(...(payload?.results || []));
  }

  return results;
}

export async function refreshCatalogColors(sourceUrls = []) {
  return refreshCatalogBatch("/api/catalog/refresh-colors", sourceUrls);
}

export async function refreshCatalogImages(sourceUrls = []) {
  return refreshCatalogBatch("/api/catalog/refresh-images", sourceUrls);
}
