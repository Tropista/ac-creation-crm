import { dedupeDocuments } from "../utils/documents";
import { debounce } from "../utils/debounce";
import { migrateLegacyCatalogData } from "../utils/catalogCollections";
import { sanitizeImageUrlForCache, compactSelectionForPublicCache } from "../utils/catalogShare";
import { isSupabaseConfigured } from "../supabase";

export const STORAGE_KEY = "crm_local_data_v2";
export const LOCAL_CATALOG_META_KEY = "_localCatalogMeta";
export const SAVE_DEBOUNCE_MS = 400;

let pendingData = null;
let lastSaveError = null;

export function isQuotaExceededError(error) {
  if (!error) return false;
  return error.name === "QuotaExceededError" || error.code === 22;
}

export function stripBase64FromCatalogItem(item) {
  if (!item || typeof item !== "object") return item;

  const next = { ...item };

  if (next.imageUrl) {
    next.imageUrl = sanitizeImageUrlForCache(next.imageUrl);
  }

  if (Array.isArray(next.colors)) {
    next.colors = next.colors.map((color) => {
      if (typeof color === "string") return color;
      if (!color || typeof color !== "object") return color;
      return {
        ...color,
        imageUrl: sanitizeImageUrlForCache(color.imageUrl),
      };
    });
  }

  return next;
}

export function stripBase64FromCatalogItems(items = []) {
  return (items || []).map(stripBase64FromCatalogItem);
}

export function stripBase64FromCatalogSelections(selections = []) {
  return (selections || []).map((selection) =>
    compactSelectionForPublicCache(selection, { omitSnapshots: false })
  );
}

export function buildLocalCatalogMeta(data = {}) {
  return {
    supplierCount: (data.supplierCatalogItems || []).length,
    clientCount: (data.clientCatalogItems || []).length,
    selectionsCount: (data.catalogSelections || []).length,
    excludedFromLocal: true,
    savedAt: new Date().toISOString(),
  };
}

export function prepareDataForLocalStorage(data, { cloudEnabled = isSupabaseConfigured } = {}) {
  const stripped = {
    ...data,
    supplierCatalogItems: stripBase64FromCatalogItems(data.supplierCatalogItems),
    clientCatalogItems: stripBase64FromCatalogItems(data.clientCatalogItems),
    catalogSelections: stripBase64FromCatalogSelections(data.catalogSelections),
    catalogItems: [],
  };

  if (!cloudEnabled) {
    return stripped;
  }

  return {
    ...stripped,
    supplierCatalogItems: [],
    clientCatalogItems: [],
    catalogSelections: [],
    [LOCAL_CATALOG_META_KEY]: buildLocalCatalogMeta(data),
  };
}

function writeDataImmediate(data, options = {}) {
  const payload = prepareDataForLocalStorage(data, options);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    lastSaveError = null;
    pendingData = null;
    return { ok: true, quotaExceeded: false, recovered: false };
  } catch (error) {
    lastSaveError = error;

    if (isQuotaExceededError(error) && !options.retried) {
      console.warn("Quota localStorage dépassé — nouvel essai avec cache allégé.", error);
      try {
        const minimal = prepareDataForLocalStorage(data, { cloudEnabled: true });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(minimal));
        lastSaveError = null;
        pendingData = null;
        return { ok: true, quotaExceeded: true, recovered: true };
      } catch (retryError) {
        lastSaveError = retryError;
        console.warn("Impossible d'enregistrer les données localement (quota) :", retryError);
        return { ok: false, quotaExceeded: true, recovered: false };
      }
    }

    if (isQuotaExceededError(error)) {
      console.warn("Impossible d'enregistrer les données localement (quota) :", error);
      return { ok: false, quotaExceeded: true, recovered: false };
    }

    console.error("Impossible d'enregistrer les données localement :", error);
    return { ok: false, quotaExceeded: false, recovered: false, error };
  }
}

export function getLastSaveError() {
  return lastSaveError;
}

const debouncedWrite = debounce((data) => {
  writeDataImmediate(data);
}, SAVE_DEBOUNCE_MS);

