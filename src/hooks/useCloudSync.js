import { useEffect, useRef, useCallback, useState } from "react";
import { hasSupabaseAuthSession, isSupabaseConfigured } from "../supabase";
import { showToast } from "../utils/toast";
import {
  emptyData,
  normalizeData,
  loadData,
  saveData,
  flushSaveData,
  dedupeItemsById,
  hasLocalBusinessData,
} from "../services/dataService";
import { mergePublicLeadsIntoData } from "../services/leadsService";
import { mergeSettingsCalculatorProjects } from "../utils/calculatorProjects";
import {
  formatSyncConflictMessage,
  getLastSyncAt,
  getLastSyncConflictCount,
  mergeCloudWithLocal,
  resolveCloudInitError,
  setLastSyncAt,
  setLastSyncConflictCount,
  stampDataChanges,
  SYNC_STATUS,
} from "../services/syncMerge";

async function loadSupabaseSyncModule() {
  return import("../services/supabaseSync");
}

const LOCAL_QUOTA_TOAST_KEY = "crm_local_quota_toast_shown";

function showLocalQuotaToast(message, type = "warning") {
  try {
    if (sessionStorage.getItem(LOCAL_QUOTA_TOAST_KEY)) {
      return;
    }
    sessionStorage.setItem(LOCAL_QUOTA_TOAST_KEY, "1");
  } catch {
    // sessionStorage indisponible (mode privé strict, etc.)
  }

  showToast(message, type);
}

function prepareAppData(raw) {
  const withLeads = mergePublicLeadsIntoData(raw);
  mergeSettingsCalculatorProjects(withLeads.settings || {});
  return normalizeData({
    ...withLeads,
    users: dedupeItemsById(withLeads.users || []),
    backups: dedupeItemsById(withLeads.backups || []),
    logs: dedupeItemsById(withLeads.logs || []),
  });
}

/**
 * Sync cloud Supabase — extrait de App.jsx (audit #21).
 */
