import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDeviceTopics,
  buildMqttClientId,
  buildMqttConnectOptions,
  buildPrinterUpsertPayload,
  describeMqttFailure,
  formatSupabaseRestError,
  looksLikeMacAddress,
  normalizeAccessCode,
  PLACEHOLDER_ACCESS_CODES,
  resolveEffectivePrinterId,
  validateBambuConfig,
  validateSupabaseServiceRoleKey,
  supabaseJwtRole,
} from "./mqttConfig.js";

/** JWT factice (signature non vérifiée) pour tests rôle. */
function fakeJwt(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `hdr.${body}.sig`;
}

describe("validateBambuConfig", () => {
  it("accepte une config LAN complète", () => {
    const result = validateBambuConfig({
      host: "192.168.178.21",
      serial: "31B8BP611200939",
      accessCode: "482917",
    });
    assert.equal(result.valid, true);
    assert.equal(result.normalized.accessCode, "482917");
    assert.equal(result.normalized.serial, "31B8BP611200939");
  });

  it("avertit si printerId est encore le placeholder d'exemple", () => {
    const result = validateBambuConfig({
      host: "192.168.178.21",
      serial: "31B8BP611200939",
      accessCode: "482917",
      printerId: "optionnel-id-crm",
    });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("printerId")));
  });

  it("avertit si le code est le placeholder d'exemple", () => {
    const result = validateBambuConfig({
      host: "192.168.1.10",
      serial: "31B8BP611200939",
      accessCode: "12345678",
    });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("exemple")));
    assert.ok(PLACEHOLDER_ACCESS_CODES.has("12345678"));
  });

  it("rejette une MAC comme numéro de série", () => {
    const result = validateBambuConfig({
      host: "10.0.0.5",
      serial: "00:85:18:44:AA:BB",
      accessCode: "123456",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("MAC")));
  });
});

describe("normalizeAccessCode", () => {
  it("supprime les espaces", () => {
    assert.equal(normalizeAccessCode(" 12 34 56 "), "123456");
  });
});

describe("buildMqttConnectOptions", () => {
  it("aligne les paramètres ha-bambulab (bblp, 8883, TLS permissif)", () => {
    const opts = buildMqttConnectOptions({
      host: "192.168.178.21",
      serial: "31B8BP611200939",
      accessCode: "654321",
    });
    assert.equal(opts.username, "bblp");
    assert.equal(opts.password, "654321");
    assert.equal(opts.port, 8883);
    assert.equal(opts.protocol, "mqtts");
    assert.equal(opts.rejectUnauthorized, false);
    assert.equal(opts.clientId, "bblp_31B8BP611200939");
  });
});

describe("buildDeviceTopics", () => {
  it("construit device/{serial}/report", () => {
    const topics = buildDeviceTopics("31B8BP611200939");
    assert.equal(topics.report, "device/31B8BP611200939/report");
    assert.equal(topics.request, "device/31B8BP611200939/request");
  });
});

describe("looksLikeMacAddress", () => {
  it("détecte les formats MAC courants", () => {
    assert.equal(looksLikeMacAddress("00:85:18:44:AA:BB"), true);
    assert.equal(looksLikeMacAddress("31B8BP611200939"), false);
  });
});

describe("describeMqttFailure", () => {
  it("explique Not authorized en français", () => {
    const failure = describeMqttFailure(new Error("Connection refused: Not authorized"), {
      host: "192.168.178.21",
      serial: "31B8BP611200939",
      accessCode: "12345678",
    });
    assert.equal(failure.key, "auth");
    assert.ok(failure.lines.some((l) => l.includes("développeur")));
    assert.ok(failure.lines.some((l) => l.includes("accessCode")));
  });
});

describe("buildMqttClientId", () => {
  it("préfixe bblp_ avec le numéro de série", () => {
    assert.equal(buildMqttClientId("ABC123"), "bblp_ABC123");
  });
});

describe("validateSupabaseServiceRoleKey", () => {
  it("accepte un JWT service_role", () => {
    const key = fakeJwt({ role: "service_role" });
    assert.equal(validateSupabaseServiceRoleKey(key).ok, true);
    assert.equal(supabaseJwtRole(key), "service_role");
  });

  it("accepte une Secret key sb_secret_ (trim)", () => {
    const key = "  sb_secret_abc123def456  ";
    assert.equal(validateSupabaseServiceRoleKey(key).ok, true);
  });

  it("valide la config avec une Secret key sb_secret_", () => {
    const result = validateBambuConfig({
      host: "192.168.1.10",
      serial: "31B8BP611200939",
      accessCode: "482917",
      supabaseUrl: "https://xxx.supabase.co",
      supabaseServiceKey: "sb_secret_test_key_for_bridge",
    });
    assert.equal(result.valid, true);
  });

  it("rejette un JWT anon", () => {
    const key = fakeJwt({ role: "anon" });
    const result = validateSupabaseServiceRoleKey(key);
    assert.equal(result.ok, false);
    assert.ok(result.message.includes("anon"));
  });

  it("invalide la config si la clé Supabase est anon", () => {
    const result = validateBambuConfig({
      host: "192.168.1.10",
      serial: "31B8BP611200939",
      accessCode: "482917",
      supabaseUrl: "https://xxx.supabase.co",
      supabaseServiceKey: fakeJwt({ role: "anon" }),
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("anon")));
  });
});

describe("resolveEffectivePrinterId", () => {
  it("utilise le serial si printerId est un placeholder d'exemple", () => {
    assert.equal(
      resolveEffectivePrinterId({
        serial: "31B8BP611200939",
        printerId: "optionnel-id-crm",
      }),
      "31B8BP611200939"
    );
  });

  it("conserve un printerId explicite valide", () => {
    assert.equal(
      resolveEffectivePrinterId({
        serial: "31B8BP611200939",
        printerId: "h2c-atelier",
      }),
      "h2c-atelier"
    );
  });

  it("utilise le serial si printerId est vide", () => {
    assert.equal(
      resolveEffectivePrinterId({ serial: "31B8BP611200939", printerId: "" }),
      "31B8BP611200939"
    );
  });
});

describe("buildPrinterUpsertPayload", () => {
  it("aligne id et serial quand printerId est omis", () => {
    const row = buildPrinterUpsertPayload({
      host: "192.168.178.21",
      serial: "31B8BP611200939",
      model: "H2C",
    });
    assert.equal(row.id, "31B8BP611200939");
    assert.equal(row.serial, "31B8BP611200939");
    assert.equal(row.host, "192.168.178.21");
    assert.equal(row.model, "H2C");
    assert.ok(row.name.includes("H2C"));
  });
});

describe("formatSupabaseRestError", () => {
  it("explique la clé étrangère imprimante en français", () => {
    const message = formatSupabaseRestError(
      409,
      'Key (printer_id)=(optionnel-id-crm) is not present in table "bambu_printers"',
      { printerId: "optionnel-id-crm" }
    );
    assert.ok(message.includes("409"));
    assert.ok(message.includes("bambu_printers"));
    assert.ok(message.includes("Bambu Lab"));
    assert.ok(message.includes("optionnel-id-crm"));
  });
});
