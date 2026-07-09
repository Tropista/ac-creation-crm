import {
  createBackupSnapshot,
  pruneBackups
} from "../utils/documents";

import {
  normalizeData,
  flushSaveData
} from "./dataService";

import { showToast } from "../utils/toast";

import { isSupabaseConfigured } from "../supabase";

export async function createCloudBackup({
  data,

  label =
    "Sauvegarde manuelle",

  setData,

  setSyncStatus,

  currentUser,

  currentRole,

  logActivity,

  silent = false,

  onSuccess,
}) {
  if (!isSupabaseConfigured) {
    if (!silent) {
      setSyncStatus?.("Mode local (cloud non configuré)");
      showToast(
        "Sauvegarde cloud indisponible — Supabase non configuré",
        "info"
      );
    }
    return false;
  }
  const backup =
    createBackupSnapshot(
      data,
      label
    );

  const next =
    normalizeData({
      ...data,

      backups:
        pruneBackups(
          [
            backup,
            ...(
              data.backups ||
              []
            )
          ],

          12
        ),
    });

  setData(next);

  try {
    setSyncStatus(
      "Création sauvegarde cloud..."
    );

    const { syncSupabaseData } = await import("./supabaseSync");
    await syncSupabaseData(
      next,
      data
    );

    flushSaveData();
    setSyncStatus(
      "Sauvegarde cloud créée"
    );
    showToast(`Sauvegarde créée : ${label}`, "success");

    await logActivity?.({
      action:
        "Sauvegarde créée",

      target:
        label,

      currentUser,

      currentRole,

      setData,
    });

    onSuccess?.();
    return true;

  } catch (
    error
  ) {
    console.error(
      error
    );

    if (!silent) {
      setSyncStatus(
        "Erreur sauvegarde cloud"
      );

      showToast(
        "Erreur pendant la sauvegarde cloud",
        "error"
      );
    }

    return false;
  }
}