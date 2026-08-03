import { afterEach, describe, expect, it } from "vitest";
import express from "express";
import { createIntegrationRouter } from "./router";
import { createSignature } from "./security";

const SECRET = "test-secret-with-at-least-thirty-two-characters";
const KEY_ID = "site-test";
let server;

function fakeContext() {
  const nonces = new Set();
  const events = new Map();
  const repository = {
    async reserveNonce({ keyId, nonce }) {
      const key = `${keyId}:${nonce}`;
      if (nonces.has(key)) return false;
      nonces.add(key);
      return true;
    },
    async logCall() {},
  };
  const version = {
    version: "1.0.5",
    build: "test",
    commit: "abc123",
    date: "2026-08-04T00:00:00.000Z",
    environment: "test",
  };
  const service = {
    async health() {
      return {
        application: "healthy",
        database: "healthy",
        repositories: "healthy",
        services: "healthy",
        atelier: "healthy",
        production: "healthy",
      };
    },
    version: () => version,
    async status() {
      return {
        healthy: true,
        uptime: 10,
        events: events.size,
        pending: 0,
        deadLetters: 0,
        retry: 0,
        production: "healthy",
        atelier: "healthy",
        version: version.version,
      };
    },
    async event(event) {
      if (event.payload.fail) throw new Error("CRM_TRANSACTION_ROLLBACK");
      if (events.has(event.id)) return { accepted: true, duplicate: true };
      events.set(event.id, event);
      return { accepted: true, duplicate: false, eventId: event.id };
    },
    async ack(ack) {
      if (!events.has(ack.eventId)) {
        throw Object.assign(new Error("CRM_ACK_EVENT_NOT_FOUND"), {
          status: 404,
        });
      }
      return { acknowledged: true, eventId: ack.eventId };
    },
  };
  return { repository, service };
}

async function startApi() {
  const app = express();
  app.use(
    express.json({
      verify(req, _res, buffer) {
        req.rawBody = buffer.toString("utf8");
      },
    }),
  );
  const context = fakeContext();
  app.use(
    "/api/integration/v1",
    createIntegrationRouter({
      ...context,
      keys: { [KEY_ID]: SECRET },
      ttlMs: 300_000,
    }),
  );
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${server.address().port}/api/integration/v1`;
}

function signedOptions(method, body, overrides = {}) {
  const rawBody = body ? JSON.stringify(body) : "";
  const timestamp = String(overrides.timestamp || Date.now());
  const nonce = overrides.nonce || crypto.randomUUID().replaceAll("-", "");
  const signature =
    overrides.signature || createSignature(SECRET, timestamp, nonce, rawBody);
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-CRM-Key-Id": KEY_ID,
      "X-CRM-Timestamp": timestamp,
      "X-CRM-Nonce": nonce,
      "X-CRM-Signature": signature,
    },
    ...(body ? { body: rawBody } : {}),
  };
}

afterEach(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
});

describe("API CRM integration v1", () => {
  it.each(["health", "version", "status"])(
    "répond à GET /%s",
    async (route) => {
      const baseUrl = await startApi();
      const response = await fetch(
        `${baseUrl}/${route}`,
        signedOptions("GET", null),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toBeTruthy();
    },
  );

  it("accepte une signature HMAC valide", async () => {
    const baseUrl = await startApi();
    const response = await fetch(
      `${baseUrl}/health`,
      signedOptions("GET", null),
    );
    expect(response.status).toBe(200);
  });

  it("refuse une signature HMAC invalide", async () => {
    const baseUrl = await startApi();
    const response = await fetch(
      `${baseUrl}/health`,
      signedOptions("GET", null, { signature: "0".repeat(64) }),
    );
    expect(response.status).toBe(401);
  });

  it("refuse un nonce réutilisé", async () => {
    const baseUrl = await startApi();
    const nonce = "nonceunique1234567890";
    const first = await fetch(
      `${baseUrl}/health`,
      signedOptions("GET", null, { nonce }),
    );
    const second = await fetch(
      `${baseUrl}/health`,
      signedOptions("GET", null, { nonce }),
    );
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });

  it("refuse un timestamp expiré", async () => {
    const baseUrl = await startApi();
    const response = await fetch(
      `${baseUrl}/health`,
      signedOptions("GET", null, { timestamp: Date.now() - 600_000 }),
    );
    expect(response.status).toBe(401);
  });

  it("traite un événement valide sans dupliquer son identifiant", async () => {
    const baseUrl = await startApi();
    const event = {
      version: "1.0",
      id: "event-1",
      type: "customer.created",
      occurredAt: new Date().toISOString(),
      payload: { id: "customer-1", name: "Client" },
    };
    const first = await fetch(
      `${baseUrl}/events`,
      signedOptions("POST", event),
    );
    const second = await fetch(
      `${baseUrl}/events`,
      signedOptions("POST", event),
    );
    expect(first.status).toBe(202);
    expect((await second.json()).duplicate).toBe(true);
  });

  it("retourne une erreur explicite et conserve le rollback applicatif", async () => {
    const baseUrl = await startApi();
    const event = {
      version: "1.0",
      id: "event-failed",
      type: "order.created",
      occurredAt: new Date().toISOString(),
      payload: { fail: true },
    };
    const response = await fetch(
      `${baseUrl}/events`,
      signedOptions("POST", event),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("CRM_TRANSACTION_ROLLBACK");
  });
});
