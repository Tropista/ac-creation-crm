export const PUBLIC_TSHIRT_PATH = "/configurateur-tshirt";

export const PAGE_PATHS = {
  dashboard: "/dashboard",
  clients: "/clients",
  products: "/produits",
  labels: "/etiquettes",
  scan: "/scan",
  categories: "/categories",
  quotes: "/devis",
  invoices: "/factures",
  users: "/utilisateurs",
  settings: "/parametres",
  import: "/import",
  backups: "/sauvegardes",
  logs: "/journal",
  print3dcalc: "/calculateur-3d",
  lasercalc: "/calculateur-laser",
  dtfcalc: "/calculateur-dtf",
  uvdtfcalc: "/calculateur-uv-dtf",
  vue3d: "/vue-3d",
  tshirt3d: "/t-shirt-3d",
  banque: "/banque",
};

const PATH_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([page, path]) => [path, page])
);

export function pageToPath(page) {
  return PAGE_PATHS[page] ?? PAGE_PATHS.dashboard;
}

export function pathToPage(pathname) {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized === "/") return "dashboard";
  return PATH_TO_PAGE[normalized] ?? null;
}

export function isHashRouterMode() {
  return typeof window !== "undefined" && window.location.protocol === "file:";
}

/** Après auth Supabase (hash avec tokens), restaurer une route CRM valide. */
export function resetUrlAfterAuth() {
  if (isHashRouterMode()) {
    window.location.hash = `#${PAGE_PATHS.dashboard}`;
    return;
  }
  window.history.replaceState({}, document.title, window.location.pathname);
}
