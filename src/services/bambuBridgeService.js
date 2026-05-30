import { applyFilamentForPrint } from "./filamentService";
import { getSupabase, isSupabaseConfigured } from "../supabase";

export const JOB_STATUS = {
  PENDING: "pending",
  FINISHED: "finished",
  FAILED: "failed",
  APPLIED: "applied",
};

const LOCAL_ACCESS_NOTE = "stocké localement (CRM)";

function uid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getBridgeSettings(data = {}) {
  return data?.settings?.bambuBridge || {};
}

export function getPrinterAccessCode(data = {}, printerId) {
  const secrets = getBridgeSettings(data).printerSecrets || {};
  return String(secrets[String(printerId)]?.accessCode || "").trim();
}

export function setPrinterAccessCode(data = {}, printerId, accessCode) {
  const bridge = { ...getBridgeSettings(data) };
  const printerSecrets = { ...(bridge.printerSecrets || {}) };
  const code = String(accessCode || "").trim();

  if (code) {
    printerSecrets[String(printerId)] = { accessCode: code, updatedAt: nowIso() };
  } else {
    delete printerSecrets[String(printerId)];
  }

  return {
    ...data,
    settings: {
      ...data.settings,
      bambuBridge: {
        ...bridge,
        printerSecrets,
      },
    },
  };
}

export function getBambuPrinters(data = {}) {
  return [...(data.bambuPrinters || [])].sort((a, b) =>
    String(a.name || "").localeCompare(String(b.name || ""), "fr")
  );
}

export function getBambuPrinterById(data = {}, printerId) {
  return getBambuPrinters(data).find((entry) => String(entry.id) === String(printerId)) || null;
}

export function createBambuPrinter(data = {}, payload = {}) {
  const name = String(payload.name || "").trim();
  const host = String(payload.host || "").trim();
  const serial = String(payload.serial || "").trim();

  if (!name) throw new Error("Indiquez un nom pour l'imprimante.");
  if (!host) throw new Error("Indiquez l'adresse IP ou le nom d'hôte LAN.");
  if (!serial) throw new Error("Indiquez le numéro de série de l'imprimante.");

  const printer = {
    id: payload.id || uid(),
    name,
    host,
    serial,
    accessCodeEncrypted: LOCAL_ACCESS_NOTE,
    model: String(payload.model || "").trim() || null,
    enabled: payload.enabled !== false,
    createdAt: nowIso(),
  };

  return {
    ...data,
    bambuPrinters: [...(data.bambuPrinters || []), printer],
    printer,
  };
}

export function updateBambuPrinter(data = {}, printerId, patch = {}) {
  const printers = getBambuPrinters(data);
  const index = printers.findIndex((entry) => String(entry.id) === String(printerId));
  if (index < 0) throw new Error("Imprimante introuvable.");

  const current = printers[index];
  const next = {
    ...current,
    ...patch,
    name: patch.name != null ? String(patch.name).trim() : current.name,
    host: patch.host != null ? String(patch.host).trim() : current.host,
    serial: patch.serial != null ? String(patch.serial).trim() : current.serial,
    accessCodeEncrypted: LOCAL_ACCESS_NOTE,
  };

  const nextPrinters = [...printers];
  nextPrinters[index] = next;

  return { ...data, bambuPrinters: nextPrinters, printer: next };
}

export function deleteBambuPrinter(data = {}, printerId) {
  const id = String(printerId);
  return {
    ...data,
    bambuPrinters: (data.bambuPrinters || []).filter((entry) => String(entry.id) !== id),
    amsSlotMappings: (data.amsSlotMappings || []).filter((entry) => String(entry.printerId) !== id),
    bambuPrintJobs: (data.bambuPrintJobs || []).filter((entry) => String(entry.printerId) !== id),
  };
}

