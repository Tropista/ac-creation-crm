export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

export function today() {
  return new Date().toLocaleDateString("fr-FR");
}

export function clientName(data, id) {
  return data.clients.find((c) => c.id === id)?.name || "Client supprimé";
}

export function statusClass(status) {
  return (
    "badge " +
    String(status || "")
      .toLowerCase()
      .replaceAll(" ", "-")
      .replaceAll("é", "e")
  );
}

export function dedupeDocuments(items = []) {
  const map = new Map();

  for (const item of items || []) {
    if (!item) continue;
    const key = String(item.id || item.number || JSON.stringify(item));
    map.set(key, { ...map.get(key), ...item });
  }

  return Array.from(map.values());
}
export function createBackupSnapshot(
  data,
  label = "Sauvegarde automatique"
) {
  const safeData = normalizeData(data);

  return {
    id: uid(),
    label,
    createdAt: new Date().toISOString(),

    clientsCount: safeData.clients.length,
    productsCount: safeData.products.length,
    invoicesCount: safeData.invoices.length,
    quotesCount: safeData.quotes.length,

    data: {
      ...safeData,
      backups: [],
    },
  };
}
export function downloadJson(filename, data) {
  const blob = new Blob(
    [JSON.stringify(data, null, 2)],
    { type: "application/json" }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}
export function normalizeData(data) {
  return {
    ...data,

    users: data.users || [],
    clients: data.clients || [],
    products: data.products || [],
    categories: data.categories || [],

    quotes: data.quotes || [],
    invoices: data.invoices || [],

    backups: data.backups || [],
    logs: data.logs || [],

    settings: data.settings || {},
  };
}
export function pruneBackups(backups, max = 12) {
  return [...(backups || [])]
    .sort(
      (a, b) =>
        new Date(b.createdAt || 0)
        - new Date(a.createdAt || 0)
    )
    .slice(0, max);
}