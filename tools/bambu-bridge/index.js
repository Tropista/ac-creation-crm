/**

 * Pont MQTT LAN Bambu Lab → table bambu_print_jobs (Supabase REST ou sortie JSON locale).

 * Le navigateur CRM ne peut pas joindre le broker imprimante (TLS 8883, LAN).

 */

import fs from "node:fs";

import path from "node:path";

import { fileURLToPath } from "node:url";

import mqtt from "mqtt";

import { randomUUID } from "node:crypto";

import {

  buildDeviceTopics,

  buildMqttConnectOptions,

  buildPrinterUpsertPayload,

  describeMqttFailure,

  formatFailureForConsole,

  formatSupabaseRestError,

  maskSecret,

  assertSupabaseServiceRoleKey,

  resolveEffectivePrinterId,

  validateBambuConfig,

} from "./mqttConfig.js";

import {
  createAmsSyncThrottler,
  parseAmsFromMqtt,
  upsertAmsTraysToSupabase,
} from "./amsSync.js";



const __dirname = path.dirname(fileURLToPath(import.meta.url));



function loadConfig() {

  const fromEnv = {

    host: process.env.BAMBU_HOST,

    serial: process.env.BAMBU_SERIAL,

    accessCode: process.env.BAMBU_ACCESS_CODE,

    printerId: process.env.BAMBU_PRINTER_ID,

    model: process.env.BAMBU_MODEL,

    gramsDefault: Number(process.env.BAMBU_GRAMS_DEFAULT || 50),

    supabaseUrl: process.env.SUPABASE_URL,

    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,

  };



  const configPath = path.join(__dirname, "config.json");

  let fromFile = {};

  if (fs.existsSync(configPath)) {

    fromFile = JSON.parse(fs.readFileSync(configPath, "utf8"));

  }



  return {

    gramsDefault: 50,

    ...fromFile,

    ...Object.fromEntries(Object.entries(fromEnv).filter(([, value]) => value != null && value !== "")),

  };

}



function printConfigValidation(validation) {

  for (const warning of validation.warnings) {

    console.warn(`[bambu-bridge] ⚠ ${warning}`);

  }

  if (!validation.valid) {

    console.error("[bambu-bridge] Configuration invalide :");

    for (const err of validation.errors) {

      console.error(`  • ${err}`);

    }

    process.exit(1);

  }

}



export function extractPrintState(payload) {
  const print = payload?.print || payload;
  if (!print || typeof print !== "object") return null;

  const jobIdRaw =
    print.task_id ??
    print.subtask_id ??
    print.job_id ??
    print.print_id ??
    print.taskid ??
    print.subtask_id_str;
  const jobId = jobIdRaw != null && String(jobIdRaw).trim() !== "" ? String(jobIdRaw).trim() : null;

  return {
    gcodeState: String(print.gcode_state || print.gcodeState || "").toUpperCase(),
    jobName:
      String(print.subtask_name || print.gcode_file || print.project_name || "").trim() ||
      "Impression",
    jobId,
    percent: Number(print.mc_percent ?? print.print_progress ?? 0),
    amsTrayIndex:
      print.ams_tray_index ??
      print.tray_idx ??
      print.tray_now ??
      (Array.isArray(print.ams?.ams) ? print.ams.ams[0]?.tray_now : undefined),
  };
}

/** Clé stable pour éviter un double enregistrement sur le même cycle FINISH. */
export function buildFinishDedupeKey(serial, state) {
  const idPart = state.jobId || state.jobName || "unknown";
  return `${serial}:${idPart}`;
}

/**
 * Détecte la transition vers FINISH (pas un rapport MQTT répété en FINISH).
 * Mémorise le dernier job FINISH inséré par imprimante (serial).
 */
/** États « impression en cours » : une nouvelle fin devrait pouvoir être enregistrée. */
const ACTIVE_PRINT_GCODE_STATES = new Set([
  "RUNNING",
  "PREPARE",
  "SLICING",
  "PRINTING",
  "PAUSED",
]);

