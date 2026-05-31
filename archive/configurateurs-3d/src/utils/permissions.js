export const ROLE_PERMISSIONS = {
  Admin: {
    pages: [
      "dashboard",
      "clients",
      "products",
      "suppliers",
      "expenses",
      "labels",
      "scan",
      "categories",
      "quotes",
      "atelier",
      "invoices",
      "users",
      "settings",
      "import",
      "backups",
      "logs",
      "print3dcalc",
      "lasercalc",
      "dtfcalc",
      "uvdtfcalc",
      "vue3d",
      "tshirt3d",
      "banque",
    ],
    canDelete: true,
    canEditSettings: true,
    canManageUsers: true,
    canImport: true,
  },

  Employé: {
    pages: [
      "dashboard",
      "clients",
      "products",
      "suppliers",
      "expenses",
      "labels",
      "scan",
      "quotes",
      "atelier",
      "invoices",
      "banque",
      "print3dcalc",
      "lasercalc",
      "dtfcalc",
      "uvdtfcalc",
      "tshirt3d",
      "vue3d",
    ],
    canDelete: false,
    canEditSettings: false,
    canManageUsers: false,
    canImport: false,
  },

  Comptable: {
    pages: ["dashboard", "invoices", "expenses", "banque"],
    canDelete: false,
    canEditSettings: false,
    canManageUsers: false,
    canImport: false,
  },

  Utilisateur: {
    pages: ["dashboard"],
    canDelete: false,
    canEditSettings: false,
    canManageUsers: false,
    canImport: false,
  },
};

export function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Utilisateur;
}
