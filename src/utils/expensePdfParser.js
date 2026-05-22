const AMOUNT_PATTERN =
  /(\d{1,3}(?:[\s\u00a0]\d{3})*(?:[.,]\d{1,2})|\d+(?:[.,]\d{1,2}))/g;

const DATE_PATTERN =
  /(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/g;

const DATE_CAPTURE =
  /(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/;

const ISO_DATE_PATTERN = /(\d{4})-(\d{2})-(\d{2})/g;

const ISO_DATE_CAPTURE = /(\d{4})-(\d{2})-(\d{2})/;

const DATE_LABEL_PATTERN =
  /(?:date\s*(?:de\s*)?(?:facture|achat|émission|emission)?|date\s*d['']?(?:é|e)mission|facturé?\s*le|invoice\s*date|émission|emission)\s*[:\-]?\s*/i;

const INVOICE_NUMBER_PATTERNS = [
  /(?:facture|invoice)\s*(?:n[°o]\.?|no\.?|#)\s*[:\s]*([A-Z0-9][\w\-\/]+)/i,
  /(?:facture|invoice)\s+(?:n[°o]\.?|no\.?|#)?\s*[:\s]*(\d[\w\-\/]*)/i,
  /\b(FAC-\d[\w\-\/]*)\b/i,
  /\b(FACT-\d[\w\-\/]*)\b/i,
  /n[°o]\.?\s*(?:de\s*)?facture\s*[:\s]*([A-Z0-9][\w\-\/]+)/i,
];

const INVALID_INVOICE_NUMBER_PATTERN =
  /^(facture|invoice|fact|fac|devis|quote|n°|no|numero|numéro)$/i;

const DOCUMENT_LABEL_PATTERN =
  /^(facture|invoice|devis|quote|bon\s*de\s*commande|reçu|recu)$/i;

const ASSOCIATION_PATTERN = /^association\b/i;

const SUPPLIER_ACRONYM_PATTERN = /^[A-ZÀ-Ü][A-ZÀ-Ü0-9.\-&]{1,15}$/;

const FRENCH_MONTHS = {
  janvier: 1,
  février: 2,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  août: 8,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  décembre: 12,
  decembre: 12,
};

const SUPPLIER_LABEL_PATTERNS = [
  /^(?:fournisseur|supplier|vendeur|émetteur|emetteur)\s*[:\-]?\s*(.+)/i,
  /^(?:société|societe)\s*[:\-]?\s*(.+)/i,
  /^de\s*[:\-]\s*(.+)/i,
  /^from\s*[:\-]\s*(.+)/i,
];

const COMPANY_FORM_PATTERN =
  /\b(S\.?\s*A\.?\s*R\.?\s*L\.?|S\.?\s*A\.?\s*R\.?\s*L\.?\s*S|S\.?\s*A\.?|S\.?\s*À\.?\s*R\.?\s*L\.?|S\.?\s*A\.?\s*S\.?|S\.?\s*N\.?\s*C\.?|GmbH|SPRL|EURL|SAS|SASU|SCS|Scop)\b/i;

const BUYER_SECTION_PATTERN =
  /(?:facturé?\s*à|facture\s*à|client|destinataire|adresse\s*de\s*(?:facturation|livraison)|bill\s*to|ship\s*to|acheteur|buyer)/i;

const SKIP_LINE_PATTERN =
  /^(facture|invoice|date|tva|vat|total|montant|adresse|address|tel|tél|email|www|http|iban|bic|siret|tva intracom|numéro|numero|n[°o])/i;

const SKIP_SUPPLIER_CONTENT_PATTERN =
  /(?:@|(?:^|\s)tel\.?|(?:^|\s)tél\.?|(?:^|\s)phone|(?:^|\s)mobile|(?:^|\s)fax|www\.|https?:\/\/|(?:^|\s)L-\d{4}\b|rue\b|avenue\b|av\.\b|boulevard\b|bd\.\b|route\b|strasse\b|straße\b|place\b|\+\d{2,3}[\s./-]?\d|\bTVA\s*(?:LU|intracom|récup|récup\.|recup))/i;

export function parseAmount(value) {
  if (value == null || value === "") return null;

  const cleaned = String(value)
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,.\-\s]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");

  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function findLabeledAmount(text, labelPatterns) {
  for (const pattern of labelPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const amount = parseAmount(match[1]);
      if (amount != null && amount > 0) return amount;
    }
  }
  return null;
}

function findAllAmounts(text) {
  const amounts = [];
  for (const match of text.matchAll(AMOUNT_PATTERN)) {
    const amount = parseAmount(match[1]);
    if (amount != null && amount > 0) {
      amounts.push(amount);
    }
  }
  return amounts;
}

function findVatRate(text) {
  const ratePatterns = [
    /tva\s*[(:]?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i,
    /vat\s*[(:]?\s*(\d{1,2}(?:[.,]\d+)?)\s*%/i,
    /(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:de\s*)?tva/i,
    /taux\s*(?:de\s*)?tva\s*[:\s]*(\d{1,2}(?:[.,]\d+)?)\s*%/i,
  ];

  for (const pattern of ratePatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const rate = parseAmount(match[1]);
      if (rate != null && rate >= 0 && rate <= 100) return rate;
    }
  }

  return null;
}

function normalizeDateParts(day, month, year) {
  if (year < 100) year += 2000;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const now = new Date();
  const minYear = now.getFullYear() - 15;
  if (year < minYear || year > now.getFullYear() + 1) return null;

  return { iso, date };
}

function extractFrenchTextDate(line) {
  const match = line.match(
    /\b(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(\d{4})\b/i
  );
  if (!match) return null;

  const monthKey = match[2]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const month = FRENCH_MONTHS[monthKey];
  if (!month) return null;

  const parsed = normalizeDateParts(Number(match[1]), month, Number(match[3]));
  if (!parsed) return null;

  const labeled = DATE_LABEL_PATTERN.test(line);
  return { ...parsed, score: labeled ? 100 : 30 };
}

function extractDateFromLine(line) {
  const labeled = DATE_LABEL_PATTERN.test(line);
  const inBuyerSection = BUYER_SECTION_PATTERN.test(line);

  const frenchDate = extractFrenchTextDate(line);
  if (frenchDate) {
    if (inBuyerSection) frenchDate.score -= 40;
    return frenchDate;
  }

  for (const match of line.matchAll(ISO_DATE_PATTERN)) {
    const parsed = normalizeDateParts(
      Number(match[3]),
      Number(match[2]),
      Number(match[1])
    );
    if (parsed) {
      let score = labeled ? 100 : 20;
      if (inBuyerSection) score -= 40;
      return { ...parsed, score };
    }
  }

  for (const match of line.matchAll(DATE_PATTERN)) {
    const parsed = normalizeDateParts(
      Number(match[1]),
      Number(match[2]),
      Number(match[3])
    );
    if (parsed) {
      let score = labeled ? 100 : 20;
      if (inBuyerSection) score -= 40;
      return { ...parsed, score };
    }
  }

  if (labeled) {
    const isoMatch = line.match(ISO_DATE_CAPTURE);
    if (isoMatch) {
      const parsed = normalizeDateParts(
        Number(isoMatch[3]),
        Number(isoMatch[2]),
        Number(isoMatch[1])
      );
      if (parsed) return { ...parsed, score: 100 };
    }

    const slashMatch = line.match(DATE_CAPTURE);
    if (slashMatch) {
      const parsed = normalizeDateParts(
        Number(slashMatch[1]),
        Number(slashMatch[2]),
        Number(slashMatch[3])
      );
      if (parsed) return { ...parsed, score: 100 };
    }
  }

  return null;
}

function findPurchaseDate(text) {
  const lines = text.split(/\r?\n/);
  const candidates = [];
  const seen = new Set();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const extracted = extractDateFromLine(trimmed);
    if (extracted && !seen.has(extracted.iso)) {
      seen.add(extracted.iso);
      candidates.push(extracted);
    }
  }

  if (!candidates.length) return "";

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.date - a.date;
  });

  return candidates[0].iso;
}

function isValidInvoiceNumber(value) {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (INVALID_INVOICE_NUMBER_PATTERN.test(trimmed)) return false;
  if (DOCUMENT_LABEL_PATTERN.test(trimmed)) return false;
  return true;
}

function findInvoiceNumber(text) {
  for (const pattern of INVOICE_NUMBER_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = match[1].trim();
      if (value.length >= 1 && isValidInvoiceNumber(value)) return value;
    }
  }

  const labeledNumber = text.match(
    /(?:facture|invoice)\s*(?:n[°o]\.?\s*)?(\d+)/i
  );
  if (labeledNumber?.[1] && isValidInvoiceNumber(labeledNumber[1])) {
    return labeledNumber[1];
  }

  return "";
}

function cleanSupplierName(name) {
  return name
    .replace(/\s*(?:SIRET|TVA|VAT|RCS|BCE).*$/i, "")
    .trim()
    .slice(0, 120);
}

function isValidSupplierCandidate(line) {
  const trimmed = line.trim();
  if (trimmed.length < 2 || trimmed.length > 120) return false;
  if (DOCUMENT_LABEL_PATTERN.test(trimmed)) return false;
  if (SKIP_LINE_PATTERN.test(trimmed)) return false;
  if (SKIP_SUPPLIER_CONTENT_PATTERN.test(trimmed)) return false;
  if (BUYER_SECTION_PATTERN.test(trimmed)) return false;
  if (DATE_PATTERN.test(trimmed) && !COMPANY_FORM_PATTERN.test(trimmed)) return false;
  if (/^\d/.test(trimmed)) return false;
  if (/^[\d\s.,€$]+$/.test(trimmed)) return false;
  return true;
}

function findBuyerSectionStart(lines) {
  const index = lines.findIndex((line) => BUYER_SECTION_PATTERN.test(line));
  return index >= 0 ? index : lines.length;
}

function findSupplierName(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    if (BUYER_SECTION_PATTERN.test(line)) continue;

    for (const pattern of SUPPLIER_LABEL_PATTERNS) {
      const labelMatch = line.match(pattern);
      if (labelMatch?.[1]) {
        const name = cleanSupplierName(labelMatch[1]);
        if (name.length >= 2) return name;
      }
    }
  }

  const buyerStart = findBuyerSectionStart(lines);
  const headerEnd = Math.min(buyerStart > 0 ? buyerStart : 10, lines.length);

  for (let i = 0; i < headerEnd; i += 1) {
    const line = lines[i];
    if (!isValidSupplierCandidate(line)) continue;
    if (COMPANY_FORM_PATTERN.test(line)) {
      return cleanSupplierName(line);
    }
  }

  for (let i = 0; i < headerEnd; i += 1) {
    const line = lines[i];
    if (!isValidSupplierCandidate(line)) continue;
    if (ASSOCIATION_PATTERN.test(line)) {
      return cleanSupplierName(line);
    }
  }

  for (let i = 0; i < headerEnd; i += 1) {
    const line = lines[i];
    if (!isValidSupplierCandidate(line)) continue;
    if (SUPPLIER_ACRONYM_PATTERN.test(line)) {
      return cleanSupplierName(line);
    }
  }

  for (let i = 0; i < headerEnd; i += 1) {
    const line = lines[i];
    if (!isValidSupplierCandidate(line)) continue;
    return cleanSupplierName(line);
  }

  return "";
}

