const DEFAULT_CATALOG_API_URL = "http://127.0.0.1:3001";

function isElectronRenderer() {
  return typeof window !== "undefined" && window.electronAPI?.isElectron;
}

export function getCatalogApiUrl() {
  if (isElectronRenderer() && window.electronAPI.getBankApiUrl) {
    return window.electronAPI.getBankApiUrl();
  }
  return import.meta.env.VITE_CATALOG_API_URL || import.meta.env.VITE_BANK_API_URL || DEFAULT_CATALOG_API_URL;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
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
    const { response: catalogResponse, payload: catalogPayload } = await fetchJson(
      `${url}/api/catalog/health`
    );

    if (catalogResponse.ok) {
      return {
        status: "ok",
        url,
        provider: catalogPayload?.provider || "lamaisonduteeshirt",
      };
    }

    if (catalogResponse.status === 404) {
      try {
        const { response: bankResponse } = await fetchJson(`${url}/api/bank/status`);
        if (bankResponse.ok) {
          return {
            status: "outdated",
            url,
            message:
              `API détectée sur ${url} mais sans import catalogue (version obsolète). ` +
              "Arrêtez le processus sur le port 3001, puis relancez npm run bank.",
          };
        }
      } catch {
        // Fall through to generic error below.
      }
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
      message:
        `Impossible de joindre ${url}. Lancez npm run bank dans un terminal séparé, ` +
        "puis vérifiez que VITE_BANK_API_URL pointe vers la même adresse.",
    };
  }
}

export async function fetchCatalogApiHealth() {
  const probe = await probeCatalogApi();
  if (probe.status === "ok") {
    return { ok: true, provider: probe.provider };
  }
  throw new Error(probe.message || "API catalogue indisponible");
}

export async function scrapeCatalogUrl({
  url,
  maxPages = 1,
  maxProducts = 200,
  importAll = false,
}) {
  const response = await fetch(`${getCatalogApiUrl()}/api/catalog/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, maxPages, maxProducts, importAll }),
  });

  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        "Route /api/catalog/scrape introuvable — redémarrez npm run bank avec la dernière version."
      );
    }
    throw new Error(payload.error || "Import catalogue impossible");
  }

  return payload;
}
