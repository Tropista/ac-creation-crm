import { isSupabaseConfigured } from "../supabase";
import { loadData, normalizeData } from "./dataService";
import { mergeCloudWithLocal } from "./syncMerge";
import { formatCatalogSyncMessage } from "./supabaseSync";

export function isCatalogDataEmpty(data = {}) {
  return !(
    (data.supplierCatalogItems || []).length ||
    (data.clientCatalogItems || []).length ||
    (data.catalogSelections || []).length
  );
}

export async function fetchCatalogRecoveryFromCloud() {
  if (!isSupabaseConfigured) {
    return {
      recovery: null,
      error: new Error("Supabase non configuré"),
    };
  }

  const { loadSupabaseCatalogRecovery } = await import("./supabaseSync");
  const recovery = await loadSupabaseCatalogRecovery();
  return { recovery, error: null };
}

export function mergeCatalogRecoveryIntoState(prevData, recovery) {
  const local = normalizeData(prevData || loadData());
  return mergeCloudWithLocal(local, {
    supplierCatalogItems: recovery.supplierCatalogItems,
    clientCatalogItems: recovery.clientCatalogItems,
    catalogSelections: recovery.catalogSelections,
  });
}

export function formatCatalogLoadToast(recovery, merged) {
  const clientCount = (merged.clientCatalogItems || []).length;
  const supplierCount = (merged.supplierCatalogItems || []).length;
  const selectionsCount = (merged.catalogSelections || []).length;

  if (recovery.fetchErrorMessage) {
    return {
      message: recovery.partial
        ? `${recovery.fetchErrorMessage} · ${formatCatalogSyncMessage(clientCount, supplierCount, selectionsCount)}`
        : recovery.fetchErrorMessage,
      type: recovery.partial ? "warning" : "error",
    };
  }

  if (!recovery.hasCatalogData) {
    return {
      message: "Aucun article catalogue trouvé dans Supabase.",
      type: "warning",
    };
  }

  return {
    message: formatCatalogSyncMessage(clientCount, supplierCount, selectionsCount),
    type: "success",
  };
}

export async function loadCatalogIntoData(data, { setData, showToastMessage = false } = {}) {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "no-config" };
  }

  if (!isCatalogDataEmpty(data)) {
    return { loaded: false, reason: "already-loaded" };
  }

  const { recovery, error } = await fetchCatalogRecoveryFromCloud();
  if (error) {
    return { loaded: false, reason: "error", error };
  }

  if (!recovery.hasCatalogData && !recovery.fetchErrorMessage) {
    return { loaded: false, reason: "empty", recovery };
  }

  if (!recovery.hasCatalogData && recovery.fetchErrorMessage) {
    if (showToastMessage) {
      return { loaded: false, reason: "fetch-error", recovery };
    }
    return { loaded: false, reason: "fetch-error", recovery };
  }

  const merged = mergeCatalogRecoveryIntoState(data, recovery);

  if (setData) {
    await setData((prev) => ({
      ...prev,
      supplierCatalogItems: merged.supplierCatalogItems || prev.supplierCatalogItems || [],
      clientCatalogItems: merged.clientCatalogItems || prev.clientCatalogItems || [],
      catalogSelections: merged.catalogSelections || prev.catalogSelections || [],
    }));
  }

  return { loaded: true, recovery, merged };
}
