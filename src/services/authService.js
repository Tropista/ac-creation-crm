import { getPermissions } from "../utils/permissions";

export const ADMIN_EMAILS = [
  "ac.creation.officiel@gmail.com",
  "dos.santos.alves.daniel@gmail.com",
];

export const SESSION_KEY = "crm_current_user_v2";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_EXPIRED_MESSAGE =
  "Votre session a expiré. Veuillez vous reconnecter.";

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function isAdminEmail(email) {
  return ADMIN_EMAILS.map(normalizeEmail).includes(normalizeEmail(email));
}

export function isAllowedUser(email, users = []) {
  const normalizedEmail = normalizeEmail(email);

  return (
    isAdminEmail(normalizedEmail) ||
    (users || []).some(
      (user) =>
        normalizeEmail(user.email) === normalizedEmail &&
        user.status !== "Désactivé"
    )
  );
}

export function userRole(email, users = []) {
  if (isAdminEmail(email)) return "Admin";

  const found = (users || []).find(
    (user) => normalizeEmail(user.email) === normalizeEmail(email)
  );

  return found?.role || "Utilisateur";
}

export function canAccessPage(role, page) {
  return getPermissions(role).pages.includes(page);
}

export function canDeleteData(role) {
  return getPermissions(role).canDelete;
}

function sessionPayload(user) {
  const now = Date.now();
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    expiresAt: now + SESSION_MAX_AGE_MS,
    lastActivityAt: now,
  };
}

export function saveSession(user) {
  const session = sessionPayload(user);
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    const now = Date.now();

    if (!session?.email) {
      clearSession();
      return null;
    }

    if (!session.expiresAt) {
      return saveSession({
        id: session.id,
        name: session.name,
        email: session.email,
        role: session.role,
      });
    }

    if (now > session.expiresAt) {
      clearSession();
      return { expired: true };
    }

    return session;
  } catch {
    clearSession();
    return null;
  }
}

export function touchSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const session = JSON.parse(raw);
    if (!session?.email) {
      clearSession();
      return null;
    }

    const now = Date.now();
    if (session.expiresAt && now > session.expiresAt) {
      clearSession();
      return { expired: true };
    }

    return saveSession({
      id: session.id,
      name: session.name,
      email: session.email,
      role: session.role,
    });
  } catch {
    clearSession();
    return null;
  }
}
