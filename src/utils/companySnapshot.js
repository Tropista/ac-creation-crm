export const COMPANY_SNAPSHOT_VERSION = 1;

function readFirst(settings, keys) {
  for (const key of keys) {
    const value = settings?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return "";
}

function readBankField(bankInfo, label) {
  const source = String(bankInfo || "");
  const match = source.match(new RegExp(`${label}\\s*:?\\s*([^\\n\\r]+)`, "i"));
  return match ? match[1].trim() : "";
}

export function buildCompanySnapshot(settings = {}, { capturedAt } = {}) {
  const bankInfo = readFirst(settings, ["bankInfo"]);

  return {
    version: COMPANY_SNAPSHOT_VERSION,
    capturedAt: capturedAt || new Date().toISOString(),
    companyName: readFirst(settings, ["companyName", "name"]),
    legalForm: readFirst(settings, ["legalForm", "companyLegalForm"]),
    companyAddress: readFirst(settings, ["companyAddress", "address"]),
    postalCode: readFirst(settings, ["postalCode", "companyPostalCode", "zip", "companyZip"]),
    city: readFirst(settings, ["city", "companyCity"]),
    country: readFirst(settings, ["country", "companyCountry"]),
    companyPhone: readFirst(settings, ["companyPhone", "phone"]),
    companyEmail: readFirst(settings, ["companyEmail", "email"]),
    website: readFirst(settings, ["website", "companyWebsite"]),
    vatNumber: readFirst(settings, ["vatNumber", "companyVatNumber", "tva", "vat"]),
    rcsNumber: readFirst(settings, ["rcsNumber", "companyRcs", "rcs"]),
    authorizationNumber: readFirst(settings, ["authorizationNumber", "companyAuthorization", "authorization"]),
    iban: readFirst(settings, ["iban", "companyIban"]) || readBankField(bankInfo, "IBAN"),
    bic: readFirst(settings, ["bic", "companyBic"]) || readBankField(bankInfo, "BIC"),
    bank: readFirst(settings, ["bank", "companyBank"]) || readBankField(bankInfo, "Nom de la banque"),
    bankInfo,
    paymentTerms: readFirst(settings, ["paymentTerms"]),
    logoUrl: readFirst(settings, ["logoUrl", "companyLogoUrl", "logo"]),
  };
}

export function getDocumentCompanySnapshot(doc, settings = {}) {
  return doc?.companySnapshot || buildCompanySnapshot(settings);
}

export function ensureDocumentCompanySnapshot(doc, settings = {}) {
  if (!doc || doc.companySnapshot) return doc;
  return {
    ...doc,
    companySnapshot: buildCompanySnapshot(settings),
  };
}

export function backfillCompanySnapshots(data = {}) {
  const settings = data.settings || {};
  let changed = false;

  function backfillList(list = []) {
    return list.map((doc) => {
      if (!doc || doc.companySnapshot) return doc;
      changed = true;
      return ensureDocumentCompanySnapshot(doc, settings);
    });
  }

  const next = {
    ...data,
    quotes: backfillList(data.quotes || []),
    invoices: backfillList(data.invoices || []),
  };

  return changed ? next : data;
}
