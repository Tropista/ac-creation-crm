import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const envPath = path.resolve(".env");
if (fs.existsSync(envPath)) dotenv.config({ path: envPath });

const baseUrl =
  process.env.CRM_INTEGRATION_API_URL ||
  "http://127.0.0.1:3001/api/integration/v1";
const keyId = process.env.CRM_HMAC_KEY_ID || "site";
const secret = process.env.CRM_HMAC_SECRET || "";

if (Buffer.byteLength(secret, "utf8") < 32) {
  throw new Error("CRM_HMAC_SECRET_MISSING_OR_TOO_SHORT");
}

function signature(timestamp, nonce, rawBody) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest("hex");
}

function signedOptions(method, body, overrides = {}) {
  const rawBody = body === undefined ? "" : JSON.stringify(body);
  const timestamp = String(overrides.timestamp || Date.now());
  const nonce = overrides.nonce || crypto.randomUUID().replaceAll("-", "");
  return {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      "X-CRM-Key-Id": keyId,
      "X-CRM-Timestamp": timestamp,
      "X-CRM-Nonce": nonce,
      "X-CRM-Signature":
        overrides.signature || signature(timestamp, nonce, rawBody),
    },
    ...(body === undefined ? {} : { body: rawBody }),
  };
}

async function request(route, options, expectedStatus) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${route}`, options);
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  const expected = Array.isArray(expectedStatus)
    ? expectedStatus
    : [expectedStatus];
  if (
    !expected.includes(response.status) ||
    !contentType.includes("application/json")
  ) {
    throw new Error(
      `CRM_HTTP_ASSERTION_FAILED:${route}:${response.status}:${contentType}:${JSON.stringify(payload)}`,
    );
  }
  return {
    route,
    status: response.status,
    durationMs: Date.now() - startedAt,
    payload,
  };
}

const event = {
  version: "1.0",
  id: "crm-runtime-diagnostic-customer-v1",
  type: "customer.updated",
  occurredAt: "2026-08-04T00:00:00.000Z",
  correlationId: "crm-runtime-diagnostic",
  idempotencyKey: "crm-runtime-diagnostic-customer-v1",
  payload: {
    id: "crm-runtime-diagnostic-customer",
    name: "Diagnostic API CRM",
    email: "diagnostic@example.invalid",
  },
};

const results = [];
for (const route of ["/health", "/version", "/status"]) {
  results.push(await request(route, signedOptions("GET"), 200));
}
results.push(
  await request(
    "/events",
    signedOptions("POST", event, { signature: "0".repeat(64) }),
    401,
  ),
);
results.push(
  await request(
    "/events",
    signedOptions("POST", event, { timestamp: Date.now() - 600_000 }),
    401,
  ),
);
const replayNonce = "runtimevalidationnonce0001";
results.push(
  await request(
    "/events",
    signedOptions("POST", event, { nonce: replayNonce }),
    [200, 202],
  ),
);
results.push(
  await request(
    "/events",
    signedOptions("POST", event, { nonce: replayNonce }),
    409,
  ),
);
results.push(await request("/events", signedOptions("POST", event), 200));
results.push(
  await request(
    "/ack",
    signedOptions("POST", {
      version: "1.0",
      eventId: event.id,
      receivedAt: new Date().toISOString(),
      metadata: { source: "runtime-test" },
    }),
    200,
  ),
);

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      checks: results.map(({ route, status, durationMs }) => ({
        route,
        status,
        durationMs,
      })),
    },
    null,
    2,
  ),
);
