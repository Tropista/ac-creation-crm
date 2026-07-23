import {
  normalizeSupplierName,
  resolveSupplierForExpense,
} from "./expenseSuppliers";
import { NEW_EXPENSE_VAT_DEFAULTS } from "./expenseVatClassification";

const HEADER_ALIASES = {
  date: ["date", "date achat", "date d achat", "purchase date"],
  supplier: ["fournisseur", "supplier", "vendeur", "nom fournisseur"],
  description: [
    "libelle",
    "libellé",
    "description",
    "designation",
    "désignation",
  ],
  invoiceNumber: [
    "n facture",
    "n° facture",
    "numero facture",
    "numéro facture",
    "invoice",
    "invoice number",
  ],
  amountHT: ["montant ht", "montant_ht", "ht", "amount ht"],
  vatRate: ["taux tva", "taux tva %", "tva %", "taux de tva", "tva"],
  vatAmount: ["montant tva", "tva eur", "tva €", "tva montant", "tva amount"],
  totalTTC: [
    "montant ttc",
    "montant_ttc",
    "ttc",
    "total ttc",
    "total",
    "amount ttc",
  ],
  category: ["categorie", "catégorie", "category"],
  notes: ["notes", "commentaire", "commentaires"],
  personalAccountPurchase: ["compte personnel", "achat personnel", "personal account purchase"],
  paidByPerson: ["personne ayant payé", "personne ayant paye", "payé par", "paye par"],
  companyReimbursementStatus: ["statut remboursement", "remboursement"],
  vatDeductionStatus: ["traitement tva", "statut deduction tva"],
};

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectDelimiter(headerLine) {
  const semicolons = (headerLine.match(/;/g) || []).length;
  const commas = (headerLine.match(/,/g) || []).length;
  return semicolons >= commas ? ";" : ",";
}

export function parseCsvLine(line, delimiter = ";") {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line.charAt(index);

    if (inQuotes) {
      if (char === '"') {
        if (line.charAt(index + 1) === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function splitCsvLines(text) {
  const lines = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);

    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && text.charAt(index + 1) === "\n") {
        index += 1;
      }
      if (current.trim()) {
        lines.push(current);
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    lines.push(current);
  }

  return lines;
}

export function parseCsvText(text) {
  const content = String(text || "").replace(/^\uFEFF/, "");
  const lines = splitCsvLines(content);

  if (lines.length === 0) {
    return { headers: [], rows: [], delimiter: ";" };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));

  return { headers, rows, delimiter };
}

export function mapCsvHeaders(headers) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping = {};

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const normalizedAliases = aliases.map(normalizeHeader);
    const index = normalizedHeaders.findIndex((header) =>
      normalizedAliases.includes(header)
    );
    if (index >= 0) {
      mapping[field] = index;
    }
  }

  return mapping;
}

