/**
 * Configuration et options MQTT LAN Bambu Lab (aligné ha-bambulab / pybambu).
 */

export const BAMBU_MQTT_PORT = 8883;
export const BAMBU_MQTT_USERNAME = "bblp";

/** Valeurs laissées dans config.example.json — connexion refusée si non modifiées. */
export const PLACEHOLDER_ACCESS_CODES = new Set([
  "12345678",
  "123456",
  "000000",
  "00000000",
  "111111",
  "11111111",
  "xxxxxxxx",
  "VOTRE_CODE",
]);

/**
 * Décode le payload JWT (sans vérifier la signature) pour lire le claim `role`.
 * @param {string} token
 * @returns {Record<string, unknown> | null}
 */
export function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    return JSON.parse(Buffer.from(b64 + pad, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

/** @param {string} token */
export function supabaseJwtRole(token) {
  const payload = decodeJwtPayload(token);
  const role = payload?.role;
  return role != null ? String(role) : null;
}

/** Préfixe des Secret keys Supabase (backend, privilèges service). */
export const SUPABASE_SECRET_KEY_PREFIX = "sb_secret_";

/**
 * Vérifie que la clé Supabase du pont est privilégiée (service_role JWT ou sb_secret_).
 * @param {string} key
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateSupabaseServiceRoleKey(key) {
  const trimmed = String(key || "").trim();
  if (!trimmed) {
    return { ok: false, message: "supabaseServiceKey est vide." };
  }

  if (trimmed.startsWith(SUPABASE_SECRET_KEY_PREFIX)) {
    return { ok: true };
  }

  const role = supabaseJwtRole(trimmed);
  if (role === "service_role") {
    return { ok: true };
  }
  if (role === "anon") {
    return {
      ok: false,
      message:
        "La clé Supabase configurée est la clé « anon » (Settings → API). Le pont atelier doit utiliser la clé « service_role » (secret) — jamais la clé publique du CRM navigateur.",
    };
  }
  if (role) {
    return {
      ok: false,
      message: `Clé Supabase : rôle JWT « ${role} » — utilisez uniquement la clé service_role ou une Secret key (sb_secret_).`,
    };
  }
  return {
    ok: false,
    message:
      "Clé Supabase illisible — copiez la clé service_role (JWT) ou la Secret key (sb_secret_…) depuis Project Settings → API.",
  };
}

/** @param {string} key */
export function assertSupabaseServiceRoleKey(key) {
  const result = validateSupabaseServiceRoleKey(key);
  if (!result.ok) {
    throw new Error(result.message);
  }
}

export const PLACEHOLDER_SERIALS = new Set([
  "VOTRE_NUMERO_SERIE",
  "XXXXXXXXXXXXXXX",
  "000000000000000",
]);

/** Valeurs d'exemple dans config.example.json — le pont utilise alors le numéro de série. */
export const PLACEHOLDER_PRINTER_IDS = new Set([
  "optionnel-id-crm",
  "votre-id-crm",
  "printer-id",
  "id-crm",
]);

/** Aligné sur bambuBridgeService (mention stockage code LAN côté CRM). */
export const BAMBU_PRINTER_ACCESS_NOTE = "stocké localement (CRM)";

export function normalizeAccessCode(raw) {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, "");
}

export function normalizeSerial(raw) {
  return String(raw || "").trim();
}

export function normalizeHost(raw) {
  return String(raw || "").trim();
}

/** Adresse MAC (00:11:22:33:44:55) — topic Bambu utilise le numéro de série, pas la MAC. */
export function looksLikeMacAddress(serial) {
  const compact = String(serial || "").replace(/[^0-9a-fA-F]/g, "");
  if (compact.length !== 12) return false;
  return /[:.-]/.test(serial) || /^[0-9a-f]{2}([:-]?[0-9a-f]{2}){5}$/i.test(serial);
}

export function buildDeviceTopics(serial) {
  const id = normalizeSerial(serial);
  return {
    report: `device/${id}/report`,
    request: `device/${id}/request`,
  };
}

export function buildMqttClientId(serial) {
  const id = normalizeSerial(serial);
  const safe = id.replace(/[^0-9A-Za-z_-]/g, "_").slice(0, 48) || "printer";
  return `bblp_${safe}`;
}

/**
 * @param {Record<string, unknown>} config
 * @returns {{
 *   valid: boolean,
 *   errors: string[],
 *   warnings: string[],
 *   normalized: { host: string, serial: string, accessCode: string }
 * }}
 */
export function validateBambuConfig(config = {}) {
  const errors = [];
  const warnings = [];

  const host = normalizeHost(config.host);
  const serial = normalizeSerial(config.serial);
  const accessCode = normalizeAccessCode(config.accessCode);

  if (!host) {
    errors.push("Champ « host » manquant : IP LAN de l'imprimante (ex. 192.168.178.21).");
  }

  if (!serial) {
    errors.push("Champ « serial » manquant : numéro de série sur l'écran ou dans Bambu Studio.");
  } else if (PLACEHOLDER_SERIALS.has(serial.toUpperCase()) || PLACEHOLDER_SERIALS.has(serial)) {
    warnings.push(
      "Le numéro de série est encore un placeholder : remplacez « serial » par celui de votre imprimante (ex. 31B8BP611200939)."
    );
  } else if (looksLikeMacAddress(serial)) {
    errors.push(
      "Le champ « serial » ressemble à une adresse MAC. Utilisez le numéro de série imprimante (15 caractères), pas la MAC Wi‑Fi."
    );
  } else if (serial.length < 10 || serial.length > 20) {
    warnings.push(
      `Numéro de série inhabituel (${serial.length} caractères). Vérifiez qu'il correspond exactement à l'imprimante.`
    );
  }

  if (!accessCode) {
    errors.push(
      "Champ « accessCode » manquant : code d'accès LAN (souvent 6 ou 8 chiffres), affiché quand le mode LAN / développeur est actif."
    );
  } else if (PLACEHOLDER_ACCESS_CODES.has(accessCode)) {
    warnings.push(
      "Le code d'accès est encore la valeur d'exemple (config.example.json). Remplacez « accessCode » par le code affiché sur l'imprimante ou dans Bambu Studio."
    );
  } else if (!/^\d{6,8}$/.test(accessCode)) {
    warnings.push(
      `Le code LAN contient ${accessCode.length} caractère(s) non numériques ou une longueur inhabituelle. En général : 6 chiffres (anciens modèles) ou 8 chiffres (firmware récent / H2C).`
    );
  }

  if (!config.supabaseUrl && !config.supabaseServiceKey) {
    warnings.push(
      "Supabase non configuré : les jobs terminés seront affichés en JSON console uniquement (ajoutez supabaseUrl + supabaseServiceKey pour le CRM cloud)."
    );
  } else if (config.supabaseUrl && config.supabaseServiceKey) {
    const keyCheck = validateSupabaseServiceRoleKey(config.supabaseServiceKey);
    if (!keyCheck.ok) {
      errors.push(keyCheck.message);
    }
  } else if (config.supabaseUrl && !config.supabaseServiceKey) {
    errors.push(
      "supabaseUrl est défini mais supabaseServiceKey manque : ajoutez la clé service_role (JWT) ou Secret key sb_secret_ (Project Settings → API), pas la clé anon."
    );
  } else if (!config.supabaseUrl && config.supabaseServiceKey) {
    errors.push("supabaseServiceKey est défini mais supabaseUrl manque.");
  }

  const printerId = String(config.printerId || "").trim();
  if (printerId && PLACEHOLDER_PRINTER_IDS.has(printerId.toLowerCase())) {
    warnings.push(
      `« printerId » est encore la valeur d'exemple (« ${printerId} ») : omettez le champ ou recopiez l'id de l'imprimante dans le CRM (Bambu Lab). Sinon le pont utilisera le numéro de série (${serial || "serial"}).`
    );
  } else if (
    printerId &&
    serial &&
    printerId !== serial &&
    config.supabaseUrl &&
    config.supabaseServiceKey
  ) {
    warnings.push(
      `« printerId » (${printerId}) diffère du « serial » : l'id doit être identique à celui de l'imprimante enregistrée dans le CRM, ou laissez printerId vide pour utiliser la série.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    normalized: { host, serial, accessCode },
  };
}

/**
 * Options mqtt.js pour TLS LAN (port 8883, certificat auto-signé).
 * @param {{ host: string, serial: string, accessCode: string }} normalized
 */
export function buildMqttConnectOptions(normalized) {
  const host = normalizeHost(normalized.host);
  const serial = normalizeSerial(normalized.serial);
  const accessCode = normalizeAccessCode(normalized.accessCode);

  return {
    host,
    port: BAMBU_MQTT_PORT,
    protocol: "mqtts",
    username: BAMBU_MQTT_USERNAME,
    password: accessCode,
    clientId: buildMqttClientId(serial),
    rejectUnauthorized: false,
    reconnectPeriod: 5000,
    keepalive: 60,
    connectTimeout: 30_000,
    clean: true,
  };
}

/**
 * Message d'aide en français selon l'erreur MQTT / réseau.
 * @param {Error & { code?: number | string }} [error]
 * @param {{ serial?: string, host?: string, accessCode?: string }} [ctx]
 */
export function describeMqttFailure(error, ctx = {}) {
  const message = String(error?.message || error || "").toLowerCase();
  const code = error?.code;

  if (
    message.includes("not authorized") ||
    message.includes("not authorised") ||
    code === 5 ||
    code === "5" ||
    message.includes("connack 5")
  ) {
    return {
      key: "auth",
      title: "Connexion MQTT refusée — non autorisé",
      lines: [
        "Le broker a rejeté l'authentification (utilisateur bblp + code LAN). Causes fréquentes :",
        "• Code d'accès incorrect : recopiez le code affiché sur l'écran imprimante (Paramètres → WLAN / réseau) ou dans Bambu Studio (imprimante → icône engrenage → Access Code / Code d'accès LAN).",
        "• Mode développeur désactivé : sur firmware récent, activez Mode LAN seul puis Mode développeur, acceptez l'avertissement, puis redémarrez l'imprimante.",
        "• Code régénéré : couper/réactiver le mode LAN ou développeur génère un nouveau code — mettez à jour config.json.",
        `• Vérifiez « accessCode » (${maskSecret(ctx.accessCode)}) et « serial » (${ctx.serial || "?"}) — le topic doit être device/${ctx.serial || "SERIE"}/report (pas l'adresse MAC).`,
        `• Hôte « host » : ${ctx.host || "?"} — le ping doit réussir sur ce réseau.`,
      ],
    };
  }

  if (message.includes("certificate") || message.includes("self signed")) {
    return {
      key: "tls",
      title: "Erreur certificat TLS",
      lines: [
        "L'imprimante utilise un certificat auto-signé : rejectUnauthorized doit rester à false (déjà le cas dans ce pont).",
        "Si l'erreur persiste, vérifiez l'IP et le port 8883.",
      ],
    };
  }

  if (message.includes("econnrefused") || code === "ECONNREFUSED") {
    return {
      key: "refused",
      title: "Connexion refusée (réseau)",
      lines: [
        "Aucun service MQTT sur cette IP/port. Vérifiez l'IP LAN, que l'imprimante est allumée, et le mode LAN + développeur.",
        "Port attendu : 8883 (MQTTS).",
      ],
    };
  }

  if (message.includes("etimedout") || message.includes("timeout") || code === "ETIMEDOUT") {
    return {
      key: "timeout",
      title: "Délai de connexion dépassé",
      lines: [
        "L'imprimante ne répond pas à temps. Vérifiez Wi‑Fi/Ethernet, pare-feu Windows, et que PC et imprimante sont sur le même sous-réseau.",
      ],
    };
  }

  return {
    key: "generic",
    title: "Erreur MQTT",
    lines: [String(error?.message || error || "Erreur inconnue")],
  };
}

export function maskSecret(value) {
  const s = String(value || "");
  if (!s) return "(vide)";
  if (s.length <= 2) return "••";
  return `${"•".repeat(Math.min(s.length - 2, 6))}${s.slice(-2)}`;
}

export function formatFailureForConsole(failure) {
  return [`[bambu-bridge] ${failure.title}`, ...failure.lines.map((line) => `  → ${line}`)].join(
    "\n"
  );
}

/**
 * Id utilisé pour printer_id (jobs) et bambu_printers.id — évite les placeholders d'exemple.
 * @param {Record<string, unknown>} config
 */
export function resolveEffectivePrinterId(config = {}) {
  const serial = normalizeSerial(config.serial);
  const raw = String(config.printerId || "").trim();
  if (!raw) return serial;
  if (PLACEHOLDER_PRINTER_IDS.has(raw.toLowerCase())) return serial;
  return raw;
}

/**
 * Ligne bambu_printers pour enregistrement automatique par le pont (insert si absent).
 * @param {Record<string, unknown>} config
 */
export function buildPrinterUpsertPayload(config = {}) {
  const serial = normalizeSerial(config.serial);
  const id = resolveEffectivePrinterId(config);
  const host = normalizeHost(config.host);
  const model = String(config.model || "").trim() || null;
  const explicitName = String(config.printerName || config.name || "").trim();
  const name =
    explicitName || (model ? `Bambu ${model}` : `Bambu ${serial.slice(-6) || "atelier"}`);

  return {
    id,
    name,
    host,
    serial,
    access_code_encrypted: BAMBU_PRINTER_ACCESS_NOTE,
    model,
    enabled: true,
    created_at: new Date().toISOString(),
  };
}

/**
 * Message d'erreur Supabase REST en français (clé étrangère imprimante, etc.).
 * @param {number} status
 * @param {string} body
 * @param {{ operation?: string, printerId?: string }} [ctx]
 */
export function formatSupabaseRestError(status, body, ctx = {}) {
  const text = String(body || "").trim();
  const printerId = String(ctx.printerId || "").trim();
  const fkPrinter =
    status === 409 &&
    (text.includes("bambu_print_jobs_printer_id_fkey") ||
      (text.includes("bambu_printers") && text.includes("is not present")));

  if (fkPrinter) {
    const lines = [
      `Supabase REST ${status} — imprimante introuvable (clé étrangère).`,
      printerId
        ? `L'id « ${printerId} » n'existe pas dans la table bambu_printers.`
        : "L'imprimante référencée par le job n'existe pas dans bambu_printers.",
      "",
      "Que faire :",
      "  1. CRM : Impression 3D Pro → onglet Bambu Lab → ajoutez l'imprimante avec le même id que « printerId » dans config.json, puis synchronisez le cloud.",
      "  2. Pont : dans config.json, supprimez « printerId » ou mettez la même valeur que « serial », puis redémarrez (npm start). Le pont peut aussi créer l'imprimante en base au démarrage.",
      "  3. Vérifiez que supabaseUrl et supabaseServiceKey (service_role ou sb_secret_) sont corrects.",
    ];
    if (text) lines.push("", `Détail technique : ${text}`);
    return lines.join("\n");
  }

  return `Supabase REST ${status}: ${text || "(réponse vide)"}`;
}
