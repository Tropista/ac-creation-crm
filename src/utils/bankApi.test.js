import { afterEach, describe, expect, it, vi } from "vitest";
import { getBankApiUrl } from "./bankApi.js";

describe("getBankApiUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete global.window;
  });

  it("uses VITE_BANK_API_URL in browser dev mode", () => {
    vi.stubEnv("VITE_BANK_API_URL", "http://localhost:4000");
    global.window = {};
    expect(getBankApiUrl()).toBe("http://localhost:4000");
  });

  it("falls back to localhost default when env is unset", () => {
    global.window = {};
    expect(getBankApiUrl()).toBe("http://127.0.0.1:3001");
  });

  it("prefers Electron preload URL when available", () => {
    global.window = {
      electronAPI: {
        isElectron: true,
        getBankApiUrl: () => "http://127.0.0.1:3001",
      },
    };
    vi.stubEnv("VITE_BANK_API_URL", "http://localhost:4000");
    expect(getBankApiUrl()).toBe("http://127.0.0.1:3001");
  });
});
