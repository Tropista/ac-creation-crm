import { getSupabase, isSupabaseConfigured } from "../supabase";
import { loadData, saveData } from "./dataService";
import {
  catalogProductsNeedLiveImageMerge,
  loadPublicCatalogCache,
  mergeLiveCatalogImages,
  savePublicCatalogCache,
} from "../utils/catalogShare";

const SUPABASE_ID_BATCH_SIZE = 100;

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
  const { data, error } = await supabase.from(tableName).select("id,data").in("id", ids);
  if (error) throw error;
  return data || [];
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
    const { data, error } = await supabase
      .from("catalog_selections")
      .select("id,data")
      .eq("id", shareId)
      .maybeSingle();

    if (error) throw normalizePublicError(error);
    const selection = rowToSelection(data);
    if (selection) {
      savePublicCatalogCache(selection, { omitSnapshots: true });
      return selection;
    }
    return cached;
  } catch (error) {
    if (cached) return cached;
    throw normalizePublicError(error);
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

  if (!products.length) return [];

  const needsLiveMerge = catalogProductsNeedLiveImageMerge(products);
  if (!needsLiveMerge) return products;

  let liveItems = [];
  if (!isSupabaseConfigured) {
    liveItems = (loadData().clientCatalogItems || []).filter((item) => ids.includes(item.id));
  } else if (ids.length) {
    try {
      const supabase = await getSupabase();
      liveItems = await fetchCatalogItemsByIds(supabase, ids);
    } catch {
      liveItems = [];
    }
  }

  return mergeLiveCatalogImages(products, liveItems);
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

  if (!isSupabaseConfigured) {
    patchLocalCatalogSelection(nextSelection);
    return nextSelection;
  }

  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from("catalog_selections").upsert({
      id: shareId,
      data: nextSelection,
    });

    if (error) throw normalizePublicError(error);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  return nextSelection;
}

export async function upsertCatalogSelection(selection) {
  if (isSupabaseConfigured) {
    const supabase = await getSupabase();
    const { error } = await supabase.from("catalog_selections").upsert({
      id: selection.id,
      data: selection,
    });

    if (error) throw normalizePublicError(error);
  }

  return savePublicCatalogCache(selection, { omitSnapshots: isSupabaseConfigured });
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
