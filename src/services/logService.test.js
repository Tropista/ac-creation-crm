import { describe, expect, it, vi } from "vitest";
import { emptyData, flushSaveData, saveData, STORAGE_KEY } from "./dataService.js";
import { logActivity } from "./logService.js";

function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("logActivity", () => {
  it("n'écrase pas les clients quand localStorage est en retard sur l'état mémoire", async () => {
    vi.stubGlobal("localStorage", createStorage());
    saveData(emptyData);
    flushSaveData();

    let memory = emptyData;
    const setData = vi.fn(async (next) => {
      memory = typeof next === "function" ? next(memory) : next;
    });

    await setData({
      ...memory,
      clients: [{ id: "c1", name: "Client test" }],
    });

    await logActivity({
      action: "Modification client",
      target: "Client test",
      details: "Mise à jour",
      setData,
    });

    expect(memory.clients).toHaveLength(1);
    expect(memory.clients[0].name).toBe("Client test");
    expect(memory.logs).toHaveLength(1);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    expect(stored.clients || []).toHaveLength(0);

    vi.unstubAllGlobals();
  });
});
