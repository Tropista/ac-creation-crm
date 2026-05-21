import {
  useEffect,
  useState,
  lazy,
  Suspense
} from "react";
import { supabase } from "./supabase";
import "./App.css";

import Sidebar from "./components/Sidebar";
import Clients from "./components/Clients";
import Products from "./components/Products";
import Documents from "./components/Documents";
import Dashboard from "./components/Dashboard";
import Settings from "./components/Settings";
import Categories from "./components/Categories";
import UsersAdmin from "./components/UsersAdmin";
import ActivityLogs from "./components/ActivityLogs";
import Print3DCalculator from "./components/Print3DCalculator";
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
  dedupeItemsById,
  hasLocalBusinessData
} from "./services/dataService";

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
  if (window.location.pathname === "/configurateur-tshirt") {
    return <PublicTshirtConfigurator />;
  }

  return <CrmApp />;
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
  const [data, setData] = useState(loadData);
  const [currentUser, setCurrentUser] = useState(() =>
    JSON.parse(localStorage.getItem(SESSION_KEY) || "null")
  );
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("Connexion à Supabase...");

  const currentRole = userRole(currentUser?.email, data.users);
  const permissions = getPermissions(currentRole);

  useEffect(() => {
    initializeCloudData();
  }, []);

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (page === "invoices") {
      initializeCloudData();
    }
  }, [page]);

  async function initializeCloudData() {
    try {
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
        saveData(mergedData);
        setSyncStatus("Synchronisé avec Supabase");
      } else if (hasLocalBusinessData(localData)) {
        await syncSupabaseData(localData, emptyData);
        setData(localData);
        setSyncStatus("Données locales envoyées vers Supabase");
      } else {
        await syncSupabaseData(emptyData, emptyData);
        setData(emptyData);
        setSyncStatus("Supabase prêt");
      }
    } catch (error) {
      console.error(error);
      setSyncStatus("Erreur Supabase : vérifie les tables et les clés API");
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
    saveData(normalized);

    try {
      setSyncStatus("Sauvegarde Supabase...");
      await syncSupabaseData(normalized, previous);
      setSyncStatus("Synchronisé avec Supabase");
    } catch (error) {
      console.error(error);
      setSyncStatus("Erreur de sauvegarde Supabase");
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
    if (!currentUser || !isAllowedUser(currentUser.email, data.users)) return;

    const lastBackupAt = localStorage.getItem("crm_last_auto_backup_at");
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;

    if (!lastBackupAt || now - Number(lastBackupAt) > twelveHours) {
      localStorage.setItem("crm_last_auto_backup_at", String(now));

      createCloudBackup({
        data,
        label: "Sauvegarde automatique",
        setData,
        setSyncStatus,
        currentUser,
        currentRole,
        logActivity: handleLogActivity,
      });
    }
  }, [currentUser?.email]);

  useEffect(() => {
    if (currentUser && page !== "print3dcalc" && !canAccessPage(currentRole, page)) {
      setPage("dashboard");
    }
  }, [currentUser, currentRole, page]);

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
        page={page}
        setPage={setPage}
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
          {page !== "print3dcalc" && !canAccessPage(currentRole, page) && (
            <AccessDenied
              user={currentUser}
              logout={logout}
            />
          )}

          {page === "dashboard" && canAccessPage(currentRole, "dashboard") && (
            <Dashboard
              data={data}
              currentRole={currentRole}
            />
          )}

          {page === "clients" && canAccessPage(currentRole, "clients") && (
            <Clients
              data={data}
              setData={updateData}
              currentRole={currentRole}
              logActivity={handleLogActivity}
              setPage={setPage}
            />
          )}

          {page === "products" && canAccessPage(currentRole, "products") && (
            <Products
              data={data}
              setData={updateData}
              currentRole={currentRole}
              logActivity={handleLogActivity}
            />
          )}

          {page === "labels" && canAccessPage(currentRole, "labels") && (
            <BarcodeLabels
              data={data}
            />
          )}

          {page === "scan" && canAccessPage(currentRole, "scan") && (
            <ProductScan
              data={data}
              setData={updateData}
              logActivity={handleLogActivity}
            />
          )}

          {page === "categories" && canAccessPage(currentRole, "categories") && (
            <Categories
              data={data}
              setData={updateData}
              currentRole={currentRole}
              logActivity={handleLogActivity}
            />
          )}

          {page === "quotes" && canAccessPage(currentRole, "quotes") && (
            <Documents
              type="quote"
              data={data}
              setData={updateData}
              currentRole={currentRole}
              logActivity={handleLogActivity}
            />
          )}

          {page === "invoices" && canAccessPage(currentRole, "invoices") && (
            <Documents
              type="invoice"
              data={data}
              setData={updateData}
              currentRole={currentRole}
              logActivity={handleLogActivity}
            />
          )}

          {page === "users" && permissions.canManageUsers && (
            <UsersAdmin
              data={data}
              setData={updateData}
              logActivity={handleLogActivity}
            />
          )}

          {page === "settings" && permissions.canEditSettings && (
            <Settings
              data={data}
              setData={updateData}
              logActivity={handleLogActivity}
            />
          )}

          {page === "import" && permissions.canImport && (
            <ExcelImport
              data={data}
              setData={updateData}
              logActivity={handleLogActivity}
            />
          )}

          {page === "backups" && permissions.canManageUsers && (
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
          )}

          {page === "logs" && canAccessPage(currentRole, "logs") && (
            <ActivityLogs
              data={data}
            />
          )}

          {page === "print3dcalc" && (
            <Print3DCalculator />
          )}

          {page === "vue3d" && <Vue3D />}
          {page === "tshirt3d" && <Vue3DTshirt />}
          {page === "banque" && <Banque />}
        </Suspense>
      </main>
    </div>
  );
}
