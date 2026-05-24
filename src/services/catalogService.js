import { getSupabase, isSupabaseConfigured } from "../supabase";
import { loadData, saveData } from "./dataService";
import {
  catalogProductsNeedLiveImageMerge,
  loadPublicCatalogCache,
  mergeLiveCatalogImages,
  savePublicCatalogCache,
} from "../utils/catalogShare";

const SUPABASE_ID_BATCH_SIZE = 100;
const PUBLIC_FETCH_TIMEOUT_MS = 12000;
const PUBLIC_FETCH_MAX_RETRIES = 2;
const PUBLIC_FETCH_RETRY_BASE_MS = 400;

function findLocalCatalogSelection(shareId) {
  const selections = loadData().catalogSelections || [];
  return (
    selections.find((item) => item.id === shareId || item.shareId === shareId) || null
  );
}

function patchLocalCatalogSelection(selection) {
  const data = loadData();
  const selections = [...(data.catalogSelections || [])];
  const index = selections.findIndex(
    (item) => item.id === selection.id || item.shareId === selection.shareId
  );
  if (index >= 0) {
    selections[index] = selection;
  } else {
    selections.unshift(selection);
  }
  saveData({ ...data, catalogSelections: selections });
}

function rowToSelection(row) {
  if (!row) return null;
  return { id: row.id, ...(row.data || {}) };
}

function isMissingTableError(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return /could not find the table|relation .* does not exist|PGRST205|42P01/i.test(message);
}

function normalizePublicError(error) {
  if (isMissingTableError(error)) {
    return new Error(
      "Table Supabase « catalog_selections » absente. Exécutez docs/supabase-migration.sql dans Supabase."
    );
  }
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableSupabaseError(error) {
  if (!error) return false;
  const status = Number(error.status ?? error.code);
  if ([429, 502, 503, 504].includes(status)) return true;
  const message = String(error.message || error.details || "").toLowerCase();
  return (
    message.includes("503") ||
    message.includes("502") ||
    message.includes("504") ||
    message.includes("429") ||
    message.includes("service unavailable") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

function normalizePublicFetchError(error) {
  if (isMissingTableError(error)) {
    return normalizePublicError(error);
  }
  if (String(error?.message || "").includes("délai dépassé")) {
    return error;
  }
  if (isRetryableSupabaseError(error)) {
    return new Error(
      "Serveur catalogue temporairement indisponible. Réessayez dans quelques instants."
    );
  }
  return error instanceof Error ? error : new Error("Impossible de charger le catalogue.");
}

async function withTimeout(promise, ms, label) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(
          `${label} — délai dépassé (${Math.round(ms / 1000)} s). Réessayez dans un instant.`
        )
      );
    }, ms);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(operation, options = {}) {
  const {
    label = "Requête Supabase",
    maxRetries = PUBLIC_FETCH_MAX_RETRIES,
    timeoutMs = PUBLIC_FETCH_TIMEOUT_MS,
  } = options;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await withTimeout(operation(), timeoutMs, label);
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries && isRetryableSupabaseError(error)) {
        await sleep(PUBLIC_FETCH_RETRY_BASE_MS * 2 ** attempt);
        continue;
      }
      throw normalizePublicFetchError(error);
    }
  }

  throw normalizePublicFetchError(lastError);
}

export function chunkIds(ids = [], batchSize = SUPABASE_ID_BATCH_SIZE) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const chunks = [];
  for (let index = 0; index < unique.length; index += batchSize) {
    chunks.push(unique.slice(index, index + batchSize));
  }
  return chunks;
}

function rowsToCatalogItems(rows = []) {
  return (rows || []).map((row) => ({ id: row.id, ...(row.data || {}) }));
}

async function fetchCatalogItemsBatch(supabase, tableName, ids) {
  if (!ids?.length) return [];
  if (ids.length > SUPABASE_ID_BATCH_SIZE) {
    throw new Error("fetchCatalogItemsBatch: utilisez fetchCatalogItemsByIds pour de gros lots.");
  }

  return fetchWithRetry(
    async () => {
      const { data, error } = await supabase.from(tableName).select("id,data").in("id", ids);
      if (error) throw error;
      return data || [];
    },
    { label: "Chargement des produits catalogue" }
  );
}

async function fetchCatalogItemsByIds(supabase, productIds) {
  if (!productIds.length) return [];

  const chunks = chunkIds(productIds);
  const rows = [];

  for (const ids of chunks) {
    try {
      rows.push(...(await fetchCatalogItemsBatch(supabase, "client_catalog_items", ids)));
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      rows.push(...(await fetchCatalogItemsBatch(supabase, "catalog_items", ids)));
    }
  }

  return rowsToCatalogItems(rows);
}

export async function fetchPublicCatalogSelection(shareId) {
  const cached = loadPublicCatalogCache(shareId);

  if (!isSupabaseConfigured) {
    if (cached) return cached;
    const local = findLocalCatalogSelection(shareId);
    if (local) {
      savePublicCatalogCache(local, { omitSnapshots: false });
      return local;
    }
    throw new Error(
      "Catalogue indisponible en ligne. Configurez Supabase ou ouvrez le lien sur le même appareil que le CRM."
    );
  }

  try {
    const supabase = await getSupabase();
    const data = await fetchWithRetry(
      async () => {
        const { data: row, error } = await supabase
          .from("catalog_selections")
          .select("id,data")
          .eq("id", shareId)
          .maybeSingle();
        if (error) throw error;
        return row;
      },
      { label: "Chargement de la sélection catalogue" }
    );

    const selection = rowToSelection(data);
    if (selection) {
      savePublicCatalogCache(selection, { omitSnapshots: true });
      return selection;
    }
    return cached;
  } catch (error) {
    if (cached) return cached;
    throw normalizePublicFetchError(error);
  }
}

