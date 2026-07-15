import { dedupeDocuments } from "../utils/documents";
import { debounce } from "../utils/debounce";
import { normalizePaymentDays } from "../utils/invoiceReminders";
import { normalizeInvoiceStyle } from "../utils/invoiceStyles";
import {
  sanitizeProductsForPersistence,
  sanitizeProductImageUrl,
} from "../utils/productImages";
import { sanitizeQuotesForPersistence } from "../utils/quoteAttachments";
import { backfillCompanySnapshots } from "../utils/companySnapshot";

export const STORAGE_KEY = "crm_local_data_v2";
export const SAVE_DEBOUNCE_MS = 400;
export const LOCAL_LOGS_MAX = 100;
export const LOCAL_LOGS_AGGRESSIVE_MAX = 25;

export const DEFAULT_COMPANY_EMAIL = "ac.creation.officiel@gmail.com";
export const LEGACY_PLACEHOLDER_EMAIL = "contact@monentreprise.com";

let pendingData = null;
let lastSaveError = null;

export function isQuotaExceededError(error) {
  if (!error) return false;
  return error.name === "QuotaExceededError" || error.code === 22;
}

function stripBackupPayloadForLocalStorage(backup) {
  if (!backup || typeof backup !== "object") return backup;

  const {
    data: _payload,
    ...meta
  } = backup;

  return meta;
}

function stripSettingsForLocalStorage(settings = {}) {
  if (!settings || typeof settings !== "object") return settings;

  const logoUrl = sanitizeProductImageUrl(settings.logoUrl);
  if (logoUrl === (settings.logoUrl || "")) {
    return settings;
  }

  return {
    ...settings,
    logoUrl,
  };
}

export function prepareDataForLocalStorage(data, { recoveryLevel = 0 } = {}) {
  const next = { ...data };

  if (data?.products?.length) {
    next.products = sanitizeProductsForPersistence(data.products);
  }

  if (data?.quotes?.length) {
    next.quotes = sanitizeQuotesForPersistence(data.quotes);
  }

  if (next.settings) {
    next.settings = stripSettingsForLocalStorage(next.settings);
  }

  if (recoveryLevel >= 1) {
    if (data?.backups?.length) {
      next.backups = data.backups.map(stripBackupPayloadForLocalStorage);
    }

    if (data?.logs?.length) {
      next.logs = (data.logs || []).slice(0, LOCAL_LOGS_MAX);
    }
  }

  if (recoveryLevel >= 2) {
    if (data?.products?.length) {
      next.products = (data.products || []).map((product) => {
        if (!product || typeof product !== "object") return product;
        const imageUrl = sanitizeProductImageUrl(product.imageUrl);
        return imageUrl ? { ...product, imageUrl } : { ...product, imageUrl: "" };
      });
    }

    if (data?.quotes?.length) {
      next.quotes = sanitizeQuotesForPersistence(data.quotes).map((quote) => ({
        ...quote,
        attachments: (quote.attachments || []).filter(
          (attachment) => attachment?.storagePath && !String(attachment?.url || "").startsWith("data:")
        ),
      }));
    }

    if (data?.logs?.length) {
      next.logs = (data.logs || []).slice(0, LOCAL_LOGS_AGGRESSIVE_MAX);
    }
  }

  return next;
}

function writeDataImmediate(data) {
  const recoveryLevels = [0, 1, 2];

  for (let index = 0; index < recoveryLevels.length; index += 1) {
    const recoveryLevel = recoveryLevels[index];

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(prepareDataForLocalStorage(data, { recoveryLevel }))
      );
      lastSaveError = null;
      pendingData = null;

      if (recoveryLevel > 0) {
        console.info(
          `Cache local optimisé (niveau ${recoveryLevel}) — données complètes conservées en mémoire et dans le cloud.`
        );
      }

      return {
        ok: true,
        quotaExceeded: false,
        recovered: recoveryLevel > 0,
        recoveryLevel,
      };
    } catch (error) {
      lastSaveError = error;

      if (!isQuotaExceededError(error)) {
        console.error("Impossible d'enregistrer les données localement :", error);
        return { ok: false, quotaExceeded: false, recovered: false, error };
      }

      if (index === recoveryLevels.length - 1) {
        console.warn("Impossible d'enregistrer les données localement (quota) :", error);
        return { ok: false, quotaExceeded: true, recovered: false };
      }
    }
  }

  return { ok: false, quotaExceeded: true, recovered: false };
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
      "Tout paiement au nom de Couto Da Silva Carla \nPayconiq: +352 691 88 77 94",
    bankInfo:
      "Nom de la banque : BCEE\nBIC : BCEELULL\nIBAN : LU00 0000 0000 0000 0000\nVeuillez indiquer le numéro de facture dans votre communication",
    taxRate: 17,
    paymentDays: 30,
    onlinePaymentEnabled: false,
    onlinePaymentProvider: "manual",
    onlinePaymentUrlTemplate: "",
    invoiceStyle: "a",
    invoiceNumberPrefix: "FAC",
    invoiceNumberPadding: 4,
    autoReminderEnabled: true,
    autoReminderSchedule: [7, 14, 30],
    autoReminderSendAutomatically: false,
    automationEmailEnabled: false,
    automationNotificationEmail: "",
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
  creditNotes: [],
  afterSalesCases: [],
  payments: [],
  vatReports: [],
  clientFiles: [],
  clientNotes: [],
  deletedItems: [],
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
  const storedSettings = rest?.settings || {};
  const companyEmail =
    !storedSettings.companyEmail || storedSettings.companyEmail === LEGACY_PLACEHOLDER_EMAIL
      ? emptyData.settings.companyEmail
      : storedSettings.companyEmail;
  const normalizedSettings = {
    ...emptyData.settings,
    ...storedSettings,
    companyEmail,
    paymentTerms: storedSettings.paymentTerms?.trim()
      ? storedSettings.paymentTerms
      : emptyData.settings.paymentTerms,
    paymentDays: normalizePaymentDays(storedSettings.paymentDays),
    invoiceStyle: normalizeInvoiceStyle(),
  };

  return backfillCompanySnapshots({
    ...emptyData,
    ...rest,

    settings: normalizedSettings,

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

    creditNotes: dedupeItemsById(
      rest?.creditNotes || []
    ),

    afterSalesCases: dedupeItemsById(
      rest?.afterSalesCases || []
    ),

    payments: dedupeItemsById(
      rest?.payments || []
    ),

    vatReports: dedupeItemsById(
      rest?.vatReports || []
    ),

    clientFiles: dedupeItemsById(
      rest?.clientFiles || []
    ),

    clientNotes: dedupeItemsById(
      rest?.clientNotes || []
    ),

    deletedItems: dedupeItemsById(
      rest?.deletedItems || []
    ),

    backups: dedupeItemsById(
      rest?.backups || []
    ),

    logs: dedupeItemsById(
      rest?.logs || []
    ),
  });
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
    data.deliveryNotes?.length ||
    data.creditNotes?.length ||
    data.afterSalesCases?.length ||
    data.payments?.length ||
    data.vatReports?.length
  );
}