export function parseCsvNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const cleaned = String(value)
    .trim()
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(/,/g, ".");

  const parsed = Number(cleaned.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCsvDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const frenchMatch = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (frenchMatch) {
    const day = frenchMatch[1].padStart(2, "0");
    const month = frenchMatch[2].padStart(2, "0");
    let year = frenchMatch[3];
    if (year.length === 2) {
      year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
}

function getCell(row, index) {
  if (index == null || index < 0) return "";
  return row[index] ?? "";
}

function parseBoolean(value) {
  return ["oui", "yes", "true", "1"].includes(normalizeHeader(value));
}

function resolveAmounts({ amountHT, vatRate, vatAmount, totalTTC }) {
  let ht = amountHT;
  let rate = vatRate;
  let vat = vatAmount;
  let ttc = totalTTC;

  if (ht == null && ttc != null && vat != null) {
    ht = Math.max(0, ttc - vat);
  }

  if (ht != null && rate != null && vat == null) {
    vat = Number(((ht * rate) / 100).toFixed(2));
  }

  if (ht != null && vat != null && ttc == null) {
    ttc = Number((ht + vat).toFixed(2));
  }

  if (ht != null && ttc == null && vat == null) {
    ttc = ht;
    vat = 0;
  }

  if (ttc != null && ht == null && vat == null) {
    ht = ttc;
    vat = 0;
  }

  if (ttc != null && ht != null && vat == null) {
    vat = Number(Math.max(0, ttc - ht).toFixed(2));
  }

  if (ht != null && rate == null && vat != null && ht > 0) {
    rate = Number(((vat / ht) * 100).toFixed(2));
  }

  return {
    amountHT: ht ?? 0,
    vatRate: rate ?? 0,
    vatAmount: vat ?? 0,
    totalTTC: ttc ?? 0,
  };
}

export function matchSupplierFromList(supplierName, suppliers = []) {
  const trimmed = String(supplierName || "").trim();
  if (!trimmed) {
    return { supplierId: null, supplierName: "", matched: false, supplier: null };
  }

  const supplier = resolveSupplierForExpense({ supplierName: trimmed }, suppliers);
  return {
    supplierId: supplier?.id || null,
    supplierName: trimmed,
    matched: Boolean(supplier),
    supplier,
  };
}

export function parseExpenseImportRow(row, mapping, suppliers = [], rowIndex = 0) {
  const errors = [];
  const supplierRaw = getCell(row, mapping.supplier);
  const description = getCell(row, mapping.description);
  const notesRaw = getCell(row, mapping.notes);
  const purchaseDate = parseCsvDate(getCell(row, mapping.date));
  const invoiceNumber = getCell(row, mapping.invoiceNumber);
  const category = getCell(row, mapping.category);

  const supplierMatch = matchSupplierFromList(supplierRaw, suppliers);
  if (!supplierMatch.supplierName) {
    errors.push("Fournisseur manquant");
  }

  const amounts = resolveAmounts({
    amountHT: parseCsvNumber(getCell(row, mapping.amountHT)),
    vatRate: parseCsvNumber(getCell(row, mapping.vatRate)),
    vatAmount: parseCsvNumber(getCell(row, mapping.vatAmount)),
    totalTTC: parseCsvNumber(getCell(row, mapping.totalTTC)),
  });

  if (
    amounts.totalTTC <= 0 &&
    amounts.amountHT <= 0 &&
    !getCell(row, mapping.amountHT) &&
    !getCell(row, mapping.totalTTC)
  ) {
    errors.push("Montant manquant");
  }

  if (
    amounts.totalTTC < 0 ||
    amounts.amountHT < 0 ||
    amounts.vatAmount < 0
  ) {
    errors.push("Montant négatif");
  }

  const notes = [description, notesRaw].filter(Boolean).join(" — ").trim();

  return {
    rowIndex: rowIndex + 2,
    purchaseDate,
    supplierName: supplierMatch.supplierName,
    supplierId: supplierMatch.supplierId,
    supplierMatched: supplierMatch.matched,
    invoiceNumber: String(invoiceNumber || "").trim(),
    category: String(category || "").trim(),
    notes,
    personalAccountPurchase: parseBoolean(getCell(row, mapping.personalAccountPurchase)),
    paidByPerson: String(getCell(row, mapping.paidByPerson) || "").trim(),
    companyReimbursementStatus: String(getCell(row, mapping.companyReimbursementStatus) || "not_reimbursable").trim(),
    vatDeductionStatus: String(getCell(row, mapping.vatDeductionStatus) || "accountant_review").trim(),
    ...amounts,
    valid: errors.length === 0,
    errors,
  };
}

export function parseExpensesCsv(text, suppliers = []) {
  const { headers, rows } = parseCsvText(text);
  const mapping = mapCsvHeaders(headers);
  const fileErrors = [];

  if (!mapping.supplier && mapping.supplier !== 0) {
    fileErrors.push(
      'Colonne « fournisseur » (ou « supplier ») introuvable dans l’en-tête.'
    );
  }

  const hasAmountColumn =
    mapping.amountHT != null ||
    mapping.totalTTC != null ||
    mapping.vatAmount != null;

  if (!hasAmountColumn) {
    fileErrors.push(
      "Colonne de montant introuvable (montant_ht, montant_ttc ou tva)."
    );
  }

  if (fileErrors.length > 0) {
    return {
      headers,
      mapping,
      rows: [],
      validRows: [],
      invalidRows: [],
      fileErrors,
    };
  }

  const parsedRows = rows
    .filter((row) => row.some((cell) => String(cell || "").trim()))
    .map((row, index) => parseExpenseImportRow(row, mapping, suppliers, index));

  return {
    headers,
    mapping,
    rows: parsedRows,
    validRows: parsedRows.filter((row) => row.valid),
    invalidRows: parsedRows.filter((row) => !row.valid),
    fileErrors,
  };
}

export function buildExpensesFromImportRows(validRows, { uid, now } = {}) {
  const createId = uid || (() => crypto.randomUUID());
  const timestamp = now || new Date().toISOString();

  return validRows.map((row) => ({
    id: createId(),
    createdAt: timestamp,
    ...NEW_EXPENSE_VAT_DEFAULTS,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    invoiceNumber: row.invoiceNumber,
    purchaseDate: row.purchaseDate || timestamp.slice(0, 10),
    amountHT: row.amountHT,
    vatRate: row.vatRate,
    vatAmount: row.vatAmount,
    totalTTC: row.totalTTC,
    category: row.category,
    notes: row.notes,
    personalAccountPurchase: row.personalAccountPurchase,
    paidByPerson: row.paidByPerson,
    companyReimbursementStatus: row.companyReimbursementStatus,
    vatDeductionStatus: row.vatDeductionStatus,
    source: "csv-import",
  }));
}

export function supplierNamesMatch(a, b) {
  return normalizeSupplierName(a) === normalizeSupplierName(b);
}
