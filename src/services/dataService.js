import { dedupeDocuments } from "../utils/documents";
import { debounce } from "../utils/debounce";
import { migrateLegacyCatalogData } from "../utils/catalogCollections";

export const STORAGE_KEY = "crm_local_data_v2";
export const SAVE_DEBOUNCE_MS = 400;

let pendingData = null;

function writeDataImmediate(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  pendingData = null;
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
  const migrated = migrateLegacyCatalogData(data);

  return {
    ...emptyData,
    ...data,
    ...migrated,

    settings: {
      ...emptyData.settings,
      ...(data?.settings || {}),
    },

    users: dedupeItemsById(data?.users || []),
    clients: dedupeItemsById(data?.clients || []),

    quotes: dedupeDocuments(
      data?.quotes || []
    ),

    invoices: dedupeDocuments(
      data?.invoices || []
    ),

    products: dedupeItemsById(
      data?.products || []
    ),

    categories: dedupeItemsById(
      data?.categories || []
    ),

    supplierCatalogItems: dedupeItemsById(
      migrated.supplierCatalogItems || []
    ),

    clientCatalogItems: dedupeItemsById(
      migrated.clientCatalogItems || []
    ),

    catalogItems: [],

    catalogSelections: dedupeItemsById(
      data?.catalogSelections || []
    ),

    suppliers: dedupeItemsById(
      data?.suppliers || []
    ),

    expenses: dedupeItemsById(
      data?.expenses || []
    ),

    backups: dedupeItemsById(
      data?.backups || []
    ),

    logs: dedupeItemsById(
      data?.logs || []
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
    writeDataImmediate(pendingData);
  }
}

export function hasLocalBusinessData(data) {
  return Boolean(
    data.users?.length ||
    data.backups?.length ||
    data.clients?.length ||
    data.products?.length ||
    data.categories?.length ||
    data.supplierCatalogItems?.length ||
    data.clientCatalogItems?.length ||
    data.catalogSelections?.length ||
    data.suppliers?.length ||
    data.expenses?.length ||
    data.quotes?.length ||
    data.invoices?.length
  );
}