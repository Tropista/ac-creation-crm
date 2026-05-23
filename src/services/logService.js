import { getSupabase, isSupabaseConfigured } from "../supabase";
import { uid } from "../utils/documents";
import {
  normalizeData,
  saveData
} from "./dataService";

export function addLog(
  data,
  updateData,
  currentUser,
  actionName,
  targetName,
  detailsText = ""
) {
  const log = {
    id: crypto.randomUUID(),

    user_name:
      currentUser?.name ||
      "Système",

    action:
      actionName,

    target:
      targetName,

    details:
      detailsText,

    user:
      currentUser?.name ||
      "Système",

    date:
      new Date()
        .toISOString(),
  };

  updateData({
    ...data,

    logs: [
      log,
      ...(data.logs || [])
    ].slice(0, 500),
  });
}

export async function logActivity({
  action,
  target = "",
  details = "",

  currentUser,
  currentRole,

  setData,
}) {
  const log = {
    id: uid(),

    createdAt:
      new Date()
        .toISOString(),

    date:
      new Date()
        .toISOString(),

    user_name:
      currentUser?.name ||
      currentUser?.email ||
      "Système",

    user:
      currentUser?.name ||
      currentUser?.email ||
      "Système",

    email:
      currentUser?.email ||
      "",

    role:
      currentRole,

    action,
    target,
    details,
  };

  setData(
    (
      currentData
    ) => {
      const normalized =
        normalizeData({
          ...currentData,

          logs: [
            log,
            ...(
              currentData.logs ||
              []
            )
          ].slice(
            0,
            500
          ),
        });

      saveData(
        normalized
      );

      return normalized;
    }
  );

  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const supabase = await getSupabase();
    const {
      error
    } =
      await supabase
        .from(
          "crm_logs"
        )
        .upsert(
          {
            id:
              log.id,

            data:
              log,

            user_name:
              log.user_name ||
              log.user ||
              "Système",

            action:
              log.action ||
              "",

            target:
              log.target ||
              "",

            details:
              log.details ||
              "",
          },

          {
            onConflict:
              "id"
          }
        );

    if (error)
      throw error;

  } catch (
    error
  ) {
    console.error(
      "Erreur journal d'activité :",
      error
    );
  }
}