export const emptyData = {
  users: [],
  settings: {
    companyName: "Mon Entreprise",
    companyEmail: "contact@monentreprise.com",
    companyPhone: "+352 00 00 00 00",
    companyAddress: "Adresse de l'entreprise",
    vatNumber: "LU00000000",
    logoUrl: "",
    paymentTerms:
      "Conditions de paiement : virement bancaire ou carte de crédit",
    bankInfo:
      "Informations bancaires : Tout paiement au nom de votre entreprise\nNom de la banque : BCEE\nBIC : BCEELULL\nIBAN : LU00 0000 0000 0000 0000\nVeuillez indiquer le numéro de facture dans votre communication",
    taxRate: 17,
  },
  clients: [],
  quotes: [],
  invoices: [],
  products: [],
  categories: [],
  supplierCatalogItems: [],
  clientCatalogItems: [],
  catalogItems: [],
  catalogSelections: [],
  suppliers: [],
  expenses: [],
  backups: [],
  logs: [],
};

export function dedupeItemsById(items = []) {
  const map = new Map();

  for (const item of items || []) {
    if (!item) continue;

    const key = String(
      item.id ||
      item.number ||
      JSON.stringify(item)
    );

    map.set(key, {
      ...map.get(key),
      ...item,
    });
  }

  return Array.from(map.values());
}

export function normalizeData(data) {
  const { [LOCAL_CATALOG_META_KEY]: _localCatalogMeta, ...rest } = data || {};
  const migrated = migrateLegacyCatalogData(rest);

  return {
    ...emptyData,
    ...rest,
    ...migrated,

    settings: {
      ...emptyData.settings,
      ...(rest?.settings || {}),
    },

    users: dedupeItemsById(rest?.users || []),
    clients: dedupeItemsById(rest?.clients || []),

    quotes: dedupeDocuments(
      rest?.quotes || []
    ),

    invoices: dedupeDocuments(
      rest?.invoices || []
    ),

    products: dedupeItemsById(
      rest?.products || []
    ),

    categories: dedupeItemsById(
      rest?.categories || []
    ),

    supplierCatalogItems: dedupeItemsById(
      migrated.supplierCatalogItems || []
    ),

    clientCatalogItems: dedupeItemsById(
      migrated.clientCatalogItems || []
    ),

    catalogItems: [],

    catalogSelections: dedupeItemsById(
      rest?.catalogSelections || []
    ),

    suppliers: dedupeItemsById(
      rest?.suppliers || []
    ),

    expenses: dedupeItemsById(
      rest?.expenses || []
    ),

    backups: dedupeItemsById(
      rest?.backups || []
    ),

    logs: dedupeItemsById(
      rest?.logs || []
    ),
  };
}

export function loadData() {
  try {
    return normalizeData(
      JSON.parse(
        localStorage.getItem(STORAGE_KEY)
      ) || emptyData
    );
  } catch {
    return emptyData;
  }
}

export function saveData(data) {
  pendingData = data;
  debouncedWrite(data);
}

export function flushSaveData() {
  debouncedWrite.cancel();
  if (pendingData !== null) {
    return writeDataImmediate(pendingData);
  }
  return null;
}

export function getLocalCatalogMeta() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return raw?.[LOCAL_CATALOG_META_KEY] || null;
  } catch {
    return null;
  }
}

export function hasLocalBusinessData(data) {
  const meta = data?.[LOCAL_CATALOG_META_KEY] || getLocalCatalogMeta();

  return Boolean(
    data.users?.length ||
    data.backups?.length ||
    data.clients?.length ||
    data.products?.length ||
    data.categories?.length ||
    data.supplierCatalogItems?.length ||
    data.clientCatalogItems?.length ||
    data.catalogSelections?.length ||
    meta?.supplierCount ||
    meta?.clientCount ||
    meta?.selectionsCount ||
    data.suppliers?.length ||
    data.expenses?.length ||
    data.quotes?.length ||
    data.invoices?.length
  );
}
