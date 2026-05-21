import { getPermissions } from "../utils/permissions";

export const ADMIN_EMAILS = [
  "ac.creation.officiel@gmail.com"
];

export function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase();
}

export function isAdminEmail(email) {
  return ADMIN_EMAILS
    .map(normalizeEmail)
    .includes(
      normalizeEmail(email)
    );
}

export function isAllowedUser(
  email,
  users = []
) {
  const normalizedEmail =
    normalizeEmail(email);

  return (
    isAdminEmail(
      normalizedEmail
    ) ||

    (users || []).some(
      (user) =>
        normalizeEmail(
          user.email
        ) === normalizedEmail &&
        user.status !==
          "Désactivé"
    )
  );
}

export function userRole(
  email,
  users = []
) {
  if (
    isAdminEmail(email)
  )
    return "Admin";

  const found = (
    users || []
  ).find(
    (user) =>
      normalizeEmail(
        user.email
      ) ===
      normalizeEmail(
        email
      )
  );

  return (
    found?.role ||
    "Utilisateur"
  );
}

export function canAccessPage(
  role,
  page
) {
  return getPermissions(
    role
  ).pages.includes(page);
}

export function canDeleteData(
  role
) {
  return getPermissions(
    role
  ).canDelete;
}