export const LAST_SYNC_AT_KEY = "crm_last_sync_at";
export const LAST_SYNC_CONFLICT_COUNT_KEY = "crm_last_sync_conflict_count";

export const SYNC_STATUS = {
  CONNECTING: "Connexion à Supabase...",
  SYNCED: "Synchronisé avec Supabase",
  LOCAL_NO_CONFIG: "Mode local (cloud non configuré)",
  LOCAL_UNAVAILABLE: "Mode local (cloud indisponible)",
  LOCAL_PUSHED: "Données locales envoyées vers Supabase",
  READY: "Supabase prêt",
  SAVING: "Sauvegarde Supabase...",
  SAVE_ERROR: "Erreur de sauvegarde Supabase",
};

export function resolveCloudInitError({
  cloudAlreadySynced,
  error = null,
} = {}) {
  if (cloudAlreadySynced) {
    return {
      cloudAvailable: true,
      syncStatus: SYNC_STATUS.SYNCED,
      toast: null,
    };
  }

  const message = String(error?.message || "");
  const isConfigError = /supabase non configur/i.test(message);

  return {
    cloudAvailable: false,
    syncStatus: isConfigError ? SYNC_STATUS.LOCAL_NO_CONFIG : SYNC_STATUS.LOCAL_UNAVAILABLE,
    toast: {
      message: isConfigError
        ? "Supabase non configuré — vérifiez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY"
        : "Sync cloud indisponible — données locales utilisées",
      type: "info",
    },
  };
}

export const SYNC_COLLECTIONS = [
  "clients",
  "quotes",
  "invoices",
  "deliveryNotes",
  "products",
  "categories",
  "suppliers",
  "expenses",
  "leads",
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

export function getLastSyncConflictCount() {
  const raw = localStorage.getItem(LAST_SYNC_CONFLICT_COUNT_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function setLastSyncConflictCount(count = 0) {
  localStorage.setItem(
    LAST_SYNC_CONFLICT_COUNT_KEY,
    String(Math.max(0, Number(count) || 0))
  );
}

export function formatLastSyncRelative(timestamp = getLastSyncAt(), now = Date.now()) {
  if (!timestamp || timestamp <= 0) {
    return "Dernière sync : jamais";
  }

  const diffMs = Math.max(0, now - timestamp);
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) {
    return "Dernière sync : à l'instant";
  }

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return `Dernière sync : il y a ${diffMin} min`;
  }

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `Dernière sync : il y a ${diffHours} h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `Dernière sync : il y a ${diffDays} j`;
}

const CONFLICT_ENTITY_LABELS = {
  clients: "client",
  quotes: "devis",
  invoices: "facture",
  deliveryNotes: "bon de livraison",
  settings: "paramètres",
};

export function formatSyncConflictMessage({ entityLabel, local } = {}) {
  const typeLabel = CONFLICT_ENTITY_LABELS[entityLabel] || entityLabel || "donnée";
  let reference = "";

  if (entityLabel === "clients") {
    reference = local?.name || local?.companyName || local?.id || "";
  } else if (entityLabel === "quotes" || entityLabel === "invoices") {
    reference = local?.number || local?.id || "";
  } else if (entityLabel === "settings") {
    reference = local?.companyName || "paramètres";
  }

  const referencePart = reference ? ` (${reference})` : "";
  const idPart = local?.id ? ` · id ${local.id}` : "";
  return (
    `Conflit cloud/local — version locale conservée${referencePart}${idPart} (${typeLabel}). ` +
    "Utilisez « Resynchroniser » si besoin."
  );
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
    merged[key] = mergeCollection(localData[key] || [], cloudData[key] || [], {
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
