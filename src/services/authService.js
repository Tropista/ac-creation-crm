import { getPermissions } from "../utils/permissions";

export const SESSION_KEY = "crm_current_user_v2";
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_EXPIRED_MESSAGE =
  "Votre session a expiré. Veuillez vous reconnecter.";

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function findUserByEmail(email, users = []) {
  const normalizedEmail = normalizeEmail(email);
  return (users || []).find(
    (user) => normalizeEmail(user.email) === normalizedEmail
  );
}

export function mergeUsersLists(...lists) {
  const map = new Map();

  for (const list of lists) {
    for (const user of list || []) {
      if (!user?.email) continue;
      const key = normalizeEmail(user.email);
      map.set(key, { ...map.get(key), ...user });
    }
  }

  return Array.from(map.values());
}

export const AUTH_DENIED_NOT_REGISTERED =
  "Compte non autorisé. Votre email n'est pas enregistré dans le CRM — contactez l'administrateur pour être ajouté à la liste des utilisateurs.";

export const AUTH_DENIED_DISABLED =
  "Compte désactivé. Contactez l'administrateur pour réactiver votre accès.";

export function getAuthorizationErrorMessage(reason, email = "") {
  const normalizedEmail = normalizeEmail(email);

  if (reason === "disabled") {
    return AUTH_DENIED_DISABLED;
  }

  if (reason === "not_registered") {
    return normalizedEmail
      ? `${AUTH_DENIED_NOT_REGISTERED} (${normalizedEmail})`
      : AUTH_DENIED_NOT_REGISTERED;
  }

  return AUTH_DENIED_NOT_REGISTERED;
}

export function resolveUserAccess(email, users = []) {
  const found = findUserByEmail(email, users);

  if (!found) {
    return {
      allowed: false,
      reason: "not_registered",
      role: "Utilisateur",
      user: null,
    };
  }

  if (found.status === "Désactivé") {
    return {
      allowed: false,
      reason: "disabled",
      role: found.role || "Utilisateur",
      user: found,
    };
  }

  return {
    allowed: true,
    reason: null,
    role: found.role || "Utilisateur",
    user: found,
  };
}

export function isAdminUser(email, users = []) {
  const access = resolveUserAccess(email, users);
  return access.allowed && access.role === "Admin";
}

export function isAllowedUser(email, users = []) {
  return resolveUserAccess(email, users).allowed;
}

export function userRole(email, users = []) {
  return resolveUserAccess(email, users).role;
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
