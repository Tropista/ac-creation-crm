import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CATALOG_SERVER_UNAVAILABLE_MESSAGE,
  getCatalogApiUrl,
  parseCatalogJsonResponse,
  probeCatalogApi,
  refreshCatalogColors,
} from "./catalogApi.js";

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(payload),
  };
}

describe("getCatalogApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete global.window;
  });

  it("uses VITE_CATALOG_API_URL in browser dev mode", () => {
    vi.stubEnv("VITE_CATALOG_API_URL", "http://localhost:4000");
    global.window = {};
    expect(getCatalogApiUrl()).toBe("http://localhost:4000");
  });

  it("falls back to VITE_BANK_API_URL then default", () => {
    vi.stubEnv("VITE_BANK_API_URL", "http://127.0.0.1:3001");
    global.window = {};
    expect(getCatalogApiUrl()).toBe("http://127.0.0.1:3001");
  });
});

describe("probeCatalogApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.window;
  });

  it("returns ok when catalog health responds", async () => {
    global.window = {};
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url.endsWith("/api/catalog/health")) {
        return jsonResponse({
          ok: true,
          provider: "lamaisonduteeshirt",
          parserVersion: 4,
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    await expect(probeCatalogApi()).resolves.toEqual({
      status: "ok",
      url: "http://127.0.0.1:3001",
      provider: "lamaisonduteeshirt",
      parserVersion: 4,
    });
  });

  it("detects outdated parser when health lacks version", async () => {
    global.window = {};
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url.endsWith("/api/catalog/health")) {
        return jsonResponse({ ok: true, provider: "lamaisonduteeshirt" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const probe = await probeCatalogApi();
    expect(probe.status).toBe("outdated");
    expect(probe.message).toMatch(/parseur catalogue est obsolète/i);
  });

  it("detects outdated server when bank works but catalog is missing", async () => {
    global.window = {};
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url.endsWith("/api/catalog/health")) {
        return jsonResponse(null, { ok: false, status: 404 });
      }
      if (url.endsWith("/api/bank/status")) {
        return jsonResponse({ ok: true });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    const probe = await probeCatalogApi();
    expect(probe.status).toBe("outdated");
    expect(probe.message).toMatch(/version obsolète/i);
  });

  it("returns unreachable when fetch fails", async () => {
    global.window = {};
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));

    const probe = await probeCatalogApi();
    expect(probe.status).toBe("unreachable");
    expect(probe.message).toMatch(/bank:win/i);
  });

  it("detects HTML responses from SPA fallback", async () => {
    global.window = {};
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => "text/html; charset=utf-8" },
      text: async () => "<!DOCTYPE html><html><body>SPA</body></html>",
    })));

    const probe = await probeCatalogApi();
    expect(probe.status).toBe("unreachable");
    expect(probe.message).toBe(CATALOG_SERVER_UNAVAILABLE_MESSAGE);
  });
});

describe("parseCatalogJsonResponse", () => {
  it("throws a French message when the body is HTML", async () => {
    await expect(
      parseCatalogJsonResponse({
        headers: { get: () => "text/html" },
        text: async () => "<!DOCTYPE html><html></html>",
      })
    ).rejects.toThrow(CATALOG_SERVER_UNAVAILABLE_MESSAGE);
  });
});

describe("refreshCatalogColors", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete global.window;
  });

  it("batches large refresh requests", async () => {
    global.window = {};
    const calls = [];
    vi.stubGlobal("fetch", vi.fn(async (url, options) => {
      calls.push(JSON.parse(options.body).sourceUrls.length);
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        text: async () => JSON.stringify({ results: [] }),
      };
    }));

    const urls = Array.from({ length: 120 }, (_, index) => `https://example.com/p-${index}`);
    await refreshCatalogColors(urls);

    expect(calls).toEqual([50, 50, 20]);
  });
});