export function useCloudSync({ currentUserEmail, setData, setLoading }) {
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.CONNECTING);
  const [lastSyncAt, setLastSyncAtState] = useState(() => getLastSyncAt());
  const [syncConflictCount, setSyncConflictCountState] = useState(() =>
    getLastSyncConflictCount()
  );
  const [resyncing, setResyncing] = useState(false);

  const cloudInitPromise = useRef(null);
  const cloudSyncSucceeded = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());
  const dataRef = useRef(null);

  const bindDataRef = useCallback((data) => {
    dataRef.current = data;
  }, []);

  function markSyncSuccess(timestamp = Date.now()) {
    setLastSyncAt(timestamp);
    setLastSyncAtState(timestamp);
  }

  async function initializeCloudData({ silent = false } = {}) {
    if (cloudInitPromise.current) {
      return cloudInitPromise.current;
    }

    const task = (async () => {
      try {
        const localData = normalizeData(loadData());

        if (!isSupabaseConfigured) {
          const prepared = prepareAppData(localData);
          setData(prepared);
          saveData(prepared);
          flushSaveData();
          setSyncStatus(SYNC_STATUS.LOCAL_NO_CONFIG);
          return;
        }

        const hasAuth = await hasSupabaseAuthSession();
        if (!hasAuth) {
          const prepared = prepareAppData(localData);
          setData(prepared);
          saveData(prepared);
          flushSaveData();
          setSyncStatus(SYNC_STATUS.LOCAL_UNAVAILABLE);
          setCloudAvailable(false);
          return;
        }

        const { loadSupabaseData, syncSupabaseData } = await loadSupabaseSyncModule();
        const freshLocal = normalizeData(loadData());
        const cloud = await loadSupabaseData({
          normalizeData,
          emptyData,
          localTombstones: freshLocal.settings?.deletionTombstones,
        });

        if (cloud.hasCloudData) {
          let conflictCount = 0;

          const mergedRaw = mergeCloudWithLocal(freshLocal, cloud.data, {
            onConflict: (payload) => {
              conflictCount += 1;
              const message = formatSyncConflictMessage(payload);
              if (silent) {
                console.warn("[Sync]", message);
              } else {
                showToast(message, "warning");
              }
            },
          });

          const prepared = prepareAppData(mergedRaw);
          setData(prepared);
          const synced = await syncSupabaseData(prepared, cloud.data);
          const syncedPrepared = prepareAppData(synced);

          saveData(syncedPrepared);
          flushSaveData();
          setData(syncedPrepared);

          markSyncSuccess();
          cloudSyncSucceeded.current = true;
          setSyncStatus(SYNC_STATUS.SYNCED);
          setLastSyncConflictCount(conflictCount);
          setSyncConflictCountState(conflictCount);
          if (!silent && conflictCount) {
            showToast(
              `${conflictCount} conflit(s) — versions locales conservées. Vérifiez vos données ou resynchronisez.`,
              "info"
            );
          }
        } else if (hasLocalBusinessData(localData)) {
          const prepared = prepareAppData(localData);
          await syncSupabaseData(prepared, emptyData);
          setData(prepared);
          markSyncSuccess();
          cloudSyncSucceeded.current = true;
          setSyncStatus(SYNC_STATUS.LOCAL_PUSHED);
          saveData(prepared);
          flushSaveData();
          if (!silent) {
            showToast("Données locales synchronisées vers Supabase", "success");
          }
        } else {
          const prepared = prepareAppData(emptyData);
          await syncSupabaseData(prepared, emptyData);
          setData(prepared);
          saveData(prepared);
          flushSaveData();
          markSyncSuccess();
          cloudSyncSucceeded.current = true;
          setSyncStatus(SYNC_STATUS.READY);
        }

        setCloudAvailable(true);
      } catch (error) {
        console.error(error);
        const recoveredData = normalizeData(loadData());

        const outcome = resolveCloudInitError({
          cloudAlreadySynced: cloudSyncSucceeded.current,
          error,
        });
        setCloudAvailable(outcome.cloudAvailable);
        setSyncStatus(outcome.syncStatus);
        if (!silent && outcome.toast) {
          showToast(outcome.toast.message, outcome.toast.type);
        }

        const prepared = prepareAppData(recoveredData);
        setData(prepared);
        saveData(prepared);
        flushSaveData();
      } finally {
        setLoading(false);
        cloudInitPromise.current = null;
      }
    })();

    cloudInitPromise.current = task;
    return task;
  }

  async function resyncFromCloud() {
    if (resyncing) return;

    setResyncing(true);
    cloudInitPromise.current = null;

    try {
      await initializeCloudData({ silent: false });
      showToast("Resynchronisation terminée", "success");
    } catch (error) {
      console.error("Échec resynchronisation :", error);
    } finally {
      setResyncing(false);
      setLastSyncAtState(getLastSyncAt());
      setSyncConflictCountState(getLastSyncConflictCount());
    }
  }

  async function updateDataWithCloudSync(next) {
    const task = saveQueueRef.current.then(async () => {
      const current = dataRef.current;
      const resolved = typeof next === "function" ? next(current) : next;
      const stamped = stampDataChanges(current, resolved);
      const normalized = normalizeData({
        ...stamped,
        users: dedupeItemsById(stamped.users || []),
        backups: dedupeItemsById(stamped.backups || []),
        logs: dedupeItemsById(stamped.logs || []),
      });

      const previous = current;

      dataRef.current = normalized;
      setData(normalized);

      let cloudSaved = false;

      if (isSupabaseConfigured && (await hasSupabaseAuthSession())) {
        try {
          setSyncStatus(SYNC_STATUS.SAVING);
          const { syncSupabaseData } = await loadSupabaseSyncModule();
          const synced = await syncSupabaseData(normalized, previous);
          const syncedNormalized = normalizeData({
            ...synced,
            users: dedupeItemsById(synced.users || []),
            backups: dedupeItemsById(synced.backups || []),
            logs: dedupeItemsById(synced.logs || []),
          });

          dataRef.current = syncedNormalized;
          setData(syncedNormalized);
          markSyncSuccess();
          cloudSyncSucceeded.current = true;
          cloudSaved = true;
          setCloudAvailable(true);
          setSyncStatus(SYNC_STATUS.SYNCED);

          saveData(syncedNormalized);
          const localSaveResult = flushSaveData();

          if (localSaveResult?.quotaExceeded && cloudSaved) {
            showLocalQuotaToast(
              "Cache local plein — vos données sont bien enregistrées dans le cloud.",
              "warning"
            );
          } else if (localSaveResult?.quotaExceeded && !cloudSaved) {
            showLocalQuotaToast(
              "Quota localStorage dépassé — les données risquent de ne pas survivre au rechargement.",
              "error"
            );
          }

          return syncedNormalized;
        } catch (error) {
          console.error("Échec sync Supabase :", error);
          if (cloudSyncSucceeded.current) {
            setCloudAvailable(true);
            setSyncStatus(SYNC_STATUS.SAVE_ERROR);
          } else {
            setCloudAvailable(false);
            setSyncStatus(SYNC_STATUS.LOCAL_UNAVAILABLE);
          }
          showToast(
            error?.message
              ? `Erreur de sauvegarde Supabase : ${error.message}`
              : "Erreur de sauvegarde Supabase — données conservées localement",
            "error"
          );
          throw error;
        }
      } else {
        setSyncStatus(SYNC_STATUS.LOCAL_NO_CONFIG);
      }

      saveData(normalized);
      const localSaveResult = flushSaveData();

      if (localSaveResult?.quotaExceeded && cloudSaved) {
        showLocalQuotaToast(
          "Cache local plein — vos données sont bien enregistrées dans le cloud.",
          "warning"
        );
      } else if (localSaveResult?.quotaExceeded && !cloudSaved) {
        showLocalQuotaToast(
          "Quota localStorage dépassé — les données risquent de ne pas survivre au rechargement.",
          "error"
        );
      }

      return normalized;
    });

    saveQueueRef.current = task.catch(() => {});
    return task;
  }

  useEffect(() => {
    cloudInitPromise.current = null;
    initializeCloudData();
  }, [currentUserEmail]);

  return {
    cloudAvailable,
    syncStatus,
    setSyncStatus,
    lastSyncAt,
    syncConflictCount,
    resyncing,
    cloudSyncSucceeded,
    initializeCloudData,
    resyncFromCloud,
    updateDataWithCloudSync,
    bindDataRef,
  };
}

export { prepareAppData };
