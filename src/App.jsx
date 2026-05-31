import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  lazy,
  Suspense
} from "react";
import {
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  getSupabase,
  hasSupabaseAuthSession,
  isSupabaseConfigured,
} from "./supabase";
import {
  PUBLIC_TSHIRT_PATH,
  PUBLIC_QUOTE_PATH,
  pageToPath,
  pathToPage,
} from "./utils/routes";
import {
  buildQuoteOpenPath,
  parseQuoteOpenIdFromLocation,
} from "./utils/quoteOpenUrl";
import { INVOICES_LIST_NAV_STATE, QUOTES_LIST_NAV_STATE } from "./utils/quoteDraft";
import {
  loadLocalPublicLeads,
  mergePublicLeadsIntoData,
  PUBLIC_LEADS_UPDATED_EVENT,
} from "./services/leadsService";
import "./App.css";

import Sidebar from "./components/Sidebar";
import Clients from "./components/Clients";
import Products from "./components/Products";
import Documents from "./components/Documents";
import Dashboard from "./components/Dashboard";
import Atelier from "./components/Atelier";
import Settings from "./components/Settings";
import Categories from "./components/Categories";
import Suppliers from "./components/Suppliers";
import Expenses from "./components/Expenses";
import UsersAdmin from "./components/UsersAdmin";
import ActivityLogs from "./components/ActivityLogs";
import Backups from "./components/Backups";
import AuthPage from "./components/auth/AuthPage";
import AccessDenied from "./components/auth/AccessDenied";
import PublicQuoteView from "./components/PublicQuoteView";
import Leads from "./components/Leads";
import CreditNotes from "./components/CreditNotes";
import AfterSales from "./components/AfterSales";
import AutomationCenter from "./components/AutomationCenter";

import {
  createCloudBackup
} from "./services/backupservice";

import { getPermissions } from "./utils/permissions";

import {
  loadData,
  saveData,
  flushSaveData,
} from "./services/dataService";

import { APP_LOGO_URL } from "./utils/assets";

import {
  isAllowedUser,
  userRole,
  canAccessPage,
  loadSession,
  clearSession,
  touchSession,
  SESSION_EXPIRED_MESSAGE,
} from "./services/authService";

import {
  logActivity
} from "./services/logService";
import { useCloudSync } from "./hooks/useCloudSync";
import { useSyncedPathname } from "./hooks/useSyncedPathname";
import {
  cleanupNavigationBlockers,
  dispatchRouteChange,
} from "./utils/uiCleanup";
import "./styles/sidebar.css";
import "./styles/dashboard.css";
import "./styles/clients.css";
import "./styles/documents.css";
import "./styles/invoice-styles.css";
import "./styles/atelier.css";
import "./styles/products-erp.css";
import "./styles/suppliers.css";
import "./styles/expenses.css";
import "./styles/labels.css";
import "./styles/leads.css";
import "./styles/credit-notes.css";
import "./styles/after-sales.css";
import "./styles/automations.css";
const Vue3D = lazy(() =>
  import("./components/Vue3D")
);

const Vue3DTshirt = lazy(() =>
  import("./components/Vue3DTshirt")
);

const Banque = lazy(() =>
  import("./components/Banque")
);

const ExcelImport = lazy(() =>
  import("./components/ExcelImport")
);

const BarcodeLabels = lazy(() =>
  import("./components/BarcodeLabels")
);

const ProductScan = lazy(() =>
  import("./components/ProductScan")
);

const Print3DCalculator = lazy(() =>
  import("./components/Print3DCalculator")
);

const LaserCalculator = lazy(() =>
  import("./components/LaserCalculator")
);

const DtfCalculator = lazy(() =>
  import("./components/DtfCalculator")
);

const UvDtfCalculator = lazy(() =>
  import("./components/UvDtfCalculator")
);

function getInitialAuthState() {
  const session = loadSession();
  if (session?.expired) {
    return { user: null, notice: SESSION_EXPIRED_MESSAGE };
  }
  return { user: session, notice: "" };
}

function LoadingScreen({ message = "Chargement...", status = "" }) {
  return (
    <div className="crm-loading">
      <div className="crm-loading-card">
        <div className="crm-loading-logo">
          <img src={APP_LOGO_URL} alt="AC Creation" />
        </div>
        <div className="crm-loading-spinner" aria-hidden="true" />
        <h2>{message}</h2>
        {status ? <p>{status}</p> : null}
      </div>
    </div>
  );
}

