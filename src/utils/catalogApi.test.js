import { afterEach, describe, expect, it, vi } from "vitest";
import { getCatalogApiUrl, probeCatalogApi } from "./catalogApi.js";

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
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, provider: "lamaisonduteeshirt" }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }));

    await expect(probeCatalogApi()).resolves.toEqual({
      status: "ok",
      url: "http://127.0.0.1:3001",
      provider: "lamaisonduteeshirt",
    });
  });

  it("detects outdated server when bank works but catalog is missing", async () => {
    global.window = {};
    vi.stubGlobal("fetch", vi.fn(async (url) => {
      if (url.endsWith("/api/catalog/health")) {
        return { ok: false, status: 404, json: async () => null };
      }
      if (url.endsWith("/api/bank/status")) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
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
    expect(probe.message).toMatch(/npm run bank/i);
  });
});
