import { uid, today, clientName } from "./documents";

export const AFTER_SALES_TYPES = [
  "Défaut produit",
  "Retard livraison",
  "Erreur personnalisation",
  "Remboursement",
  "Échange",
  "Autre",
];

export const AFTER_SALES_STATUSES = [
  "Ouvert",
  "En cours",
  "En attente client",
  "Résolu",
  "Clôturé",
];

export const AFTER_SALES_SOLUTIONS = [
  "Réparation",
  "Refabrication",
  "Avoir",
  "Remboursement",
  "Échange",
  "Geste commercial",
  "Sans suite",
];

export function normalizeAfterSalesCase(entry = {}) {
  return {
    id: entry.id || uid(),
    clientId: entry.clientId || "",
    invoiceId: entry.invoiceId || "",
    invoiceNumber: entry.invoiceNumber || "",
    quoteId: entry.quoteId || "",
    quoteNumber: entry.quoteNumber || "",
    type: AFTER_SALES_TYPES.includes(entry.type) ? entry.type : "Autre",
    status: AFTER_SALES_STATUSES.includes(entry.status) ? entry.status : "Ouvert",
    solution: entry.solution || "",
    subject: entry.subject || "",
    description: entry.description || "",
    internalNotes: entry.internalNotes || "",
    openedAt: entry.openedAt || today(),
    resolvedAt: entry.resolvedAt || "",
    updatedAt: entry.updatedAt || entry.openedAt || new Date().toISOString(),
    createdAt: entry.createdAt || new Date().toISOString(),
  };
}

export function filterAfterSalesByClient(cases = [], clientId) {
  if (!clientId) return [];
  return (cases || [])
    .filter((entry) => String(entry.clientId) === String(clientId))
    .sort(
      (a, b) =>
        new Date(b.updatedAt || b.openedAt || 0) -
        new Date(a.updatedAt || a.openedAt || 0)
    );
}

export function isStaleAfterSalesCase(entry, staleDays = 14) {
  if (!entry) return false;
  const status = String(entry.status || "");
  if (status === "Résolu" || status === "Clôturé") return false;

  const reference = entry.updatedAt || entry.openedAt || entry.createdAt;
  if (!reference) return false;

  const parsed = reference.includes("/")
    ? new Date(reference.split("/").reverse().join("-"))
    : new Date(reference);

  if (Number.isNaN(parsed.getTime())) return false;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  return parsed < cutoff;
}

export function countOpenAfterSales(cases = []) {
  return (cases || []).filter(
    (entry) => !["Résolu", "Clôturé"].includes(String(entry.status || ""))
  ).length;
}

export function buildAfterSalesSummary(data, entry) {
  const client = clientName(data, entry.clientId);
  const links = [
    entry.quoteNumber && `Devis ${entry.quoteNumber}`,
    entry.invoiceNumber && `Facture ${entry.invoiceNumber}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return { client, links };
}