function ContentLoading({ message = "Chargement..." }) {
  return (
    <div className="crm-content-loading">
      <div className="crm-loading-spinner" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route
        path={PUBLIC_TSHIRT_PATH}
        element={<PublicTshirtConfigurator />}
      />
      <Route path={PUBLIC_QUOTE_PATH} element={<PublicQuoteView />} />
      <Route path="/*" element={<CrmApp />} />
    </Routes>
  );
}

function PublicTshirtConfigurator() {
  return (
    <div style={{ minHeight: "100vh", background: "#081b4b", padding: "20px" }}>
      <Suspense fallback={<ContentLoading />}>
        <Vue3DTshirt />
      </Suspense>
    </div>
  );
}

function CrmApp() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = useSyncedPathname();
  const page = pathToPage(pathname) ?? "dashboard";
  const routesLocation =
    pathname !== location.pathname
      ? { ...location, pathname }
      : location;

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (pathname === location.pathname) return;
    // Ne pas annuler configurateur → Devis (brouillon dans location.state).
    if (location.state?.quoteDraft) return;
    navigate(`${pathname}${window.location.search}${window.location.hash}`, {
      replace: true,
      state: location.state,
    });
  }, [pathname, location.pathname, location.state, navigate]);

  useEffect(() => {
    cleanupNavigationBlockers({ removePreviewOverlay: true });
  }, [pathname]);

  const setPage = (pageKey, options = {}) => {
    const path = pageToPath(pageKey);
    if (options.state) {
      navigate(path, { state: options.state });
      return;
    }
    navigate(path);
  };

  const [data, setData] = useState(loadData);
  const dataRef = useRef(data);
  dataRef.current = data;
  const initialAuth = getInitialAuthState();
  const [currentUser, setCurrentUser] = useState(initialAuth.user);
  const [authNotice, setAuthNotice] = useState(initialAuth.notice);

  useEffect(() => {
    cleanupNavigationBlockers({ removePreviewOverlay: true });
    dispatchRouteChange(pathname);
  }, [pathname]);

  // QR fiche atelier / lien ?open= : normaliser vers /devis (BrowserRouter Vercel).
  useEffect(() => {
    const openId = parseQuoteOpenIdFromLocation(location);
    if (!openId || page === "quotes") return;

    navigate(buildQuoteOpenPath(openId), { replace: true });
  }, [location.pathname, location.search, location.hash, page, navigate]);

  useEffect(() => {
    function handleOpenPage(event) {
      if (event.detail === "quotes") {
        setPage("quotes", { state: QUOTES_LIST_NAV_STATE });
      }

      if (event.detail === "invoices") {
        setPage("invoices", { state: INVOICES_LIST_NAV_STATE });
      }
    }

    window.addEventListener("crm-open-page", handleOpenPage);

    return () => {
      window.removeEventListener("crm-open-page", handleOpenPage);
    };
  }, [navigate]);
  const [loading, setLoading] = useState(true);
  const autoBackupStarted = useRef(false);
  const pageCloudResyncTimer = useRef(null);

  const {
    cloudAvailable,
    syncStatus,
    setSyncStatus,
    lastSyncAt,
    syncConflictCount,
    resyncing,
    initializeCloudData,
    resyncFromCloud,
    updateDataWithCloudSync,
    bindDataRef,
  } = useCloudSync({
    currentUserEmail: currentUser?.email,
    setData,
    setLoading,
  });

  useEffect(() => {
    bindDataRef(data);
  }, [data, bindDataRef]);

  const updateData = updateDataWithCloudSync;

  useEffect(() => {
    function mergePendingPublicLeads() {
      if (!loadLocalPublicLeads().length) return;
      updateData((current) => mergePublicLeadsIntoData(current));
    }

    mergePendingPublicLeads();
    window.addEventListener(PUBLIC_LEADS_UPDATED_EVENT, mergePendingPublicLeads);
    return () => {
      window.removeEventListener(PUBLIC_LEADS_UPDATED_EVENT, mergePendingPublicLeads);
    };
  }, [updateData]);

  const currentRole = userRole(currentUser?.email, data.users);
  const permissions = getPermissions(currentRole);

  useEffect(() => {
    if (currentUser) {
      setAuthNotice("");
    }
  }, [currentUser?.email]);

  useEffect(() => {
    let cancelled = false;

    async function verifySupabaseSession() {
      const crmSession = loadSession();
      if (!crmSession?.email || crmSession.expired || !isSupabaseConfigured) {
        return;
      }

      const hasAuth = await hasSupabaseAuthSession();
      if (!hasAuth && !cancelled) {
        clearSession();
        setCurrentUser(null);
        setAuthNotice(SESSION_EXPIRED_MESSAGE);
      }
    }

    verifySupabaseSession();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentUser) return undefined;

    let activityTimer;
    const onActivity = () => {
      clearTimeout(activityTimer);
      activityTimer = setTimeout(() => {
        const refreshed = touchSession();
        if (refreshed?.expired) {
          clearSession();
          setCurrentUser(null);
          setAuthNotice(SESSION_EXPIRED_MESSAGE);
        }
      }, 30_000);
    };

    const expiryCheck = setInterval(() => {
      const session = loadSession();
      if (!session || session.expired) {
        clearSession();
        setCurrentUser(null);
        setAuthNotice(SESSION_EXPIRED_MESSAGE);
      }
    }, 60_000);

    window.addEventListener("click", onActivity);
    window.addEventListener("keydown", onActivity);

    return () => {
      clearTimeout(activityTimer);
      clearInterval(expiryCheck);
      window.removeEventListener("click", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [currentUser?.email]);

  useEffect(() => {
    saveData(data);
    return () => {
      flushSaveData();
    };
  }, [data]);

  useEffect(() => {
    const flush = () => flushSaveData();
    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      flushSaveData();
    };
  }, []);

  useEffect(() => {
    if (page !== "invoices" && page !== "quotes" && page !== "atelier") {
      return undefined;
    }

    clearTimeout(pageCloudResyncTimer.current);
    pageCloudResyncTimer.current = setTimeout(() => {
      initializeCloudData({ silent: true });
    }, 600);

    return () => clearTimeout(pageCloudResyncTimer.current);
  }, [page]);

  function handleLogActivity(payloadOrAction, target = "", details = "") {
    if (typeof payloadOrAction === "object" && payloadOrAction !== null) {
      return logActivity({
        ...payloadOrAction,
        currentUser,
        currentRole,
        setData,
      });
    }

    return logActivity({
      action: payloadOrAction,
      target,
      details,
      currentUser,
      currentRole,
      setData,
    });
  }

  useEffect(() => {
    if (loading || !cloudAvailable || autoBackupStarted.current) return;
    if (!currentUser || !isAllowedUser(currentUser.email, data.users)) return;

    const lastBackupAt = localStorage.getItem("crm_last_auto_backup_at");
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;

    if (!lastBackupAt || now - Number(lastBackupAt) > twelveHours) {
      autoBackupStarted.current = true;

      createCloudBackup({
        data,
        label: "Sauvegarde automatique",
        setData,
        setSyncStatus,
        currentUser,
        currentRole,
        logActivity: handleLogActivity,
        silent: true,
        onSuccess: () =>
          localStorage.setItem("crm_last_auto_backup_at", String(now)),
      });
    }
  }, [loading, cloudAvailable, currentUser?.email]);

  useEffect(() => {
    if (currentUser && !canAccessPage(currentRole, page)) {
      navigate(pageToPath("dashboard"), { replace: true });
    }
  }, [currentUser, currentRole, page, navigate]);

  async function logout() {
    if (isSupabaseConfigured) {
      try {
        const supabase = await getSupabase();
        await supabase.auth.signOut();
      } catch (error) {
        console.error(error);
      }
    }
    clearSession();
    setCurrentUser(null);
    setAuthNotice("");
    setPage("dashboard");
  }

  if (loading) {
    return <LoadingScreen status={syncStatus} />;
  }

  if (!currentUser) {
    return (
      <AuthPage
        data={data}
        setData={updateData}
        setCurrentUser={setCurrentUser}
        initialNotice={authNotice}
      />
    );
  }

  if (!isAllowedUser(currentUser.email, data.users)) {
    return (
      <AccessDenied
        user={currentUser}
        logout={logout}
      />
    );
  }

  return (
    <div className="app">
      <Sidebar
        data={data}
        currentUser={currentUser}
        currentRole={currentRole}
        syncStatus={syncStatus}
        lastSyncAt={lastSyncAt}
        cloudAvailable={cloudAvailable}
        resyncing={resyncing}
        syncConflictCount={syncConflictCount}
        onResync={resyncFromCloud}
        permissions={permissions}
        logout={logout}
      />

      <main className="content">
        <Suspense fallback={<ContentLoading />}>
          {!canAccessPage(currentRole, page) && (
            <AccessDenied
              user={currentUser}
              logout={logout}
            />
          )}

          <Routes location={routesLocation}>
            <Route
              index
              element={<Navigate to={pageToPath("dashboard")} replace />}
            />
            <Route
              path={pageToPath("dashboard")}
              element={
                canAccessPage(currentRole, "dashboard") ? (
                  <Dashboard
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                    cloudAvailable={cloudAvailable}
                    onCloudResync={initializeCloudData}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("clients")}
              element={
                canAccessPage(currentRole, "clients") ? (
                  <Clients
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                    setPage={setPage}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("products")}
              element={
                canAccessPage(currentRole, "products") ? (
                  <Products
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("suppliers")}
              element={
                canAccessPage(currentRole, "suppliers") ? (
                  <Suppliers
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("expenses")}
              element={
                canAccessPage(currentRole, "expenses") ? (
                  <Expenses
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                    setPage={setPage}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("labels")}
              element={
                canAccessPage(currentRole, "labels") ? (
                  <BarcodeLabels data={data} />
                ) : null
              }
            />
            <Route
              path={pageToPath("scan")}
              element={
                canAccessPage(currentRole, "scan") ? (
                  <ProductScan
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("categories")}
              element={
                canAccessPage(currentRole, "categories") ? (
                  <Categories
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("quotes")}
              element={
                canAccessPage(currentRole, "quotes") ? (
                  <Documents
                    type="quote"
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("leads")}
              element={
                canAccessPage(currentRole, "leads") ? (
                  <Leads
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("atelier")}
              element={
                canAccessPage(currentRole, "atelier") ? (
                  <Atelier
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                    cloudAvailable={cloudAvailable}
                    onCloudResync={initializeCloudData}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("invoices")}
              element={
                canAccessPage(currentRole, "invoices") ? (
                  <Documents
                    type="invoice"
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("creditnotes")}
              element={
                canAccessPage(currentRole, "creditnotes") ? (
                  <CreditNotes
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("sav")}
              element={
                canAccessPage(currentRole, "sav") ? (
                  <AfterSales
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("automations")}
              element={
                canAccessPage(currentRole, "automations") ? (
                  <AutomationCenter data={data} />
                ) : null
              }
            />
            <Route
              path={pageToPath("users")}
              element={
                permissions.canManageUsers ? (
                  <UsersAdmin
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("settings")}
              element={
                permissions.canEditSettings ? (
                  <Settings
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("import")}
              element={
                permissions.canImport ? (
                  <ExcelImport
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("backups")}
              element={
                permissions.canManageUsers ? (
                  <Backups
                    data={data}
                    setData={updateData}
                    createCloudBackup={(label) =>
                      createCloudBackup({
                        data,
                        label,
                        setData,
                        setSyncStatus,
                        currentUser,
                        currentRole,
                        logActivity: handleLogActivity,
                      })
                    }
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("logs")}
              element={
                canAccessPage(currentRole, "logs") ? (
                  <ActivityLogs data={data} />
                ) : null
              }
            />
            <Route
              path={pageToPath("print3dcalc")}
              element={
                canAccessPage(currentRole, "print3dcalc") ? (
                  <Print3DCalculator
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("lasercalc")}
              element={
                canAccessPage(currentRole, "lasercalc") ? (
                  <LaserCalculator
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("dtfcalc")}
              element={
                canAccessPage(currentRole, "dtfcalc") ? (
                  <DtfCalculator
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("uvdtfcalc")}
              element={
                canAccessPage(currentRole, "uvdtfcalc") ? (
                  <UvDtfCalculator
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path={pageToPath("vue3d")}
              element={
                canAccessPage(currentRole, "vue3d") ? <Vue3D /> : null
              }
            />
            <Route
              path={pageToPath("tshirt3d")}
              element={
                canAccessPage(currentRole, "tshirt3d") ? <Vue3DTshirt /> : null
              }
            />
            <Route
              path={pageToPath("banque")}
              element={
                canAccessPage(currentRole, "banque") ? (
                  <Banque
                    data={data}
                    setData={updateData}
                    logActivity={handleLogActivity}
                  />
                ) : null
              }
            />
            <Route
              path="*"
              element={<Navigate to={pageToPath("dashboard")} replace />}
            />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
