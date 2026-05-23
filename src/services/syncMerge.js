export const LAST_SYNC_AT_KEY = "crm_last_sync_at";

export const SYNC_COLLECTIONS = [
  "clients",
  "quotes",
  "invoices",
  "products",
  "categories",
  "suppliers",
  "expenses",
  "users",
  "backups",
  "logs",
];

export const CRITICAL_SYNC_COLLECTIONS = new Set([
  "clients",
  "quotes",
  "invoices",
]);

export function getLastSyncAt() {
  const raw = localStorage.getItem(LAST_SYNC_AT_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function setLastSyncAt(timestamp = Date.now()) {
  localStorage.setItem(LAST_SYNC_AT_KEY, String(timestamp));
}

export function parseUpdatedAt(item) {
  const raw = item?.updatedAt;
  if (!raw) return 0;
  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : 0;
}

function stableSerialize(value) {
  return JSON.stringify(value);
}

export function stampCollectionChanges(previousItems = [], nextItems = [], now) {
  const timestamp = now || new Date().toISOString();
  const previousMap = new Map(
    (previousItems || []).map((item) => [String(item?.id), item])
  );

  return (nextItems || []).map((item) => {
    if (!item?.id) return item;

    const previous = previousMap.get(String(item.id));
    if (!previous) {
      return item.updatedAt ? item : { ...item, updatedAt: timestamp };
    }

    if (stableSerialize(previous) !== stableSerialize(item)) {
      return { ...item, updatedAt: timestamp };
    }

    return item;
  });
}

export function stampDataChanges(previous = {}, next = {}) {
  const timestamp = new Date().toISOString();
  const stamped = { ...next };

  for (const key of SYNC_COLLECTIONS) {
    stamped[key] = stampCollectionChanges(previous[key], next[key], timestamp);
  }

  if (stableSerialize(previous.settings) !== stableSerialize(next.settings)) {
    stamped.settings = {
      ...(next.settings || {}),
      updatedAt: timestamp,
    };
  }

  return stamped;
}

function mergeRecord(local, cloud, { lastSyncAt, critical, onConflict, entityLabel }) {
  if (!local) return cloud;
  if (!cloud) return local;

  const localAt = parseUpdatedAt(local);
  const cloudAt = parseUpdatedAt(cloud);
  const lastSync = lastSyncAt || 0;

  const localModified = localAt > lastSync;
  const cloudModified = cloudAt > lastSync;

  if (localModified && cloudModified && localAt !== cloudAt) {
    if (critical) {
      onConflict?.({ entityLabel, id: local.id, local, cloud });
      return local;
    }
    return localAt >= cloudAt ? local : cloud;
  }

  if (cloudModified && !localModified) return cloud;
  if (localModified && !cloudModified) return local;

  return cloudAt > localAt ? cloud : local;
}

export function mergeCollection(
  localItems = [],
  cloudItems = [],
  { lastSyncAt, critical = false, onConflict, entityLabel } = {}
) {
  const localMap = new Map(
    (localItems || []).filter((item) => item?.id).map((item) => [String(item.id), item])
  );
  const cloudMap = new Map(
    (cloudItems || []).filter((item) => item?.id).map((item) => [String(item.id), item])
  );

  const ids = new Set([...localMap.keys(), ...cloudMap.keys()]);
  const merged = [];

  for (const id of ids) {
    merged.push(
      mergeRecord(localMap.get(id), cloudMap.get(id), {
        lastSyncAt,
        critical,
        onConflict,
        entityLabel,
      })
    );
  }

  return merged;
}

export function mergeCloudWithLocal(localData = {}, cloudData = {}, { onConflict } = {}) {
  const lastSyncAt = getLastSyncAt();
  const merged = {
    ...localData,
    ...cloudData,
  };

  for (const key of SYNC_COLLECTIONS) {
    merged[key] = mergeCollection(localData[key], cloudData[key], {
      lastSyncAt,
      critical: CRITICAL_SYNC_COLLECTIONS.has(key),
      onConflict,
      entityLabel: key,
    });
  }

  merged.settings = mergeRecord(localData.settings, cloudData.settings, {
    lastSyncAt,
    critical: true,
    onConflict,
    entityLabel: "settings",
  });

  return merged;
}
