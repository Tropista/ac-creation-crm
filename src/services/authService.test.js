import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_EMAILS,
  SESSION_KEY,
  SESSION_EXPIRED_MESSAGE,
  clearSession,
  isAdminEmail,
  loadSession,
  saveSession,
  touchSession,
} from "./authService.js";

function mockLocalStorage() {
  const store = new Map();
  vi.stubGlobal("localStorage", {
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
  });
  return store;
}

describe("authService — ADMIN_EMAILS", () => {
  it("reconnaît les deux emails administrateurs", () => {
    for (const email of ADMIN_EMAILS) {
      expect(isAdminEmail(email)).toBe(true);
    }
    expect(isAdminEmail("autre@example.com")).toBe(false);
  });
});

describe("authService — session", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockLocalStorage();
  });

  it("enregistre et recharge une session valide", () => {
    const session = saveSession({
      id: "u1",
      name: "Test",
      email: "test@example.com",
      role: "Admin",
    });

    expect(session.expiresAt).toBeGreaterThan(Date.now());
    expect(loadSession()?.email).toBe("test@example.com");
  });

  it("signale une session expirée et la supprime", () => {
    localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({
        id: "u1",
        email: "test@example.com",
        name: "Test",
        role: "Admin",
        expiresAt: Date.now() - 1000,
        lastActivityAt: Date.now() - 2000,
      })
    );

    expect(loadSession()).toEqual({ expired: true });
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it("prolonge la session lors d'une activité", () => {
    saveSession({
      id: "u1",
      name: "Test",
      email: "test@example.com",
      role: "Admin",
    });

    const before = JSON.parse(localStorage.getItem(SESSION_KEY)).expiresAt;
    vi.useFakeTimers();
    vi.advanceTimersByTime(60_000);

    const refreshed = touchSession();
    const after = refreshed.expiresAt;

    vi.useRealTimers();
    expect(after).toBeGreaterThanOrEqual(before);
  });

  it("expose un message d'expiration en français", () => {
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/session a expiré/i);
  });

  it("clearSession supprime la clé", () => {
    saveSession({
      id: "u1",
      name: "Test",
      email: "test@example.com",
      role: "Admin",
    });
    clearSession();
    expect(localStorage.getItem(SESSION_KEY)).toBeNull();
  });
});
