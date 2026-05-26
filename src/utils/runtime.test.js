import { describe, expect, it, vi, afterEach } from "vitest";
import {
  isElectronApp,
  shouldRegisterServiceWorker,
  unregisterServiceWorkers,
} from "./runtime.js";

describe("runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete globalThis.__APP_VERSION__;
  });

  it("detects Electron via preload flag", () => {
    vi.stubGlobal("window", {
      electronAPI: { isElectron: true },
      location: { protocol: "file:" },
    });
    expect(isElectronApp()).toBe(true);
  });

  it("detects packaged file:// without preload", () => {
    vi.stubGlobal("window", {
      location: { protocol: "file:" },
    });
    expect(isElectronApp()).toBe(true);
  });

  it("skips service worker on Electron", () => {
    vi.stubGlobal("window", {
      electronAPI: { isElectron: true },
      location: { protocol: "file:" },
    });
    expect(shouldRegisterServiceWorker()).toBe(false);
  });

  it("unregisters existing service workers", async () => {
    const unregister = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([{ unregister }]),
      },
    });

    await unregisterServiceWorkers();
    expect(unregister).toHaveBeenCalledTimes(1);
  });
});
