/**
 * Parse et synchronisation AMS depuis le rapport MQTT Bambu Lab.
 * Structure alignée ha-bambulab : print.ams.ams[].tray[]
 */

import {
  assertSupabaseServiceRoleKey,
  formatSupabaseRestError,
  resolveEffectivePrinterId,
} from "./mqttConfig.js";

const METADATA_ONLY_FIELDS = new Set(["id", "state"]);
const AMS_PUSH_INTERVAL_MS = 30_000;

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTrayWeightG(tray) {
  const raw = tray?.tray_weight ?? tray?.weight;
  if (raw == null || raw === "") return null;
  const grams = n(raw);
  return grams != null && grams >= 0 ? grams : null;
}

function parseRemainPct(tray) {
  const remain = n(tray?.remain);
  if (remain == null || remain < 0) return null;
  if (remain <= 100) return remain;
  return null;
}

function parseRemainG(tray, remainPct) {
  const trayWeightG = parseTrayWeightG(tray);
  if (trayWeightG != null && remainPct != null) {
    return Math.round((trayWeightG * remainPct) / 100);
  }
  const remain = n(tray?.remain);
  if (remain != null && remain > 100) return remain;
  return null;
}

function isEmptyTray(tray) {
  if (!tray || typeof tray !== "object") return true;
  const fields = new Set(Object.keys(tray));
  if (!fields.has("id")) return true;
  return [...fields].every((key) => METADATA_ONLY_FIELDS.has(key));
}

function resolveTrayColor(tray) {
  const direct = String(tray?.tray_color || "").trim();
  if (direct) return direct;
  const cols = Array.isArray(tray?.cols) ? tray.cols : [];
  const first = String(cols[0] || "").trim();
  return first || null;
}

function resolveMaterial(tray) {
  const trayType = String(tray?.tray_type || "").trim();
  if (trayType && trayType.toLowerCase() !== "empty") return trayType;
  const infoIdx = String(tray?.tray_info_idx || "").trim();
  return infoIdx || null;
}

export function buildAmsTrayRowId(printerId, amsUnit, slotIndex) {
  return `${printerId}:${amsUnit}:${slotIndex}`;
}

export function parseTrayEntry(amsUnit, slotIndex, tray = {}) {
  const empty = isEmptyTray(tray);
  const remainPct = empty ? null : parseRemainPct(tray);
  const trayWeightG = empty ? null : parseTrayWeightG(tray);

  return {
    amsUnit,
    slotIndex,
    material: empty ? null : resolveMaterial(tray),
    color: empty ? null : resolveTrayColor(tray),
    tagUid: empty ? null : String(tray?.tag_uid || "").trim() || null,
    remainPct,
    remainG: empty ? null : parseRemainG(tray, remainPct),
    trayInfoIdx: empty ? null : String(tray?.tray_info_idx || "").trim() || null,
    trayType: empty ? null : String(tray?.tray_type || "").trim() || null,
    trayWeightG,
    empty,
  };
}

/**
 * Extrait l'état de tous les slots AMS d'un rapport MQTT.
 * @returns {Array<{amsUnit, slotIndex, material, color, tagUid, remainPct, remainG, trayInfoIdx, trayType, trayWeightG, empty}>}
 */
export function parseAmsFromMqtt(payload) {
  const print = payload?.print || payload;
  if (!print || typeof print !== "object") return [];

  const trays = [];
  const amsRoot = print.ams;
  if (!amsRoot || typeof amsRoot !== "object") return trays;

  const amsList = Array.isArray(amsRoot.ams) ? amsRoot.ams : [];
  for (const amsEntry of amsList) {
    const amsUnit = n(amsEntry?.id);
    if (amsUnit == null || amsUnit < 0) continue;

    const trayList = Array.isArray(amsEntry?.tray) ? amsEntry.tray : [];
    for (const tray of trayList) {
      const slotIndex = n(tray?.id);
      if (slotIndex == null || slotIndex < 0 || slotIndex > 3) continue;
      trays.push(parseTrayEntry(amsUnit, slotIndex, tray));
    }
  }

  return trays.sort(
    (a, b) => a.amsUnit - b.amsUnit || a.slotIndex - b.slotIndex
  );
}

export function buildAmsSnapshotKey(trays = []) {
  return JSON.stringify(
    trays.map((tray) => ({
      u: tray.amsUnit,
      s: tray.slotIndex,
      m: tray.material,
      c: tray.color,
      t: tray.tagUid,
      p: tray.remainPct,
      g: tray.remainG,
      e: tray.empty,
    }))
  );
}

export function createAmsSyncThrottler(intervalMs = AMS_PUSH_INTERVAL_MS) {
  let lastPushAt = 0;
  let lastSnapshotKey = "";

  return {
    shouldPush(trays) {
      const snapshotKey = buildAmsSnapshotKey(trays);
      const now = Date.now();

      if (snapshotKey !== lastSnapshotKey) {
        lastSnapshotKey = snapshotKey;
        return { push: true, reason: "changed" };
      }

      if (now - lastPushAt >= intervalMs) {
        return { push: true, reason: "interval" };
      }

      return { push: false, reason: "throttled" };
    },
    markPushed() {
      lastPushAt = Date.now();
    },
    reset() {
      lastPushAt = 0;
      lastSnapshotKey = "";
    },
  };
}

function trayToDbRow(printerId, tray) {
  const now = new Date().toISOString();
  return {
    id: buildAmsTrayRowId(printerId, tray.amsUnit, tray.slotIndex),
    printer_id: printerId,
    ams_unit: tray.amsUnit,
    slot_index: tray.slotIndex,
    material: tray.material,
    color: tray.color,
    tag_uid: tray.tagUid,
    remain_pct: tray.remainPct,
    remain_g: tray.remainG,
    tray_info_idx: tray.trayInfoIdx,
    tray_type: tray.trayType,
    tray_weight_g: tray.trayWeightG,
    empty: tray.empty === true,
    updated_at: now,
  };
}

export async function upsertAmsTraysToSupabase(config, trays = [], { log = false } = {}) {
  if (!config?.supabaseUrl || !config?.supabaseServiceKey || !trays.length) {
    return { ok: true, skipped: true, count: 0 };
  }

  assertSupabaseServiceRoleKey(config.supabaseServiceKey);
  const printerId = resolveEffectivePrinterId(config);
  const rows = trays.map((tray) => trayToDbRow(printerId, tray));
  const url = `${String(config.supabaseUrl).replace(/\/$/, "")}/rest/v1/bambu_ams_trays?on_conflict=id`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: config.supabaseServiceKey,
      Authorization: `Bearer ${config.supabaseServiceKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      formatSupabaseRestError(response.status, text, {
        operation: "ams_trays",
        printerId,
      })
    );
  }

  if (log) {
    const filled = trays.filter((tray) => !tray.empty).length;
    console.log(
      `[bambu-bridge] AMS synchronisé (${filled}/${trays.length} slots avec filament).`
    );
  }

  return { ok: true, count: rows.length };
}