export function getAmsSlotMappings(data = {}, printerId) {
  return (data.amsSlotMappings || [])
    .filter((entry) => String(entry.printerId) === String(printerId))
    .sort(
      (a, b) =>
        n(a.amsUnit ?? 0) - n(b.amsUnit ?? 0) || n(a.slotIndex) - n(b.slotIndex)
    );
}

export function getBambuAmsTrays(data = {}, printerId) {
  return (data.bambuAmsTrays || [])
    .filter((entry) => String(entry.printerId) === String(printerId))
    .sort(
      (a, b) =>
        n(a.amsUnit) - n(b.amsUnit) || n(a.slotIndex) - n(b.slotIndex)
    );
}

export function formatAmsSlotLabel(amsUnit = 0, slotIndex = 0) {
  return `AMS${n(amsUnit) + 1} A${n(slotIndex) + 1}`;
}

/** Convertit RRGGBBAA (MQTT Bambu) en #RRGGBB pour affichage CSS. */
export function parseBambuColor(colorHex = "") {
  const raw = String(colorHex || "").replace(/^#/, "").trim();
  if (raw.length < 6) return null;
  return `#${raw.slice(0, 6)}`;
}

export function decodeTrayNow(trayNow) {
  const value = n(trayNow);
  if (value == null || value === 255 || value === 254) {
    return { amsUnit: null, slotIndex: null };
  }
  if (value >= 80) {
    return { amsUnit: value, slotIndex: 0 };
  }
  return { amsUnit: value >> 2, slotIndex: value & 0x3 };
}

export function resolveMappingForTray(data = {}, printerId, amsUnit = 0, slotIndex = 0) {
  return getAmsSlotMappings(data, printerId).find(
    (entry) =>
      n(entry.amsUnit ?? 0) === n(amsUnit) && n(entry.slotIndex) === n(slotIndex)
  );
}

export function upsertAmsSlotMapping(
  data = {},
  { printerId, slotIndex, filamentId, amsUnit = 0 } = {}
) {
  const slot = n(slotIndex);
  const unit = n(amsUnit);
  if (slot < 0 || slot > 3) {
    throw new Error("Les emplacements AMS vont de A1 à A4 (index 0–3 en interne).");
  }
  if (unit < 0 || unit > 7) {
    throw new Error("Unité AMS invalide (0 = AMS1, 1 = AMS2, …).");
  }

  const mappings = [...(data.amsSlotMappings || [])];
  const index = mappings.findIndex(
    (entry) =>
      String(entry.printerId) === String(printerId) &&
      n(entry.slotIndex) === slot &&
      n(entry.amsUnit ?? 0) === unit
  );

  const entry = {
    id: index >= 0 ? mappings[index].id : uid(),
    printerId: String(printerId),
    amsUnit: unit,
    slotIndex: slot,
    filamentId: filamentId ? String(filamentId) : "",
    updatedAt: nowIso(),
  };

  if (index >= 0) mappings[index] = entry;
  else mappings.push(entry);

  return { ...data, amsSlotMappings: mappings, mapping: entry };
}

export function getBambuPrintJobs(data = {}) {
  return [...(data.bambuPrintJobs || [])].sort(
    (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
  );
}

const JOB_STATUS_RANK = {
  [JOB_STATUS.PENDING]: 0,
  [JOB_STATUS.FINISHED]: 1,
  [JOB_STATUS.FAILED]: 2,
  [JOB_STATUS.APPLIED]: 3,
};

export function isJobInQueue(job) {
  return job?.status === JOB_STATUS.FINISHED;
}

export function getQueueJobs(data = {}) {
  return getBambuPrintJobs(data).filter(isJobInQueue);
}

/** Préserve les statuts terminaux locaux (ignoré / appliqué) face à un cloud encore « finished ». */
export function mergeBambuPrintJobsFromCloud(localJobs = [], cloudJobs = []) {
  const localById = new Map(
    (localJobs || []).filter((job) => job?.id).map((job) => [String(job.id), job])
  );
  const cloudById = new Map(
    (cloudJobs || []).filter((job) => job?.id).map((job) => [String(job.id), job])
  );
  const ids = new Set([...localById.keys(), ...cloudById.keys()]);
  const merged = [];

  for (const id of ids) {
    const local = localById.get(id);
    const cloud = cloudById.get(id);
    if (!local) {
      merged.push(cloud);
      continue;
    }
    if (!cloud) {
      merged.push(local);
      continue;
    }

    const localRank = JOB_STATUS_RANK[local.status] ?? 0;
    const cloudRank = JOB_STATUS_RANK[cloud.status] ?? 0;
    if (localRank > cloudRank) {
      merged.push(local);
    } else if (cloudRank > localRank) {
      merged.push(cloud);
    } else if (local.rawMqttJson?.ignoredByUser) {
      merged.push(local);
    } else {
      merged.push(cloud);
    }
  }

  return merged.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function resolveFilamentForJob(data = {}, job = {}) {
  if (job.filamentId) {
    return String(job.filamentId);
  }

  const mqtt = job.rawMqttJson || {};
  let amsUnit = mqtt.amsUnit ?? mqtt.ams_unit;
  let slotIndex = mqtt.amsTrayIndex ?? mqtt.tray_index ?? mqtt.trayIndex;

  if (mqtt.tray_now != null) {
    const decoded = decodeTrayNow(mqtt.tray_now);
    if (decoded.amsUnit != null) {
      amsUnit = decoded.amsUnit;
      slotIndex = decoded.slotIndex;
    }
  }

  if (slotIndex == null || slotIndex === "") return "";

  const mapping = getAmsSlotMappings(data, job.printerId).find((entry) => {
    const entryUnit = n(entry.amsUnit ?? 0);
    const entrySlot = n(entry.slotIndex);
    if (amsUnit != null && amsUnit !== "") {
      return entryUnit === n(amsUnit) && entrySlot === n(slotIndex);
    }
    return entrySlot === n(slotIndex);
  });
  return mapping?.filamentId || "";
}

export function createBambuPrintJob(data = {}, payload = {}) {
  const printerId = String(payload.printerId || "").trim();
  if (!printerId) throw new Error("Imprimante requise pour le job.");

  const job = {
    id: payload.id || uid(),
    printerId,
    jobName: String(payload.jobName || "").trim() || "Impression",
    status: payload.status || JOB_STATUS.FINISHED,
    gramsEstimated: payload.gramsEstimated != null ? n(payload.gramsEstimated) : null,
    filamentId: payload.filamentId ? String(payload.filamentId) : "",
    rawMqttJson: payload.rawMqttJson || null,
    finishedAt: payload.finishedAt || (payload.status === JOB_STATUS.FINISHED ? nowIso() : null),
    appliedAt: null,
    createdAt: nowIso(),
  };

  return {
    ...data,
    bambuPrintJobs: [job, ...(data.bambuPrintJobs || [])],
    job,
  };
}

export function updateBambuPrintJob(data = {}, jobId, patch = {}) {
  const jobs = getBambuPrintJobs(data);
  const index = jobs.findIndex((entry) => String(entry.id) === String(jobId));
  if (index < 0) throw new Error("Job d'impression introuvable.");

  const next = { ...jobs[index], ...patch };
  const nextJobs = [...jobs];
  nextJobs[index] = next;

  return { ...data, bambuPrintJobs: nextJobs, job: next };
}

export function simulatePrintFinish(data = {}, { printerId, jobName, grams } = {}) {
  const printer = getBambuPrinterById(data, printerId);
  if (!printer) throw new Error("Sélectionnez une imprimante Bambu.");

  const gramsEstimated = n(grams) > 0 ? n(grams) : 50;
  return createBambuPrintJob(data, {
    printerId,
    jobName: jobName || `Test — ${printer.name}`,
    status: JOB_STATUS.FINISHED,
    gramsEstimated,
    rawMqttJson: { simulated: true, gcode_state: "FINISH" },
    finishedAt: nowIso(),
  });
}

export function ignoreBambuPrintJob(data = {}, jobId) {
  const job = getBambuPrintJobs(data).find((entry) => String(entry.id) === String(jobId));
  if (!job) throw new Error("Job introuvable.");
  if (job.status === JOB_STATUS.APPLIED) {
    throw new Error("Ce job a déjà été appliqué au stock.");
  }
  if (job.status === JOB_STATUS.FAILED && job.rawMqttJson?.ignoredByUser) {
    return { ...data, job };
  }

  return updateBambuPrintJob(data, jobId, {
    status: JOB_STATUS.FAILED,
    rawMqttJson: {
      ...(job.rawMqttJson || {}),
      ignoredByUser: true,
      ignoredAt: nowIso(),
    },
  });
}

export function ignoreAllQueueJobs(data = {}) {
  const queue = getQueueJobs(data);
  if (!queue.length) {
    return { ...data, ignoredJobs: [] };
  }

  let next = data;
  const ignoredJobs = [];
  for (const job of queue) {
    const result = ignoreBambuPrintJob(next, job.id);
    next = result;
    ignoredJobs.push(result.job);
  }

  return { ...next, ignoredJobs };
}

export function applyJobToStock(data = {}, jobId, { grams, filamentId, projectName } = {}) {
  const job = getBambuPrintJobs(data).find((entry) => String(entry.id) === String(jobId));
  if (!job) throw new Error("Job introuvable.");
  if (job.status === JOB_STATUS.APPLIED) {
    throw new Error("Le stock a déjà été mis à jour pour ce job.");
  }
  if (job.status !== JOB_STATUS.FINISHED) {
    throw new Error("Seuls les jobs terminés peuvent être appliqués au stock.");
  }

  const resolvedFilamentId = filamentId || resolveFilamentForJob(data, job);
  if (!resolvedFilamentId) {
    throw new Error("Associez un filament (job ou emplacement AMS) avant d'appliquer.");
  }

  const weightG = n(grams) > 0 ? n(grams) : n(job.gramsEstimated);
  if (weightG <= 0) {
    throw new Error("Indiquez un poids consommé supérieur à 0 g.");
  }

  const printResult = applyFilamentForPrint(data, {
    filamentId: resolvedFilamentId,
    grams: weightG,
    projectName: projectName || job.jobName,
    reason: "Impression Bambu (pont LAN)",
  });

  const { movement, filament, belowThreshold, thresholdMessage, ...nextData } = printResult;
  const withJob = updateBambuPrintJob(nextData, jobId, {
    status: JOB_STATUS.APPLIED,
    filamentId: resolvedFilamentId,
    gramsEstimated: weightG,
    appliedAt: nowIso(),
  });

  return {
    ...withJob,
    movement,
    filament,
    belowThreshold,
    thresholdMessage,
    appliedGrams: weightG,
  };
}

export function printerToDbRow(printer = {}) {
  return {
    id: printer.id,
    name: printer.name,
    host: printer.host,
    serial: printer.serial,
    access_code_encrypted: printer.accessCodeEncrypted || LOCAL_ACCESS_NOTE,
    model: printer.model || null,
    enabled: printer.enabled !== false,
    created_at: printer.createdAt || nowIso(),
  };
}

export function dbRowToPrinter(row = {}) {
  return {
    id: row.id,
    name: row.name || "",
    host: row.host || "",
    serial: row.serial || "",
    accessCodeEncrypted: row.access_code_encrypted || "",
    model: row.model || "",
    enabled: row.enabled !== false,
    createdAt: row.created_at,
  };
}

export function mappingToDbRow(mapping = {}) {
  return {
    id: mapping.id,
    printer_id: mapping.printerId,
    ams_unit: n(mapping.amsUnit ?? 0),
    slot_index: n(mapping.slotIndex),
    filament_id: mapping.filamentId || null,
    updated_at: mapping.updatedAt || nowIso(),
  };
}

export function dbRowToMapping(row = {}) {
  return {
    id: row.id,
    printerId: row.printer_id,
    amsUnit: n(row.ams_unit ?? 0),
    slotIndex: n(row.slot_index),
    filamentId: row.filament_id || "",
    updatedAt: row.updated_at,
  };
}

export function trayToDbRow(tray = {}) {
  return {
    id: tray.id,
    printer_id: tray.printerId,
    ams_unit: n(tray.amsUnit),
    slot_index: n(tray.slotIndex),
    material: tray.material || null,
    color: tray.color || null,
    tag_uid: tray.tagUid || null,
    remain_pct: tray.remainPct != null ? n(tray.remainPct) : null,
    remain_g: tray.remainG != null ? n(tray.remainG) : null,
    tray_info_idx: tray.trayInfoIdx || null,
    tray_type: tray.trayType || null,
    tray_weight_g: tray.trayWeightG != null ? n(tray.trayWeightG) : null,
    empty: tray.empty === true,
    updated_at: tray.updatedAt || nowIso(),
  };
}

export function dbRowToTray(row = {}) {
  return {
    id: row.id,
    printerId: row.printer_id,
    amsUnit: n(row.ams_unit),
    slotIndex: n(row.slot_index),
    material: row.material || "",
    color: row.color || "",
    tagUid: row.tag_uid || "",
    remainPct: row.remain_pct != null ? n(row.remain_pct) : null,
    remainG: row.remain_g != null ? n(row.remain_g) : null,
    trayInfoIdx: row.tray_info_idx || "",
    trayType: row.tray_type || "",
    trayWeightG: row.tray_weight_g != null ? n(row.tray_weight_g) : null,
    empty: row.empty === true,
    updatedAt: row.updated_at,
  };
}

export function jobToDbRow(job = {}) {
  return {
    id: job.id,
    printer_id: job.printerId,
    job_name: job.jobName || null,
    status: job.status || JOB_STATUS.PENDING,
    grams_estimated: job.gramsEstimated != null ? n(job.gramsEstimated) : null,
    filament_id: job.filamentId || null,
    raw_mqtt_json: job.rawMqttJson || null,
    finished_at: job.finishedAt || null,
    applied_at: job.appliedAt || null,
    created_at: job.createdAt || nowIso(),
  };
}

export function dbRowToJob(row = {}) {
  return {
    id: row.id,
    printerId: row.printer_id,
    jobName: row.job_name || "",
    status: row.status || JOB_STATUS.PENDING,
    gramsEstimated: row.grams_estimated != null ? n(row.grams_estimated) : null,
    filamentId: row.filament_id || "",
    rawMqttJson: row.raw_mqtt_json || null,
    finishedAt: row.finished_at,
    appliedAt: row.applied_at,
    createdAt: row.created_at,
  };
}

export async function pushBambuChangesToSupabase({
  printers = [],
  mappings = [],
  jobs = [],
} = {}) {
  if (!isSupabaseConfigured) return { ok: true, storage: "local" };

  try {
    const supabase = await getSupabase();
    if (printers.length) {
      const { error } = await supabase
        .from("bambu_printers")
        .upsert(printers.map(printerToDbRow), { onConflict: "id" });
      if (error) throw error;
    }
    if (mappings.length) {
      const { error } = await supabase
        .from("ams_slot_mappings")
        .upsert(mappings.map(mappingToDbRow), { onConflict: "id" });
      if (error) throw error;
    }
    if (jobs.length) {
      const { error } = await supabase
        .from("bambu_print_jobs")
        .upsert(jobs.map(jobToDbRow), { onConflict: "id" });
      if (error) throw error;
    }
    return { ok: true, storage: "supabase" };
  } catch (error) {
    console.warn("[bambuBridgeService] Sync Supabase échouée.", error);
    return { ok: false, storage: "local", error };
  }
}

export async function loadBambuFromSupabase() {
  if (!isSupabaseConfigured) {
    return { printers: [], mappings: [], jobs: [], trays: [] };
  }

  try {
    const supabase = await getSupabase();
    const [printersRes, mappingsRes, jobsRes, traysRes] = await Promise.all([
      supabase.from("bambu_printers").select("*").order("created_at", { ascending: true }),
      supabase.from("ams_slot_mappings").select("*").order("printer_id", { ascending: true }),
      supabase.from("bambu_print_jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("bambu_ams_trays").select("*").order("updated_at", { ascending: false }),
    ]);

    const missing = (res) =>
      res.error?.code === "PGRST205" || res.error?.code === "42P01";

    if (missing(printersRes)) {
      return { printers: [], mappings: [], jobs: [], trays: [] };
    }
    if (printersRes.error) throw printersRes.error;

    return {
      printers: (printersRes.data || []).map(dbRowToPrinter),
      mappings: missing(mappingsRes) ? [] : (mappingsRes.data || []).map(dbRowToMapping),
      jobs: missing(jobsRes) ? [] : (jobsRes.data || []).map(dbRowToJob),
      trays: missing(traysRes) ? [] : (traysRes.data || []).map(dbRowToTray),
    };
  } catch (error) {
    console.warn("[bambuBridgeService] Chargement Supabase impossible.", error);
    return { printers: [], mappings: [], jobs: [], trays: [] };
  }
}

export async function loadAmsTraysFromSupabase(printerId) {
  if (!isSupabaseConfigured || !printerId) return [];

  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("bambu_ams_trays")
      .select("*")
      .eq("printer_id", String(printerId))
      .order("ams_unit", { ascending: true })
      .order("slot_index", { ascending: true });

    if (error) {
      if (error.code === "PGRST205" || error.code === "42P01") return [];
      throw error;
    }

    return (data || []).map(dbRowToTray);
  } catch (error) {
    console.warn("[bambuBridgeService] Chargement AMS impossible.", error);
    return [];
  }
}

export async function syncBambuFromSupabase(data = {}) {
  const cloud = await loadBambuFromSupabase();
  if (!cloud.printers.length && !cloud.mappings.length && !cloud.jobs.length && !cloud.trays.length) {
    return data;
  }

  const localJobs = data.bambuPrintJobs || [];
  const mergedJobs = cloud.jobs.length
    ? mergeBambuPrintJobsFromCloud(localJobs, cloud.jobs)
    : localJobs;

  return {
    ...data,
    bambuPrinters: cloud.printers.length ? cloud.printers : data.bambuPrinters || [],
    amsSlotMappings: cloud.mappings.length ? cloud.mappings : data.amsSlotMappings || [],
    bambuPrintJobs: mergedJobs,
    bambuAmsTrays: cloud.trays.length ? cloud.trays : data.bambuAmsTrays || [],
  };
}

export function buildBridgeConfigForPrinter(data = {}, printerId) {
  const printer = getBambuPrinterById(data, printerId);
  if (!printer) return null;

  return {
    id: printer.id,
    name: printer.name,
    host: printer.host,
    serial: printer.serial,
    model: printer.model,
    accessCode: getPrinterAccessCode(data, printerId),
    amsMappings: getAmsSlotMappings(data, printerId).map((entry) => ({
      amsUnit: entry.amsUnit ?? 0,
      slotIndex: entry.slotIndex,
      filamentId: entry.filamentId,
    })),
  };
}

export function jobStatusLabel(status) {
  if (status === JOB_STATUS.PENDING) return "En attente";
  if (status === JOB_STATUS.FINISHED) return "À traiter";
  if (status === JOB_STATUS.APPLIED) return "Appliqué";
  if (status === JOB_STATUS.FAILED) return "Ignoré / échec";
  return status || "—";
}
