import {
  createBackupSnapshot,
  pruneBackups
} from "../utils/documents";

import {
  normalizeData,
  saveData
} from "./dataService";

import {
  syncSupabaseData
} from "./supabaseSync";

export async function createCloudBackup({
  data,

  label =
    "Sauvegarde manuelle",

  setData,

  setSyncStatus,

  currentUser,

  currentRole,

  logActivity,
}) {
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

  saveData(next);

  try {
    setSyncStatus(
      "Création sauvegarde cloud..."
    );

    await syncSupabaseData(
      next,
      data
    );

    setSyncStatus(
      "Sauvegarde cloud créée"
    );

    await logActivity({
      action:
        "Sauvegarde créée",

      target:
        label,

      currentUser,

      currentRole,

      setData,
    });

  } catch (
    error
  ) {
    console.error(
      error
    );

    setSyncStatus(
      "Erreur sauvegarde cloud"
    );

    alert(
      "Erreur pendant la sauvegarde cloud."
    );
  }
}