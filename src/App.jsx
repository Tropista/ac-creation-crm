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
import { supabase, isSupabaseConfigured } from "./supabase";
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
import Settings from "./components/Settings";
import Categories from "./components/Categories";
import Suppliers from "./components/Suppliers";
import Expenses from "./components/Expenses";
import UsersAdmin from "./components/UsersAdmin";
import ActivityLogs from "./components/ActivityLogs";
import Print3DCalculator from "./components/Print3DCalculator";
import LaserCalculator from "./components/LaserCalculator";
import DtfCalculator from "./components/DtfCalculator";
import UvDtfCalculator from "./components/UvDtfCalculator";
import Backups from "./components/Backups";
import AuthPage from "./components/auth/AuthPage";
import AccessDenied from "./components/auth/AccessDenied";

import {
  createCloudBackup
} from "./services/backupservice";

import { getPermissions } from "./utils/permissions";

import {
  loadSupabaseData,
  syncSupabaseData
} from "./services/supabaseSync";

import {
  emptyData,
  normalizeData,
  loadData,
  saveData,
  flushSaveData,
  dedupeItemsById,
  hasLocalBusinessData
} from "./services/dataService";

import { showToast } from "./utils/toast";

import {
  isAdminEmail,
  isAllowedUser,
  userRole,
  canAccessPage,
} from "./services/authService";

import {
  logActivity
} from "./services/logService";
import "./styles/sidebar.css";
import "./styles/dashboard.css";
import "./styles/clients.css";
import "./styles/documents.css";
import "./styles/print3d-calculator.css";
import "./styles/laser-calculator.css";
import "./styles/dtf-calculator.css";
import "./styles/uv-dtf-calculator.css";
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

const SESSION_KEY = "crm_current_user_v2";

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
      <Suspense
        fallback={
          <div className="auth">
            Chargement...
          </div>
        }
      >
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
  const [currentUser, setCurrentUser] = useState(() =>
    JSON.parse(localStorage.getItem(SESSION_KEY) || "null")
  );

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
  const [syncStatus, setSyncStatus] = useState("Connexion à Supabase...");
  const autoBackupStarted = useRef(false);

  const currentRole = userRole(currentUser?.email, data.users);
  const permissions = getPermissions(currentRole);

  useEffect(() => {
    initializeCloudData();
  }, []);

  useEffect(() => {
    saveData(data);
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
    if (page === "invoices") {
      initializeCloudData();
    }
  }, [page]);

  async function initializeCloudData() {
    try {
      if (!isSupabaseConfigured) {
        setSyncStatus("Mode local (cloud non configuré)");
        return;
      }

      const localData = normalizeData(loadData());
      const cloud = await loadSupabaseData({
        normalizeData,
        emptyData
      });

      if (cloud.hasCloudData) {
        const mergedData = normalizeData({
          ...cloud.data,
          users: dedupeItemsById(cloud.data.users || []),
          backups: dedupeItemsById(cloud.data.backups || []),
          logs: dedupeItemsById(cloud.data.logs || []),
        });

        setData(mergedData);
        flushSaveData();
        setSyncStatus("Synchronisé avec Supabase");
        showToast("Données chargées depuis Supabase", "success");
      } else if (hasLocalBusinessData(localData)) {
        await syncSupabaseData(localData, emptyData);
        setData(localData);
        flushSaveData();
        setSyncStatus("Données locales envoyées vers Supabase");
        showToast("Données locales synchronisées vers Supabase", "success");
      } else {
        await syncSupabaseData(emptyData, emptyData);
        setData(emptyData);
        flushSaveData();
        setSyncStatus("Supabase prêt");
      }

      setCloudAvailable(true);
    } catch (error) {
      console.error(error);
      setCloudAvailable(false);
      setSyncStatus("Mode local (cloud indisponible)");
      showToast("Sync cloud indisponible — données locales utilisées", "info");
    } finally {
      setLoading(false);
    }
  }

  async function updateData(next) {
    const normalized = normalizeData({
      ...next,
      users: dedupeItemsById(next.users || []),
      backups: dedupeItemsById(next.backups || []),
      logs: dedupeItemsById(next.logs || []),
    });

    const previous = data;

    setData(normalized);
    flushSaveData();

    if (!isSupabaseConfigured) {
      setSyncStatus("Mode local (cloud non configuré)");
      return;
    }

    try {
      setSyncStatus("Sauvegarde Supabase...");
      await syncSupabaseData(normalized, previous);
      flushSaveData();
      setSyncStatus("Synchronisé avec Supabase");
    } catch (error) {
      console.error(error);
      setSyncStatus("Erreur de sauvegarde Supabase");
      showToast("Erreur de sauvegarde Supabase", "error");
    }
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
    await supabase.auth.signOut();
    localStorage.removeItem(SESSION_KEY);
    setCurrentUser(null);
    setPage("dashboard");
  }

  if (loading) {
    return (
      <div className="auth">
        <div className="card auth-card">
          <h1>Chargement du CRM</h1>
          <p>{syncStatus}</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <AuthPage
        data={data}
        setData={updateData}
        setCurrentUser={setCurrentUser}
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
        permissions={permissions}
        logout={logout}
      />

      <main className="content">
        <Suspense
          fallback={
            <div className="auth">
              Chargement...
            </div>
          }
        >
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
