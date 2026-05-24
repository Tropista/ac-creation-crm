import { SESSION_KEY } from "../src/services/authService.js";
import { STORAGE_KEY, emptyData } from "../src/services/dataService.js";

const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function makeTestData(overrides = {}) {
  return {
    ...emptyData,
    users: [
      {
        id: "admin-1",
        email: "ac.creation.officiel@gmail.com",
        name: "Admin AC Creation",
        role: "Admin",
        status: "Actif",
      },
    ],
    clients: [
      {
        id: "client-1",
        name: "Client E2E",
        email: "client@example.com",
        phone: "",
        address: "",
        type: "client",
      },
    ],
    ...overrides,
  };
}

export function makeSession(user) {
  const now = Date.now();
  return {
    id: user.id || "test-user",
    name: user.name || "Utilisateur test",
    email: user.email,
    role: user.role || "Admin",
    expiresAt: now + SESSION_MAX_AGE_MS,
    lastActivityAt: now,
  };
}

export async function seedCrm(page, { session, data }) {
  await page.addInitScript(
    ({ session, data, SESSION_KEY, STORAGE_KEY }) => {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },
    { session, data, SESSION_KEY, STORAGE_KEY }
  );
}

export const adminSession = makeSession({
  id: "admin-1",
  email: "ac.creation.officiel@gmail.com",
  name: "Admin AC Creation",
  role: "Admin",
});

export const comptableSession = makeSession({
  id: "comptable-1",
  email: "comptable@test.com",
  name: "Comptable Test",
  role: "Comptable",
});

export { SESSION_KEY };

export const comptableData = makeTestData({
  users: [
    {
      id: "comptable-1",
      email: "comptable@test.com",
      name: "Comptable Test",
      role: "Comptable",
      status: "Actif",
    },
  ],
});
