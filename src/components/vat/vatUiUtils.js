export function money(value) {
  return `${Number(value || 0)
    .toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/\u202f|\u00a0/g, " ")} €`;
}

export function centsMoney(cents) {
  return money(Number(cents || 0) / 100);
}

export function linePartner(line = {}) {
  return line.partner || "-";
}

export function anomalyCounts(anomalies = []) {
  return {
    errors: anomalies.filter((entry) => entry.level === "error").length,
    warnings: anomalies.filter((entry) => entry.level === "warning").length,
    infos: anomalies.filter((entry) => entry.level === "info").length,
  };
}

const ANOMALY_TYPE_LABELS = {
  SALE_CLASSIFICATION_TO_REVIEW: "ventes doivent être classées",
  UNREVIEWED_EXPENSE_CLASSIFICATION: "dépenses doivent être classées",
  EU_ZERO_MISSING_TRANSACTION_TYPE: "dépenses UE doivent distinguer bien/service",
  EU_EXPENSE_CATEGORY_MISSING: "dépenses UE ont une nature inconnue",
  UNKNOWN_INVOICE_STATUS: "factures ont un statut à valider",
  REVERSE_CHARGE_RATE_NOT_CONFIRMED: "taux d'autoliquidation doivent être confirmés",
  supplier_missing_country: "fournisseurs n'ont pas de pays renseigné",
  expense_missing_vat_origin: "dépenses n'ont pas d'origine TVA",
  expense_missing_tax_category: "dépenses n'ont pas de catégorie fiscale",
};

function anomalySubject(entry = {}) {
  if (entry.sourceId?.startsWith?.("sale:")) return "ventes";
  if (entry.sourceId?.startsWith?.("expense:")) return "dépenses";
  if (String(entry.code || "").includes("supplier")) return "fournisseurs";
  return "éléments";
}

export function groupAnomaliesByType(anomalies = []) {
  const map = new Map();
  for (const entry of anomalies || []) {
    const key = `${entry.level || "info"}:${entry.code || entry.message || "unknown"}`;
    const current = map.get(key) || {
      level: entry.level || "info",
      code: entry.code || "",
      message: entry.message || "",
      count: 0,
      label: "",
      items: [],
    };
    current.count += 1;
    current.items.push(entry);
    const defaultSubject = anomalySubject(entry);
    current.label = ANOMALY_TYPE_LABELS[entry.code]
      ? `${current.count} ${ANOMALY_TYPE_LABELS[entry.code]}`
      : `${current.count} ${defaultSubject} : ${entry.message || entry.code || "contrôle à vérifier"}`;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => {
    const rank = { error: 0, warning: 1, info: 2 };
    return (rank[a.level] ?? 3) - (rank[b.level] ?? 3) || b.count - a.count;
  });
}

export function boxType(box = "") {
  if (["701", "703", "705", "031", "711", "741", "051", "436", "154", "131", "129", "139", "137", "776", "771", "001", "002", "004", "005", "012", "022"].includes(String(box))) {
    return "base HT";
  }
  if (["702", "704", "706", "040", "712", "742", "056", "076", "077", "078", "081", "082", "085", "086", "093", "097", "102", "103", "104", "462", "404"].includes(String(box))) {
    return "taxe";
  }
  return "total";
}

export function boxStatus(report = {}, entry = {}) {
  if ((report.anomalies || []).some((item) => item.level === "error" && (entry.sourceIds || []).includes(item.sourceId))) {
    return "à vérifier";
  }
  if ((report.anomalies || []).some((item) => (entry.sourceIds || []).includes(item.sourceId))) {
    return "provisoire";
  }
  return "calculé";
}
