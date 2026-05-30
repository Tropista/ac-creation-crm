import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Banknote,
  BarChart3,
  Box,
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
  RefreshCw,
  ScanLine,
  Settings,
  Shield,
  Shirt,
  Smartphone,
  Tag,
  Users,
  Wrench,
  X,
  Bell,
  FileMinus,
  Headphones,
} from "lucide-react";

import { APP_LOGO_URL } from "../utils/assets";
import { APP_VERSION } from "../utils/appVersion";
import { pageToPath } from "../utils/routes";
import {
  INVOICES_LIST_NAV_STATE,
  QUOTES_LIST_NAV_STATE,
  requestInvoicesListView,
  requestQuotesListView,
} from "../utils/quoteDraft";
import { formatLastSyncRelative } from "../services/syncMerge";
import { cleanupNavigationBlockers, dispatchRouteChange } from "../utils/uiCleanup";
import { getSidebarAutomationBadgeCount } from "../utils/automations";
import { useSyncedPathname } from "../hooks/useSyncedPathname";

const SECTIONS_STORAGE_KEY = "crm_sidebar_sections_v1";

const pageIcons = {
  dashboard: LayoutDashboard,
  clients: Users,
  quotes: FileText,
  leads: Users,
  creditnotes: FileMinus,
  sav: Headphones,
  automations: Bell,
  invoices: Receipt,
  atelier: Wrench,
  products: Box,
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
      { page: "leads", label: "Leads", type: "page" },
      { page: "invoices", label: "Factures", type: "page" },
      { page: "creditnotes", label: "Avoirs", type: "page" },
      { page: "sav", label: "SAV", type: "page" },
      { page: "automations", label: "Automatisations", type: "page" },
      { page: "atelier", label: "Atelier", type: "page" },
    ],
  },
  {
    id: "stock",
    label: "Stock & achats",
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
  lastSyncAt = 0,
  cloudAvailable = false,
  resyncing = false,
  syncConflictCount = 0,
  onResync,
  permissions,
  logout,
}) {
  const navigate = useNavigate();
  const pathname = useSyncedPathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const quotesPath = pageToPath("quotes");
  const invoicesPath = pageToPath("invoices");
  const [sectionState, setSectionState] = useState(loadSectionState);
  const [syncTimeLabel, setSyncTimeLabel] = useState(() =>
    formatLastSyncRelative(lastSyncAt)
  );

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

  function isNavActive(pageKey) {
    const path = pageToPath(pageKey);
    return pathname === path || pathname === `${path}/`;
  }

  function navLinkState(item) {
    if (item.page === "quotes") {
      return QUOTES_LIST_NAV_STATE;
    }
    if (item.page === "invoices") {
      return INVOICES_LIST_NAV_STATE;
    }
    const leavingDocuments =
      pathname === quotesPath || pathname === invoicesPath;
    if (leavingDocuments) {
      return {};
    }
    return undefined;
  }

  function handleNavClick(event, item) {
    cleanupNavigationBlockers({ removePreviewOverlay: true });
    setMobileOpen(false);

    const path = pageToPath(item.page);
    const linkState = navLinkState(item);
    const leavingDocuments =
      pathname === quotesPath || pathname === invoicesPath;

    if (item.page === "quotes" && pathname === quotesPath) {
      event.preventDefault();
      requestQuotesListView();
      navigate(path, { replace: true, state: QUOTES_LIST_NAV_STATE });
      return;
    }
    if (item.page === "invoices" && pathname === invoicesPath) {
      event.preventDefault();
      requestInvoicesListView();
      navigate(path, { replace: true, state: INVOICES_LIST_NAV_STATE });
      return;
    }

    if (leavingDocuments && item.page !== "quotes" && item.page !== "invoices") {
      event.preventDefault();
      dispatchRouteChange(path);
      navigate(path, { state: linkState ?? undefined });
    }
  }

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("sidebar-drawer-open", mobileOpen);
    return () => document.body.classList.remove("sidebar-drawer-open");
  }, [mobileOpen]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const onChange = () => {
      if (!media.matches) {
        setMobileOpen(false);
      }
    };
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    setSyncTimeLabel(formatLastSyncRelative(lastSyncAt));
    const interval = setInterval(() => {
      setSyncTimeLabel(formatLastSyncRelative(lastSyncAt));
    }, 30_000);
    return () => clearInterval(interval);
  }, [lastSyncAt]);

  const automationBadge = getSidebarAutomationBadgeCount(data);

  function navBadge(pageKey) {
    if (pageKey === "automations" && automationBadge) return automationBadge;
    if (pageKey === "dashboard" && automationBadge) return automationBadge;
    return "";
  }

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
          <div className="sidebar-sync__info">
            <Cloud size={16} aria-hidden="true" />
            <div className="sidebar-sync__text">
              <span className="sidebar-sync__status">{syncStatus}</span>
              <span className="sidebar-sync__time">{syncTimeLabel}</span>
              {syncConflictCount > 0 ? (
                <span className="sidebar-sync__conflicts" data-testid="sidebar-sync-conflicts">
                  {syncConflictCount} conflit(s) récent(s) — local conservé
                </span>
              ) : null}
            </div>
          </div>
          {onResync ? (
            <button
              type="button"
              className="sidebar-sync__btn"
              onClick={onResync}
              disabled={!cloudAvailable || resyncing}
              aria-busy={resyncing}
              title={
                cloudAvailable
                  ? "Télécharger et fusionner les données cloud"
                  : "Cloud indisponible — resynchronisation impossible"
              }
            >
              <RefreshCw
                size={14}
                aria-hidden="true"
                className={resyncing ? "sidebar-sync__spin" : ""}
              />
              {resyncing ? "Synchronisation…" : "Resynchroniser"}
            </button>
          ) : null}
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
                        <Link
                          key={item.page}
                          to={pageToPath(item.page)}
                          state={navLinkState(item)}
                          data-testid={`nav-${item.page}`}
                          className={isNavActive(item.page) ? "active" : ""}
                          onClick={(event) => handleNavClick(event, item)}
                          aria-label={item.label}
                          aria-current={isNavActive(item.page) ? "page" : undefined}
                        >
                          <NavIcon page={item.page} />
                          {item.label}
                          {navBadge(item.page) ? (
                            <span className="sidebar-nav-badge">{navBadge(item.page)}</span>
                          ) : null}
                        </Link>
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