export async function fetchPublicCatalogProducts(selection, productIds = []) {
  const ids = productIds.length
    ? productIds
    : Array.isArray(selection?.productIds)
      ? selection.productIds
      : [];

  let products = [];

  if (Array.isArray(selection?.productSnapshots) && selection.productSnapshots.length) {
    products = selection.productSnapshots;
  } else if (!ids.length) {
    return [];
  }

  if (!products.length && ids.length) {
    if (!isSupabaseConfigured) {
      const catalogItems = loadData().clientCatalogItems || [];
      return catalogItems.filter((item) => ids.includes(item.id));
    }

    try {
      const supabase = await getSupabase();
      products = await fetchCatalogItemsByIds(supabase, ids);
    } catch {
      return [];
    }
  }

  if (!products.length) return products;

  const needsLiveMerge = catalogProductsNeedLiveImageMerge(products);
  if (!needsLiveMerge || !ids.length) return products;

  let liveItems = [];
  if (!isSupabaseConfigured) {
    liveItems = (loadData().clientCatalogItems || []).filter((item) => ids.includes(item.id));
  } else {
    try {
      const supabase = await getSupabase();
      liveItems = await fetchCatalogItemsByIds(supabase, ids);
    } catch {
      return products;
    }
  }

  return mergeLiveCatalogImages(products, liveItems);
}

export async function fetchPublicCatalogSettings() {
  if (!isSupabaseConfigured) {
    try {
      return loadData().settings || {};
    } catch {
      return {};
    }
  }

  try {
    const supabase = await getSupabase();
    const row = await fetchWithRetry(
      async () => {
        const { data, error } = await supabase
          .from("settings")
          .select("data")
          .eq("id", "main")
          .maybeSingle();
        if (error) throw error;
        return data;
      },
      { label: "Chargement des paramètres entreprise" }
    );
    if (row?.data) return row.data;
  } catch {
    // Fall back to local CRM settings when Supabase is unavailable.
  }

  try {
    return loadData().settings || {};
  } catch {
    return {};
  }
}

export async function fetchCatalogSelectionsFromCloud() {
  if (!isSupabaseConfigured) {
    return loadData().catalogSelections || [];
  }

  const supabase = await getSupabase();
  const rows = await fetchWithRetry(
    async () => {
      const { data, error } = await supabase.from("catalog_selections").select("id,data");
      if (error) throw error;
      return data || [];
    },
    { label: "Chargement des sélections catalogue" }
  );

  return rows.map((row) => rowToSelection(row)).filter(Boolean);
}

export async function submitPublicCatalogSelection(shareId, submission) {
  const current = await fetchPublicCatalogSelection(shareId);
  if (!current) {
    throw new Error("Sélection introuvable.");
  }
  if (current.status === "submitted") {
    throw new Error("Cette sélection a déjà été envoyée.");
  }

  const nextSelection = {
    ...current,
    status: "submitted",
    clientSubmission: {
      ...submission,
      submittedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };

  savePublicCatalogCache(nextSelection, { omitSnapshots: isSupabaseConfigured });
  patchLocalCatalogSelection(nextSelection);

  if (!isSupabaseConfigured) {
    return nextSelection;
  }

  const supabase = await getSupabase();
  const { error } = await supabase.from("catalog_selections").upsert(
    {
      id: shareId,
      data: nextSelection,
    },
    { onConflict: "id" }
  );

  if (error) {
    throw normalizePublicError(error);
  }

  return nextSelection;
}

export async function upsertCatalogSelection(selection) {
  patchLocalCatalogSelection(selection);

  if (isSupabaseConfigured) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("catalog_selections").upsert(
      {
        id: selection.id,
        data: selection,
      },
      { onConflict: "id" }
    );

    if (error) throw normalizePublicError(error);
  }

  return savePublicCatalogCache(selection, { omitSnapshots: isSupabaseConfigured });
}

export async function clearCatalogSelectionSubmission(selection) {
  if (!selection?.id) {
    throw new Error("Sélection introuvable.");
  }

  const { clientSubmission: _removed, ...rest } = selection;
  const nextSelection = {
    ...rest,
    status: "open",
    updatedAt: new Date().toISOString(),
  };

  patchLocalCatalogSelection(nextSelection);
  savePublicCatalogCache(nextSelection, { omitSnapshots: isSupabaseConfigured });

  if (isSupabaseConfigured) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("catalog_selections").upsert(
      {
        id: selection.id,
        data: nextSelection,
      },
      { onConflict: "id" }
    );

    if (error) throw normalizePublicError(error);
  }

  return nextSelection;
}

export async function deleteCatalogSelection(shareId) {
  if (typeof window !== "undefined") {
    localStorage.removeItem(`crm_catalog_public_${shareId}`);
  }

  if (!isSupabaseConfigured) return;

  const supabase = await getSupabase();
  const { error } = await supabase.from("catalog_selections").delete().eq("id", shareId);
  if (error) throw normalizePublicError(error);
}
