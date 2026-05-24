import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  Archive,
  Banknote,
  BarChart3,
  Box,
  BookOpen,
  Calculator,
  ChevronDown,
  ChevronRight,
  Cloud,
  Coffee,
  Download,
  Factory,
  FileSpreadsheet,
  FileText,
  Flame,
  FolderTree,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Menu,
  Receipt,
  ScanLine,
  Settings,
  Shield,
  Shirt,
  Smartphone,
  Tag,
  Users,
  Wrench,
  X,
} from "lucide-react";

import { APP_LOGO_URL } from "../utils/assets";
import { APP_VERSION } from "../utils/appVersion";
import { pageToPath } from "../utils/routes";

const SECTIONS_STORAGE_KEY = "crm_sidebar_sections_v1";

const pageIcons = {
  dashboard: LayoutDashboard,
  clients: Users,
  quotes: FileText,
  invoices: Receipt,
  atelier: Wrench,
  products: Box,
  importFournisseur: Download,
  catalogueClient: BookOpen,
  catalogueInterne: Archive,
  categories: FolderTree,
  suppliers: Factory,
  expenses: FileSpreadsheet,
  labels: Tag,
  scan: ScanLine,
  print3dcalc: Calculator,
  lasercalc: Flame,
  dtfcalc: Shirt,
  uvdtfcalc: Smartphone,
  tshirt3d: Shirt,
  vue3d: Coffee,
  banque: Banknote,
  users: Shield,
  settings: Settings,
  import: Download,
  backups: HardDrive,
  logs: BarChart3,
};

const menuGroups = [
  {
    id: "commercial",
    label: "Commercial",
    items: [
      { page: "dashboard", label: "Tableau de bord", type: "page" },
      { page: "clients", label: "Clients", type: "page" },
      { page: "quotes", label: "Devis", type: "page" },
      { page: "invoices", label: "Factures", type: "page" },
      { page: "atelier", label: "Atelier", type: "page" },
    ],
  },
  {
    id: "catalogues",
    label: "Catalogues",
    items: [
      { page: "importFournisseur", label: "Import fournisseur", type: "page" },
      { page: "catalogueClient", label: "Catalogue client", type: "page" },
      { page: "catalogueInterne", label: "Catalogue interne", type: "page" },
    ],
  },
  {
    id: "catalogue",
    label: "Catalogue",
    items: [
      { page: "products", label: "Produits", type: "page" },
      { page: "categories", label: "Catégories", type: "page" },
      { page: "suppliers", label: "Fournisseurs", type: "page" },
      { page: "expenses", label: "Dépenses", type: "page" },
      { page: "labels", label: "Étiquettes", type: "page" },
      { page: "scan", label: "Scan produit", type: "page" },
    ],
  },
  {
    id: "atelier-outils",
    label: "Atelier / Outils",
    items: [
      { page: "print3dcalc", label: "Calculateur 3D", type: "page" },
      { page: "lasercalc", label: "Calculateur Laser", type: "page" },
      { page: "dtfcalc", label: "Calculateur DTF", type: "page" },
      { page: "uvdtfcalc", label: "Calculateur UV-DTF", type: "page" },
      { page: "tshirt3d", label: "Configurateur T-shirt 3D", type: "page" },
      { page: "vue3d", label: "Configurateur Mug 3D", type: "page" },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    items: [
      { page: "banque", label: "Banque", type: "page" },
      { page: "users", label: "Utilisateurs", permission: "canManageUsers" },
      { page: "settings", label: "Paramètres", permission: "canEditSettings" },
      { page: "import", label: "Import Excel", permission: "canImport" },
      { page: "backups", label: "Sauvegardes", permission: "canManageUsers" },
      { page: "logs", label: "Journal d'activité", type: "page" },
    ],
  },
];

const defaultSectionState = Object.fromEntries(
  menuGroups.map((group) => [group.id, true])
);

function loadSectionState() {
  try {
    const stored = JSON.parse(localStorage.getItem(SECTIONS_STORAGE_KEY) || "{}");
    return { ...defaultSectionState, ...stored };
  } catch {
    return defaultSectionState;
  }
}

function NavIcon({ page }) {
  const Icon = pageIcons[page] || FileText;
  return <Icon size={18} strokeWidth={2.2} aria-hidden="true" className="sidebar-nav-icon" />;
}

export default function Sidebar({
  data,
  currentUser,
  currentRole,
  syncStatus,
  permissions,
  logout,
}) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sectionState, setSectionState] = useState(loadSectionState);

  function canShow(item) {
    if (item.type === "page") {
      return permissions.pages.includes(item.page);
    }

    if (item.permission) {
      return Boolean(permissions[item.permission]);
    }

    return true;
  }

  function toggleSection(sectionId) {
    setSectionState((current) => {
      const next = { ...current, [sectionId]: !current[sectionId] };
      localStorage.setItem(SECTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-drawer-open", mobileOpen);
    return () => document.body.classList.remove("sidebar-drawer-open");
  }, [mobileOpen]);

  const visibleGroups = menuGroups
    .map((group) => ({
      ...group,
      items: group.items.filter(canShow),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <button
        type="button"
        className="sidebar-mobile-toggle"
        onClick={() => setMobileOpen((open) => !open)}
        aria-expanded={mobileOpen}
        aria-label={mobileOpen ? "Fermer le menu" : "Ouvrir le menu"}
      >
        {mobileOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>

      {mobileOpen ? (
        <button
          type="button"
          className="sidebar-overlay"
          aria-label="Fermer le menu"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`} aria-label="Navigation principale">
        <div className="sidebar-brand">
          <div className="sidebar-logo">
            <img
              src={APP_LOGO_URL}
              alt="AC Creation"
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
          </div>
          <div>
            <h1>{data.settings.companyName || "AC Creation"}</h1>
            <span>Creative CRM</span>
            <p className="brand-desc">Personnalisation • Laser • 3D</p>
          </div>
        </div>

        <div className="sidebar-user">
          <strong>{currentUser.name}</strong>
          <span>{currentRole}</span>
        </div>

        <div className="sidebar-sync">
          <Cloud size={16} aria-hidden="true" />
          <span>{syncStatus}</span>
        </div>

        <div className="sidebar-body">
          <nav className="sidebar-nav" aria-label="Sections de l'application">
            {visibleGroups.map((group) => {
              const isOpen = sectionState[group.id] !== false;

              return (
                <div key={group.id} className="sidebar-section">
                  <button
                    type="button"
                    className="sidebar-section__toggle"
                    onClick={() => toggleSection(group.id)}
                    aria-expanded={isOpen}
                    aria-controls={`sidebar-section-${group.id}`}
                  >
                    <span>{group.label}</span>
                    <span className="sidebar-section__chevron" aria-hidden="true">
                      {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="sidebar-section__items" id={`sidebar-section-${group.id}`}>
                      {group.items.map((item) => (
                        <NavLink
                          key={item.page}
                          to={pageToPath(item.page)}
                          data-testid={`nav-${item.page}`}
                          className={({ isActive }) => (isActive ? "active" : "")}
                          onClick={() => setMobileOpen(false)}
                          aria-label={item.label}
                        >
                          <NavIcon page={item.page} />
                          {item.label}
                        </NavLink>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </nav>

          <button
            className="danger sidebar-logout"
            onClick={logout}
            aria-label="Se déconnecter"
          >
            <LogOut size={18} aria-hidden="true" />
            Déconnexion
          </button>
        </div>

        <div className="sidebar-footer">
          <p className="sidebar-version">Version {APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
