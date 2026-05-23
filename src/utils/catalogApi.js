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

export async function fetchCatalogApiHealth() {
  const response = await fetch(`${getCatalogApiUrl()}/api/catalog/health`);
  if (!response.ok) {
    throw new Error("API catalogue indisponible");
  }
  return response.json();
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
    throw new Error(payload.error || "Import catalogue impossible");
  }

  return payload;
}