export function createFinishTransitionTracker() {
  const lastGcodeStateBySerial = new Map();
  const lastInsertedFinishKeyBySerial = new Map();

  return {
    lastGcodeStateBySerial,
    lastInsertedFinishKeyBySerial,
    shouldRecordFinish(serial, state) {
      const previous = lastGcodeStateBySerial.get(serial) ?? "";
      const current = state.gcodeState;

      if (current !== "FINISH") {
        if (ACTIVE_PRINT_GCODE_STATES.has(current)) {
          lastInsertedFinishKeyBySerial.delete(serial);
        }
        lastGcodeStateBySerial.set(serial, current);
        return { record: false, reason: "not_finish" };
      }

      lastGcodeStateBySerial.set(serial, current);
      if (previous === "FINISH") {
        return { record: false, reason: "already_finish" };
      }

      const dedupeKey = buildFinishDedupeKey(serial, state);
      if (lastInsertedFinishKeyBySerial.get(serial) === dedupeKey) {
        return { record: false, reason: "duplicate_job", dedupeKey };
      }

      return { record: true, reason: "transition_to_finish", dedupeKey };
    },
    markFinishRecorded(serial, dedupeKey) {
      lastInsertedFinishKeyBySerial.set(serial, dedupeKey);
    },
    resetInsertedForSerial(serial) {
      lastInsertedFinishKeyBySerial.delete(serial);
    },
  };
}



function supabaseRestBase(config) {

  return String(config.supabaseUrl || "").replace(/\/$/, "");

}



function supabaseRestHeaders(serviceKey, prefer = "return=minimal") {

  return {

    apikey: serviceKey,

    Authorization: `Bearer ${serviceKey}`,

    "Content-Type": "application/json",

    Prefer: prefer,

  };

}



/** Crée la ligne bambu_printers si absente (ignore si l'id existe déjà — ex. sync CRM). */

export async function ensurePrinterRegistered(config, { log = true } = {}) {
  if (!config.supabaseUrl || !config.supabaseServiceKey) return null;

  assertSupabaseServiceRoleKey(config.supabaseServiceKey);

  const row = buildPrinterUpsertPayload(config);
  const url = `${supabaseRestBase(config)}/rest/v1/bambu_printers?on_conflict=id`;
  const response = await fetch(url, {
    method: "POST",
    headers: supabaseRestHeaders(
      config.supabaseServiceKey,
      "resolution=ignore-duplicates,return=minimal"
    ),
    body: JSON.stringify(row),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      formatSupabaseRestError(response.status, text, {
        operation: "printer",
        printerId: row.id,
      })
    );
  }

  if (log) {
    console.log(
      `[bambu-bridge] Imprimante prête dans Supabase (id=${row.id}, série ${row.serial}).`
    );
  }

  return row;
}



async function insertFinishedJob(config, { jobName, gramsEstimated, rawMqttJson }) {
  const printerId = resolveEffectivePrinterId(config);

  const job = {

    id: randomUUID(),

    printer_id: printerId,

    job_name: jobName,

    status: "finished",

    grams_estimated: gramsEstimated,

    filament_id: null,

    raw_mqtt_json: rawMqttJson,

    finished_at: new Date().toISOString(),

    applied_at: null,

    created_at: new Date().toISOString(),

  };



  if (config.supabaseUrl && config.supabaseServiceKey) {
    assertSupabaseServiceRoleKey(config.supabaseServiceKey);

    const url = `${config.supabaseUrl.replace(/\/$/, "")}/rest/v1/bambu_print_jobs`;

    const response = await fetch(url, {

      method: "POST",

      headers: {

        apikey: config.supabaseServiceKey,

        Authorization: `Bearer ${config.supabaseServiceKey}`,

        "Content-Type": "application/json",

        Prefer: "return=minimal",

      },

      body: JSON.stringify(job),

    });



    if (!response.ok) {

      const text = await response.text();

      throw new Error(

        formatSupabaseRestError(response.status, text, { operation: "job", printerId })

      );

    }



    console.log(`[bambu-bridge] Job enregistré dans Supabase : ${job.job_name} (${job.id})`);

    return job;

  }



  console.log("[bambu-bridge] Job terminé (mode local, pas de Supabase configuré) :");

  console.log(JSON.stringify(job, null, 2));

  return job;

}



async function runSimulate(config) {

  await insertFinishedJob(config, {

    jobName: "simulation-test.3mf",

    gramsEstimated: config.gramsDefault,

    rawMqttJson: { simulated: true, gcode_state: "FINISH" },

  });

}