function inferMissingFields(fields) {
  const next = { ...fields };

  if (next.totalTTC != null && next.amountHT != null && next.vatAmount == null) {
    next.vatAmount = roundMoney(next.totalTTC - next.amountHT);
  }

  if (next.totalTTC != null && next.vatAmount != null && next.amountHT == null) {
    next.amountHT = roundMoney(next.totalTTC - next.vatAmount);
  }

  if (next.amountHT != null && next.vatAmount != null && next.totalTTC == null) {
    next.totalTTC = roundMoney(next.amountHT + next.vatAmount);
  }

  if (
    next.totalTTC != null &&
    next.vatRate != null &&
    next.amountHT == null &&
    next.vatRate > 0
  ) {
    next.amountHT = roundMoney(next.totalTTC / (1 + next.vatRate / 100));
  }

  if (
    next.amountHT != null &&
    next.vatRate != null &&
    next.vatAmount == null &&
    next.vatRate > 0
  ) {
    next.vatAmount = roundMoney(next.amountHT * (next.vatRate / 100));
  }

  if (
    next.amountHT != null &&
    next.vatAmount != null &&
    next.vatRate == null &&
    next.amountHT > 0
  ) {
    next.vatRate = roundMoney((next.vatAmount / next.amountHT) * 100);
  }

  if (next.totalTTC == null && next.amountHT != null && next.vatAmount != null) {
    next.totalTTC = roundMoney(next.amountHT + next.vatAmount);
  }

  return next;
}

