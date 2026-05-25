import {
  useEffect,
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
  pageToPath,
  pathToPage,
} from "./utils/routes";
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

import {
  createCloudBackup
} from "./services/backupservice";

import { getPermissions } from "./utils/permissions";

import {
  emptyData,
  normalizeData,
  loadData,
  saveData,
  flushSaveData,
  dedupeItemsById,
  hasLocalBusinessData
} from "./services/dataService";

import { APP_LOGO_URL } from "./utils/assets";
import { showToast } from "./utils/toast";

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
import {
  formatSyncConflictMessage,
  getLastSyncAt,
  mergeCloudWithLocal,
  resolveCloudInitError,
  setLastSyncAt,
  stampDataChanges,
  SYNC_STATUS,
} from "./services/syncMerge";
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

async function loadSupabaseSyncModule() {
  return import("./services/supabaseSync");
}

function prepareAppData(raw) {
  return normalizeData({
    ...raw,
    users: dedupeItemsById(raw.users || []),
    backups: dedupeItemsById(raw.backups || []),
    logs: dedupeItemsById(raw.logs || []),
  });
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
  const page = pathToPage(location.pathname) ?? "dashboard";

  const setPage = (pageKey) => {
    navigate(pageToPath(pageKey));
  };

  const [data, setData] = useState(loadData);
  const dataRef = useRef(data);
  dataRef.current = data;
  const initialAuth = getInitialAuthState();
  const [currentUser, setCurrentUser] = useState(initialAuth.user);
  const [authNotice, setAuthNotice] = useState(initialAuth.notice);

  useEffect(() => {
    function handleOpenPage(event) {
      if (event.detail === "quotes") {
        setPage("quotes");
      }

      if (event.detail === "invoices") {
        setPage("invoices");
      }
    }

    window.addEventListener("crm-open-page", handleOpenPage);

    return () => window.removeEventListener("crm-open-page", handleOpenPage);
  }, [navigate]);
  const [loading, setLoading] = useState(true);
  const [cloudAvailable, setCloudAvailable] = useState(false);
  const [syncStatus, setSyncStatus] = useState(SYNC_STATUS.CONNECTING);
  const [lastSyncAt, setLastSyncAtState] = useState(() => getLastSyncAt());
  const [resyncing, setResyncing] = useState(false);
  const autoBackupStarted = useRef(false);
  const cloudInitPromise = useRef(null);
  const cloudSyncSucceeded = useRef(false);
  const saveQueueRef = useRef(Promise.resolve());

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
    cloudInitPromise.current = null;
    initializeCloudData();
  }, [currentUser?.email]);

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
    if (page === "invoices" || page === "quotes" || page === "atelier") {
      initializeCloudData({ silent: true });
    }
  }, [page]);

  function markSyncSuccess(timestamp = Date.now()) {
    setLastSyncAt(timestamp);
    setLastSyncAtState(timestamp);
  }

  async function resyncFromCloud() {
    if (resyncing) return;

    setResyncing(true);
    cloudInitPromise.current = null;

    try {
      await initializeCloudData({ silent: false });
      showToast("Resynchronisation terminée", "success");
    } catch (error) {
      console.error("Échec resynchronisation :", error);
    } finally {
      setResyncing(false);
      setLastSyncAtState(getLastSyncAt());
    }
  }

  async function initializeCloudData({ silent = false } = {}) {
    if (cloudInitPromise.current) {
      return cloudInitPromise.current;
    }

    const task = (async () => {
      try {
        const localData = normalizeData(loadData());

        if (!isSupabaseConfigured) {
          const prepared = prepareAppData(localData);
          setData(prepared);
          saveData(prepared);
          flushSaveData();
          setSyncStatus(SYNC_STATUS.LOCAL_NO_CONFIG);
          return;
        }

        const hasAuth = await hasSupabaseAuthSession();
        if (!hasAuth) {
          const prepared = prepareAppData(localData);
          setData(prepared);
          saveData(prepared);
          flushSaveData();
          setSyncStatus(SYNC_STATUS.LOCAL_UNAVAILABLE);
          setCloudAvailable(false);
          return;
        }

        const { loadSupabaseData, syncSupabaseData } = await loadSupabaseSyncModule();
        const cloud = await loadSupabaseData({
          normalizeData,
          emptyData,
        });

        if (cloud.hasCloudData) {
          let conflictCount = 0;

          const freshLocal = normalizeData(loadData());
          const mergedRaw = mergeCloudWithLocal(freshLocal, cloud.data, {
            onConflict: (payload) => {
              conflictCount += 1;
              const message = formatSyncConflictMessage(payload);
              if (silent) {
                console.warn("[Sync]", message);
              } else {
                showToast(message, "warning");
              }
            },
          });

          const prepared = prepareAppData(mergedRaw);
          setData(prepared);
          await syncSupabaseData(prepared, cloud.data);

          saveData(prepared);
          flushSaveData();

          markSyncSuccess();
          cloudSyncSucceeded.current = true;
          setSyncStatus(SYNC_STATUS.SYNCED);
          if (!silent && conflictCount) {
            showToast(
              `${conflictCount} conflit(s) — versions locales conservées. Vérifiez vos données ou resynchronisez.`,
              "info"
            );
          }
        } else if (hasLocalBusinessData(localData)) {
          const prepared = prepareAppData(localData);
          await syncSupabaseData(prepared, emptyData);
          setData(prepared);
          markSyncSuccess();
          cloudSyncSucceeded.current = true;
          setSyncStatus(SYNC_STATUS.LOCAL_PUSHED);
          saveData(prepared);
          flushSaveData();
          if (!silent) {
            showToast("Données locales synchronisées vers Supabase", "success");
          }
        } else {
          const prepared = prepareAppData(emptyData);
          await syncSupabaseData(prepared, emptyData);
          setData(prepared);
          saveData(prepared);
          flushSaveData();
          markSyncSuccess();
          cloudSyncSucceeded.current = true;
          setSyncStatus(SYNC_STATUS.READY);
        }

        setCloudAvailable(true);
      } catch (error) {
        console.error(error);
        const recoveredData = normalizeData(loadData());

        const outcome = resolveCloudInitError({
          cloudAlreadySynced: cloudSyncSucceeded.current,
          error,
        });
        setCloudAvailable(outcome.cloudAvailable);
        setSyncStatus(outcome.syncStatus);
        if (!silent && outcome.toast) {
          showToast(outcome.toast.message, outcome.toast.type);
        }

        const prepared = prepareAppData(recoveredData);
        setData(prepared);
        saveData(prepared);
        flushSaveData();
      } finally {
        setLoading(false);
        cloudInitPromise.current = null;
      }
    })();

    cloudInitPromise.current = task;
    return task;
  }

  async function updateData(next) {
    const task = saveQueueRef.current.then(async () => {
      const current = dataRef.current;
      const resolved = typeof next === "function" ? next(current) : next;
      const stamped = stampDataChanges(current, resolved);
      const normalized = normalizeData({
        ...stamped,
        users: dedupeItemsById(stamped.users || []),
        backups: dedupeItemsById(stamped.backups || []),
        logs: dedupeItemsById(stamped.logs || []),
      });

      const previous = current;

      dataRef.current = normalized;
      setData(normalized);

      let cloudSaved = false;

      if (isSupabaseConfigured && (await hasSupabaseAuthSession())) {
        try {
          setSyncStatus(SYNC_STATUS.SAVING);
          const { syncSupabaseData } = await loadSupabaseSyncModule();
          await syncSupabaseData(normalized, previous);
          markSyncSuccess();
          cloudSyncSucceeded.current = true;
          cloudSaved = true;
          setCloudAvailable(true);
          setSyncStatus(SYNC_STATUS.SYNCED);
        } catch (error) {
          console.error("Échec sync Supabase :", error);
          if (cloudSyncSucceeded.current) {
            setCloudAvailable(true);
            setSyncStatus(SYNC_STATUS.SAVE_ERROR);
          } else {
            setCloudAvailable(false);
            setSyncStatus(SYNC_STATUS.LOCAL_UNAVAILABLE);
          }
          showToast(
            error?.message
              ? `Erreur de sauvegarde Supabase : ${error.message}`
              : "Erreur de sauvegarde Supabase — données conservées localement",
            "error"
          );
          throw error;
        }
      } else {
        setSyncStatus(SYNC_STATUS.LOCAL_NO_CONFIG);
      }

      saveData(normalized);
      const localSaveResult = flushSaveData();

      if (localSaveResult?.quotaExceeded && cloudSaved) {
        showToast(
          "Cache local plein — vos données sont bien enregistrées dans le cloud.",
          "warning"
        );
      } else if (localSaveResult?.quotaExceeded && !cloudSaved) {
        showToast(
          "Quota localStorage dépassé — les données risquent de ne pas survivre au rechargement.",
          "error"
        );
      }

      return normalized;
    });

    saveQueueRef.current = task.catch(() => {});
    return task;
  }

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

          <Routes>
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
              path={pageToPath("atelier")}
              element={
                canAccessPage(currentRole, "atelier") ? (
                  <Atelier
                    data={data}
                    setData={updateData}
                    currentRole={currentRole}
                    logActivity={handleLogActivity}
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
