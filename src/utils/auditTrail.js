import { uid } from "./documents";

export const RESTORABLE_COLLECTIONS = {
  clients: "clients",
  products: "products",
  suppliers: "suppliers",
  expenses: "expenses",
  quotes: "quotes",
  invoices: "invoices",
  deliveryNotes: "deliveryNotes",
  creditNotes: "creditNotes",
  afterSalesCases: "afterSalesCases",
};

export function createDeletionRecord({
  collection,
  item,
  user = "",
  role = "",
  reason = "",
} = {}) {
  return {
    id: uid(),
    collection,
    itemId: item?.id || "",
    label: item?.number || item?.name || item?.reference || item?.subject || item?.id || "Objet supprimé",
    item,
    reason,
    user,
    role,
    deletedAt: new Date().toISOString(),
    restoredAt: "",
  };
}

export function deleteItemWithAudit(data = {}, { collection, itemId, user, role, reason } = {}) {
  const key = RESTORABLE_COLLECTIONS[collection] || collection;
  const items = data[key] || [];
  const item = items.find((entry) => String(entry.id) === String(itemId));
  if (!item) return data;

  const record = createDeletionRecord({ collection: key, item, user, role, reason });
  return {
    ...data,
    [key]: items.filter((entry) => String(entry.id) !== String(itemId)),
    deletedItems: [record, ...(data.deletedItems || [])].slice(0, 500),
    logs: [
      {
        id: uid(),
        date: record.deletedAt,
        createdAt: record.deletedAt,
        action: "Suppression",
        target: record.label,
        details: `${key}:${record.itemId}`,
        user,
        role,
        restorableId: record.id,
      },
      ...(data.logs || []),
    ].slice(0, 500),
  };
}

export function restoreDeletedItem(data = {}, deletionId) {
  const record = (data.deletedItems || []).find((entry) => String(entry.id) === String(deletionId));
  if (!record || record.restoredAt) return data;
  const key = RESTORABLE_COLLECTIONS[record.collection] || record.collection;
  const exists = (data[key] || []).some((entry) => String(entry.id) === String(record.itemId));
  const restoredAt = new Date().toISOString();

  return {
    ...data,
    [key]: exists ? data[key] || [] : [...(data[key] || []), { ...record.item, restoredAt }],
    deletedItems: (data.deletedItems || []).map((entry) =>
      String(entry.id) === String(deletionId) ? { ...entry, restoredAt } : entry
    ),
    logs: [
      {
        id: uid(),
        date: restoredAt,
        createdAt: restoredAt,
        action: "Restauration",
        target: record.label,
        details: `${key}:${record.itemId}`,
      },
      ...(data.logs || []),
    ].slice(0, 500),
  };
}

export function getRestorableDeletedItems(data = {}) {
  return (data.deletedItems || [])
    .filter((entry) => !entry.restoredAt)
    .sort((a, b) => new Date(b.deletedAt || 0) - new Date(a.deletedAt || 0));
}
