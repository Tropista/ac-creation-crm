export const ROLE_PERMISSIONS = {
  Admin: {
    pages: [
      "dashboard",
      "today",
      "clients",
      "products",
      "suppliers",
      "expenses",
      "vatdeclaration",
      "labels",
      "scan",
      "categories",
      "quotes",
      "leads",
      "atelier",
      "invoices",
      "creditnotes",
      "sav",
      "automations",
      "users",
      "settings",
      "import",
      "backups",
      "logs",
      "print3dcalc",
      "lasercalc",
      "dtfcalc",
      "uvdtfcalc",
      "brodcalc",
      "vue3d",
      "tshirt3d",
      "banque",
    ],
    canDelete: true,
    canEditSettings: true,
    canManageUsers: true,
    canImport: true,
    actions: {
      delete: true,
      restore: true,
      exportAccounting: true,
      vat_declaration_view: true,
      manageUsers: true,
      editSettings: true,
      sendEmails: true,
      viewMargins: true,
      editPrices: true,
      managePayments: true,
      manageStock: true,
      manageWorkshop: true,
      viewSensitiveFinance: true,
      generateSupplierOrders: true,
    },
  },

  Employé: {
    pages: [
      "dashboard",
      "today",
      "clients",
      "products",
      "suppliers",
      "expenses",
      "labels",
      "scan",
      "quotes",
      "leads",
      "atelier",
      "invoices",
      "creditnotes",
      "sav",
      "automations",
      "banque",
      "print3dcalc",
      "lasercalc",
      "dtfcalc",
      "uvdtfcalc",
      "brodcalc",
      "tshirt3d",
      "vue3d",
    ],
    canDelete: false,
    canEditSettings: false,
    canManageUsers: false,
    canImport: false,
    actions: {
      delete: false,
      restore: false,
      exportAccounting: false,
      vat_declaration_view: false,
      manageUsers: false,
      editSettings: false,
      sendEmails: true,
      viewMargins: false,
      editPrices: false,
      managePayments: false,
      manageStock: true,
      manageWorkshop: true,
      viewSensitiveFinance: false,
      generateSupplierOrders: true,
    },
  },

  Comptable: {
    pages: ["dashboard", "today", "invoices", "creditnotes", "expenses", "vatdeclaration", "banque", "automations"],
    canDelete: false,
    canEditSettings: false,
    canManageUsers: false,
    canImport: false,
    actions: {
      delete: false,
      restore: false,
      exportAccounting: true,
      vat_declaration_view: true,
      manageUsers: false,
      editSettings: false,
      sendEmails: true,
      viewMargins: false,
      editPrices: false,
      managePayments: true,
      manageStock: false,
      manageWorkshop: false,
      viewSensitiveFinance: true,
      generateSupplierOrders: false,
    },
  },

  Utilisateur: {
    pages: ["dashboard", "today"],
    canDelete: false,
    canEditSettings: false,
    canManageUsers: false,
    canImport: false,
    actions: {
      delete: false,
      restore: false,
      exportAccounting: false,
      vat_declaration_view: false,
      manageUsers: false,
      editSettings: false,
      sendEmails: false,
      viewMargins: false,
      editPrices: false,
      managePayments: false,
      manageStock: false,
      manageWorkshop: false,
      viewSensitiveFinance: false,
      generateSupplierOrders: false,
    },
  },
};

export function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Utilisateur;
}

export function canPerformAction(role, action) {
  return Boolean(getPermissions(role).actions?.[action]);
}

export function canViewMargins(role) {
  return canPerformAction(role, "viewMargins");
}

export function canEditPrices(role) {
  return canPerformAction(role, "editPrices");
}

export function canManagePayments(role) {
  return canPerformAction(role, "managePayments");
}

export function canManageWorkshop(role) {
  return canPerformAction(role, "manageWorkshop");
}
