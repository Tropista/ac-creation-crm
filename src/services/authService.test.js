import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_KEY,
  SESSION_EXPIRED_MESSAGE,
  clearSession,
  findUserByEmail,
  isAdminUser,
  isAllowedUser,
  loadSession,
  saveSession,
  touchSession,
  userRole,
} from "./authService.js";

const sampleUsers = [
  {
    id: "u-admin",
    email: "admin@example.com",
    name: "Admin",
    role: "Admin",
    status: "Actif",
  },
  {
    id: "u-emp",
    email: "employe@example.com",
    name: "Employé",
    role: "Employé",
    status: "Actif",
  },
  {
    id: "u-off",
    email: "disabled@example.com",
    name: "Désactivé",
    role: "Employé",
    status: "Désactivé",
  },
];

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

describe("authService — rôles depuis users", () => {
  it("reconnaît un admin via la table users", () => {
    expect(isAdminUser("admin@example.com", sampleUsers)).toBe(true);
    expect(isAdminUser("employe@example.com", sampleUsers)).toBe(false);
  });

  it("autorise uniquement les utilisateurs actifs", () => {
    expect(isAllowedUser("admin@example.com", sampleUsers)).toBe(true);
    expect(isAllowedUser("employe@example.com", sampleUsers)).toBe(true);
    expect(isAllowedUser("disabled@example.com", sampleUsers)).toBe(false);
    expect(isAllowedUser("unknown@example.com", sampleUsers)).toBe(false);
  });

  it("retourne le rôle depuis la table users", () => {
    expect(userRole("admin@example.com", sampleUsers)).toBe("Admin");
    expect(userRole("employe@example.com", sampleUsers)).toBe("Employé");
    expect(userRole("unknown@example.com", sampleUsers)).toBe("Utilisateur");
  });

  it("findUserByEmail normalise l'email", () => {
    expect(findUserByEmail("  ADMIN@Example.COM ", sampleUsers)?.role).toBe("Admin");
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