function startMqttBridge(config) {

  const validation = validateBambuConfig(config);

  printConfigValidation(validation);



  const { host, serial, accessCode } = validation.normalized;

  const mergedConfig = { ...config, host, serial, accessCode };

  const { report: topicReport, request: topicRequest } = buildDeviceTopics(serial);

  const mqttOptions = buildMqttConnectOptions(validation.normalized);



  console.log(

    `[bambu-bridge] Démarrage MQTT — ${host}:${mqttOptions.port} | série ${serial} | code ${maskSecret(accessCode)} | clientId ${mqttOptions.clientId}`

  );

  console.log(`[bambu-bridge] Topic rapport : ${topicReport}`);



  let lastState = "";
  let lastFailureKey = "";
  const finishTracker = createFinishTransitionTracker();
  const amsThrottler = createAmsSyncThrottler();

  const client = mqtt.connect(mqttOptions);



  client.on("connect", () => {

    lastFailureKey = "";

    console.log(`[bambu-bridge] Connecté à ${host} — abonnement ${topicReport}`);

    client.subscribe(topicReport, (error) => {

      if (error) {

        console.error("[bambu-bridge] Abonnement impossible :", error.message || error);

        console.error(

          `  → Vérifiez que le numéro de série est exact (${serial}) et que le mode développeur est actif.`

        );

        return;

      }

      const pushAll = { pushing: { sequence_id: "0", command: "pushall" } };

      client.publish(topicRequest, JSON.stringify(pushAll));

      console.log("[bambu-bridge] Demande pushall envoyée.");

    });

  });



  client.on("message", async (_topic, buffer) => {

    let payload;

    try {

      payload = JSON.parse(buffer.toString("utf8"));

    } catch {

      return;

    }



    const amsTrays = parseAmsFromMqtt(payload);
    if (amsTrays.length) {
      const amsDecision = amsThrottler.shouldPush(amsTrays);
      if (amsDecision.push) {
        try {
          await upsertAmsTraysToSupabase(mergedConfig, amsTrays, { log: amsDecision.reason === "changed" });
          amsThrottler.markPushed();
        } catch (error) {
          console.error("[bambu-bridge] Sync AMS échouée", error);
        }
      }
    }

    const state = extractPrintState(payload);

    if (!state?.gcodeState) return;

    if (state.gcodeState !== lastState) {

      console.log(`[bambu-bridge] État impression : ${state.gcodeState} — ${state.jobName}`);

      lastState = state.gcodeState;

    }



    const finishDecision = finishTracker.shouldRecordFinish(serial, state);
    if (!finishDecision.record) return;

    try {
      await insertFinishedJob(mergedConfig, {
        jobName: state.jobName,
        gramsEstimated: mergedConfig.gramsDefault,
        rawMqttJson: {
          gcode_state: state.gcodeState,
          job_id: state.jobId,
          amsTrayIndex: state.amsTrayIndex,
          mc_percent: state.percent,
          receivedAt: new Date().toISOString(),
          excerpt: state,
        },
      });
      finishTracker.markFinishRecorded(serial, finishDecision.dedupeKey);
    } catch (error) {
      console.error("[bambu-bridge] Enregistrement job échoué", error);
      finishTracker.resetInsertedForSerial(serial);
      finishTracker.lastGcodeStateBySerial.set(serial, "");
    }
  });



  client.on("error", (error) => {

    const failure = describeMqttFailure(error, { host, serial, accessCode });

    if (failure.key === lastFailureKey) return;

    lastFailureKey = failure.key;

    console.error(formatFailureForConsole(failure));

  });



  client.on("close", () => {

    console.warn("[bambu-bridge] Connexion MQTT fermée — reconnexion automatique…");

  });

}



const config = loadConfig();



if (process.argv.includes("--validate-config")) {

  const validation = validateBambuConfig(config);

  printConfigValidation(validation);

  console.log("[bambu-bridge] Configuration valide.");

  process.exit(0);

}



async function runBridge() {

  if (process.argv.includes("--simulate-finish")) {

    await runSimulate(config);

    return;

  }



  if (config.supabaseUrl && config.supabaseServiceKey) {

    await ensurePrinterRegistered(config);

  }



  startMqttBridge(config);

}



const isMainModule =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  runBridge().catch((error) => {
    console.error(error?.message || error);
    process.exit(1);
  });
}