function roundMoney(value) {
  if (value == null || Number.isNaN(value)) return null;
  return Math.round(value * 100) / 100;
}

export function parseExpenseFromText(text, options = {}) {
  const flatText = String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawText = String(text || "");

  let totalTTC = findLabeledAmount(flatText, [
    /(?:total\s*ttc|montant\s*ttc|net\s*[àa]\s*payer|amount\s*due)\s*[:\s]*([\d\s.,]+)/i,
    /(?:ttc)\s*[:\s]*([\d\s.,]+)/i,
  ]);

  let amountHT = findLabeledAmount(flatText, [
    /(?:total\s*ht|montant\s*ht|sous[\s-]*total\s*ht|base\s*ht|net\s*ht)\s*[:\s]*([\d\s.,]+)/i,
    /(?:ht)\s*[:\s]*([\d\s.,]+)/i,
  ]);

  let vatAmount = findLabeledAmount(flatText, [
    /(?:montant\s*(?:de\s*)?tva|tva\s*(?:due|payée|payee|collectée|collectee)|vat\s*amount)\s*[:\s]*([\d\s.,]+)/i,
    /tva\s+\d+(?:[.,]\d+)?\s*%\s+([\d\s.,]+)/i,
  ]);

  const vatRate = findVatRate(flatText);
  let purchaseDate = findPurchaseDate(rawText);
  if (!purchaseDate && options.fallbackDate) {
    purchaseDate = options.fallbackDate;
  }
  const invoiceNumber = findInvoiceNumber(flatText);
  const supplierName = findSupplierName(rawText);

  const amounts = findAllAmounts(flatText);
  if (totalTTC == null && amounts.length) {
    totalTTC = amounts[amounts.length - 1];
  }

  if (amountHT == null && amounts.length >= 2) {
    const sorted = [...amounts].sort((a, b) => a - b);
    amountHT = sorted[sorted.length - 2];
  }

  const inferred = inferMissingFields({
    totalTTC: roundMoney(totalTTC),
    amountHT: roundMoney(amountHT),
    vatAmount: roundMoney(vatAmount),
    vatRate: roundMoney(vatRate),
  });

  const hasCoreData = Boolean(
    inferred.totalTTC != null ||
      inferred.amountHT != null ||
      inferred.vatAmount != null ||
      purchaseDate ||
      invoiceNumber ||
      supplierName
  );

  return {
    supplierName,
    invoiceNumber,
    purchaseDate,
    amountHT: inferred.amountHT ?? "",
    vatRate: inferred.vatRate ?? "",
    vatAmount: inferred.vatAmount ?? "",
    totalTTC: inferred.totalTTC ?? "",
    extractionSuccess: hasCoreData,
  };
}

export function isPartialExpenseExtraction(parsed) {
  if (!parsed?.extractionSuccess) return true;

  const hasAmounts =
    parsed.totalTTC !== "" ||
    parsed.amountHT !== "" ||
    parsed.vatAmount !== "";

  return hasAmounts && (!parsed.supplierName || !parsed.purchaseDate);
}
