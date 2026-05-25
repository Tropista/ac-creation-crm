import { dedupeDocuments } from "../utils/documents";
import { debounce } from "../utils/debounce";
import { normalizePaymentDays } from "../utils/invoiceReminders";
import { normalizeInvoiceStyle } from "../utils/invoiceStyles";
import { sanitizeProductsForPersistence } from "../utils/productImages";
import { sanitizeQuotesForPersistence } from "../utils/quoteAttachments";

export const STORAGE_KEY = "crm_local_data_v2";
export const SAVE_DEBOUNCE_MS = 400;

export const DEFAULT_COMPANY_EMAIL = "ac.creation.officiel@gmail.com";
export const LEGACY_PLACEHOLDER_EMAIL = "contact@monentreprise.com";

let pendingData = null;
let lastSaveError = null;

export function isQuotaExceededError(error) {
  if (!error) return false;
  return error.name === "QuotaExceededError" || error.code === 22;
}

function prepareDataForLocalStorage(data) {
  const next = { ...data };

  if (data?.products?.length) {
    next.products = sanitizeProductsForPersistence(data.products);
  }

  if (data?.quotes?.length) {
    next.quotes = sanitizeQuotesForPersistence(data.quotes);
  }

  if (next === data && !data?.products?.length && !data?.quotes?.length) {
    return data;
  }

  return next;
}

function writeDataImmediate(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prepareDataForLocalStorage(data)));
    lastSaveError = null;
    pendingData = null;
    return { ok: true, quotaExceeded: false, recovered: false };
  } catch (error) {
    lastSaveError = error;

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
    companyEmail: DEFAULT_COMPANY_EMAIL,
    companyPhone: "+352 00 00 00 00",
    companyAddress: "Adresse de l'entreprise",
    vatNumber: "LU00000000",
    logoUrl: "",
    paymentTerms:
      "Conditions de paiement : virement bancaire ou carte de crédit",
    bankInfo:
      "Informations bancaires : Tout paiement au nom de votre entreprise\nNom de la banque : BCEE\nBIC : BCEELULL\nIBAN : LU00 0000 0000 0000 0000\nVeuillez indiquer le numéro de facture dans votre communication",
    taxRate: 17,
    paymentDays: 30,
    invoiceStyle: "a",
    invoiceNumberPrefix: "FAC",
    invoiceNumberPadding: 4,
    quoteTemplates: [],
    consumablesStock: [],
  },
  clients: [],
  quotes: [],
  invoices: [],
  deliveryNotes: [],
  products: [],
  categories: [],
  suppliers: [],
  expenses: [],
  leads: [],
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
  const rest = { ...(data || {}) };

  return {
    ...emptyData,
    ...rest,

    settings: (() => {
      const stored = rest?.settings || {};
      const companyEmail =
        !stored.companyEmail || stored.companyEmail === LEGACY_PLACEHOLDER_EMAIL
          ? emptyData.settings.companyEmail
          : stored.companyEmail;
      return {
        ...emptyData.settings,
        ...stored,
        companyEmail,
        paymentDays: normalizePaymentDays(stored.paymentDays),
        invoiceStyle: normalizeInvoiceStyle(),
      };
    })(),

    users: dedupeItemsById(rest?.users || []),
    clients: dedupeItemsById(rest?.clients || []),

    quotes: dedupeDocuments(
      rest?.quotes || []
    ),

    invoices: dedupeDocuments(
      rest?.invoices || []
    ),

    deliveryNotes: dedupeDocuments(
      rest?.deliveryNotes || []
    ),

    products: dedupeItemsById(
      rest?.products || []
    ),

    categories: dedupeItemsById(
      rest?.categories || []
    ),

    suppliers: dedupeItemsById(
      rest?.suppliers || []
    ),

    expenses: dedupeItemsById(
      rest?.expenses || []
    ),

    leads: dedupeItemsById(
      rest?.leads || []
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

export function hasLocalBusinessData(data) {
  return Boolean(
    data.users?.length ||
    data.backups?.length ||
    data.clients?.length ||
    data.products?.length ||
    data.categories?.length ||
    data.suppliers?.length ||
    data.expenses?.length ||
    data.quotes?.length ||
    data.invoices?.length ||
    data.deliveryNotes?.length
  );
}
