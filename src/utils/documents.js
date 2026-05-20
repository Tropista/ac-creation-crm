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