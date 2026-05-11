import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import "./App.css";

const STORAGE_KEY = "crm_local_data_v2";
const SESSION_KEY = "crm_current_user_v2";

const ADMIN_EMAILS = ["ac.creation.officiel@gmail.com"];

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isAdminEmail(email) {
  return ADMIN_EMAILS.map(normalizeEmail).includes(normalizeEmail(email));
}

function isAllowedUser(email, users = []) {
  const normalizedEmail = normalizeEmail(email);
  return (
    isAdminEmail(normalizedEmail) ||
    (users || []).some((user) =>
      normalizeEmail(user.email) === normalizedEmail &&
      user.status !== "Désactivé"
    )
  );
}

function userRole(email, users = []) {
  if (isAdminEmail(email)) return "Admin";
  const found = (users || []).find((user) => normalizeEmail(user.email) === normalizeEmail(email));
  return found?.role || "Utilisateur";
}

const ROLE_PERMISSIONS = {
  Admin: {
    pages: ["dashboard", "clients", "products", "categories", "quotes", "invoices", "users", "settings", "import", "backups"],
    canDelete: true,
    canEditSettings: true,
    canManageUsers: true,
    canImport: true,
  },
  Employé: {
    pages: ["dashboard", "clients", "quotes", "invoices"],
    canDelete: false,
    canEditSettings: false,
    canManageUsers: false,
    canImport: false,
  },
  Comptable: {
    pages: ["dashboard", "invoices"],
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

function getPermissions(role) {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.Utilisateur;
}

function canAccessPage(role, page) {
  return getPermissions(role).pages.includes(page);
}

function canDeleteData(role) {
  return getPermissions(role).canDelete;
}



const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

const emptyData = {
  users: [],
  settings: {
    companyName: "Mon Entreprise",
    companyEmail: "contact@monentreprise.com",
    companyPhone: "+352 00 00 00 00",
    companyAddress: "Adresse de l'entreprise",
    vatNumber: "LU00000000",
    logoUrl: "",
    paymentTerms: "Conditions de paiement : virement bancaire ou carte de crédit",
    bankInfo: "Informations bancaires : Tout paiement au nom de votre entreprise\nNom de la banque : BCEE\nBIC : BCEELULL\nIBAN : LU00 0000 0000 0000 0000\nVeuillez indiquer le numéro de facture dans votre communication",
    taxRate: 17,
  },
  clients: [],
  quotes: [],
  invoices: [],
  products: [],
  categories: [],
  backups: [],
};

function normalizeData(data) {
  return {
    ...emptyData,
    ...data,
    settings: { ...emptyData.settings, ...(data?.settings || {}) },
    users: data?.users || [],
    clients: data?.clients || [],
    quotes: data?.quotes || [],
    invoices: data?.invoices || [],
    products: data?.products || [],
    categories: data?.categories || [],
    backups: data?.backups || [],
  };
}

function loadData() {
  try {
    return normalizeData(JSON.parse(localStorage.getItem(STORAGE_KEY)) || emptyData);
  } catch {
    return emptyData;
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function createBackupSnapshot(data, label = "Sauvegarde automatique") {
  const safeData = normalizeData(data);
  return {
    id: uid(),
    label,
    createdAt: new Date().toISOString(),
    clientsCount: safeData.clients.length,
    productsCount: safeData.products.length,
    invoicesCount: safeData.invoices.length,
    quotesCount: safeData.quotes.length,
    data: {
      ...safeData,
      backups: [],
    },
  };
}

function pruneBackups(backups, max = 12) {
  return [...(backups || [])]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, max);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


function hasLocalBusinessData(data) {
  return Boolean(
    data.clients?.length ||
    data.products?.length ||
    data.categories?.length ||
    data.quotes?.length ||
    data.invoices?.length
  );
}

function rowsToItems(rows) {
  return (rows || []).map((row) => ({ id: row.id, ...(row.data || {}) }));
}

async function loadSupabaseData() {
  const [settingsRes, clientsRes, productsRes, categoriesRes, quotesRes, invoicesRes] = await Promise.all([
    supabase.from("settings").select("id,data").eq("id", "main").maybeSingle(),
    supabase.from("clients").select("id,data").order("created_at", { ascending: true }),
    supabase.from("products").select("id,data").order("created_at", { ascending: true }),
    supabase.from("categories").select("id,data").order("created_at", { ascending: true }),
    supabase.from("quotes").select("id,data").order("created_at", { ascending: true }),
    supabase.from("invoices").select("id,data").order("created_at", { ascending: true }),
  ]);

  const errors = [settingsRes, clientsRes, productsRes, categoriesRes, quotesRes, invoicesRes]
    .map((res) => res.error)
    .filter(Boolean);

  if (errors.length) {
    console.error("Erreur Supabase :", errors);
    throw errors[0];
  }

  const cloudData = normalizeData({
    settings: settingsRes.data?.data || emptyData.settings,
    clients: rowsToItems(clientsRes.data),
    products: rowsToItems(productsRes.data),
    categories: rowsToItems(categoriesRes.data),
    quotes: rowsToItems(quotesRes.data),
    invoices: rowsToItems(invoicesRes.data),
  });

  return {
    data: cloudData,
    hasCloudData: Boolean(
      settingsRes.data ||
      clientsRes.data?.length ||
      productsRes.data?.length ||
      categoriesRes.data?.length ||
      quotesRes.data?.length ||
      invoicesRes.data?.length
    ),
  };
}

async function syncTable(tableName, nextItems, previousItems) {
  const next = nextItems || [];
  const previous = previousItems || [];

  if (next.length) {
    const payload = next.map((item) => ({
      id: item.id,
      data: item,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from(tableName).upsert(payload, { onConflict: "id" });
    if (error) throw error;
  }

  const nextIds = new Set(next.map((item) => item.id));
  const deletedIds = previous.map((item) => item.id).filter((id) => !nextIds.has(id));

  if (deletedIds.length) {
    const { error } = await supabase.from(tableName).delete().in("id", deletedIds);
    if (error) throw error;
  }
}

async function syncSupabaseData(nextData, previousData) {
  const next = normalizeData(nextData);
  const previous = normalizeData(previousData);

  const { error: settingsError } = await supabase
    .from("settings")
    .upsert({ id: "main", data: next.settings, updated_at: new Date().toISOString() }, { onConflict: "id" });

  if (settingsError) throw settingsError;

  await Promise.all([
    syncTable("clients", next.clients, previous.clients),
    syncTable("products", next.products, previous.products),
    syncTable("categories", next.categories, previous.categories),
    syncTable("quotes", next.quotes, previous.quotes),
    syncTable("invoices", next.invoices, previous.invoices),
  ]);
}

function money(value) {
  return Number(value || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function today() {
  return new Date().toLocaleDateString("fr-FR");
}

function clientName(data, id) {
  return data.clients.find((c) => c.id === id)?.name || "Client supprimé";
}

function statusClass(status) {
  return "badge " + String(status || "").toLowerCase().replaceAll(" ", "-").replaceAll("é", "e");
}

function invoicePaidAmount(invoice) {
  const historyTotal = (invoice.paymentHistory || []).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  return Number(invoice.paidAmount ?? historyTotal ?? 0);
}

function invoiceRemainingAmount(invoice) {
  return Math.max(0, Number(invoice.totalTTC || 0) - invoicePaidAmount(invoice));
}

function invoicePaymentStatus(invoice) {
  const paid = invoicePaidAmount(invoice);
  const total = Number(invoice.totalTTC || 0);
  if (total > 0 && paid >= total) return "Payée";
  if (paid > 0) return "Partiellement payée";
  return invoice.status || "Non payée";
}

function stockStatus(product) {
  if (product.trackStock === false) return { label: "Non suivi", className: "neutral", level: 100 };
  const stock = Number(product.stock || 0);
  const min = Number(product.stockMin || 0);
  if (stock <= 0) return { label: "Rupture", className: "danger", level: 0 };
  if (min > 0 && stock <= min) return { label: "Stock faible", className: "warning", level: 25 };
  return { label: "Disponible", className: "success", level: 100 };
}

function buildStockMovement(type, quantity, reason, documentNumber = "") {
  return {
    id: uid(),
    type,
    quantity: Number(quantity || 0),
    reason,
    documentNumber,
    createdAt: new Date().toISOString(),
  };
}

function applyStockDelta(products, lines = [], direction = -1, reason = "Mouvement stock", documentNumber = "") {
  return (products || []).map((product) => {
    const quantity = (lines || [])
      .filter((line) => String(line.productId || "") === String(product.id || ""))
      .reduce((sum, line) => sum + Number(line.quantity || 0), 0);

    if (!quantity || product.trackStock === false) return product;

    const movementQuantity = quantity * direction;
    const nextStock = Math.max(0, Number(product.stock || 0) + movementQuantity);

    return {
      ...product,
      stock: nextStock,
      stockHistory: [
        buildStockMovement(direction < 0 ? "Sortie" : "Entrée", Math.abs(quantity), reason, documentNumber),
        ...(product.stockHistory || []),
      ].slice(0, 30),
    };
  });
}

export default function App() {
  const [data, setData] = useState(loadData);
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem(SESSION_KEY) || "null"));
  const [page, setPage] = useState("dashboard");
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("Connexion à Supabase...");

  const isAdmin = isAdminEmail(currentUser?.email);
  const currentRole = userRole(currentUser?.email, data.users);
  const permissions = getPermissions(currentRole);

  useEffect(() => {
    initializeCloudData();
  }, []);

  useEffect(() => saveData(data), [data]);

  async function initializeCloudData() {
    try {
      const localData = normalizeData(loadData());
      const cloud = await loadSupabaseData();

      if (cloud.hasCloudData) {
        setData(cloud.data);
        saveData(cloud.data);
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
    const normalized = normalizeData(next);
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

  async function createCloudBackup(label = "Sauvegarde manuelle") {
    const backup = createBackupSnapshot(data, label);
    const next = normalizeData({
      ...data,
      backups: pruneBackups([backup, ...(data.backups || [])], 12),
    });

    setData(next);
    saveData(next);

    try {
      setSyncStatus("Création sauvegarde cloud...");
      await syncSupabaseData(next, data);
      setSyncStatus("Sauvegarde cloud créée");
    } catch (error) {
      console.error(error);
      setSyncStatus("Erreur sauvegarde cloud");
      alert("Erreur pendant la sauvegarde cloud.");
    }
  }

  useEffect(() => {
    if (!currentUser || !isAllowedUser(currentUser.email, data.users)) return;

    const lastBackupAt = localStorage.getItem("crm_last_auto_backup_at");
    const now = Date.now();
    const twelveHours = 12 * 60 * 60 * 1000;

    if (!lastBackupAt || now - Number(lastBackupAt) > twelveHours) {
      localStorage.setItem("crm_last_auto_backup_at", String(now));
      createCloudBackup("Sauvegarde automatique");
    }
  }, [currentUser?.email]);

  useEffect(() => {
    if (currentUser && !canAccessPage(currentRole, page)) {
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
    return <AuthPage data={data} setData={updateData} setCurrentUser={setCurrentUser} />;
  }

  if (!isAllowedUser(currentUser.email, data.users)) {
    return (
      <AccessDenied user={currentUser} logout={logout} />
    );
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>{data.settings.companyName}</h1>
        <p className="user">Connecté : {currentUser.name}<br /><span>{currentRole}</span></p>
        <p className="cloud-status">☁️ {syncStatus}</p>
        {permissions.pages.includes("dashboard") && <button onClick={() => setPage("dashboard")}>📊 Tableau de bord</button>}
        {permissions.pages.includes("clients") && <button onClick={() => setPage("clients")}>👥 Clients</button>}
        {permissions.pages.includes("products") && <button onClick={() => setPage("products")}>📦 Produits</button>}
        {permissions.pages.includes("categories") && <button onClick={() => setPage("categories")}>🏷️ Catégories</button>}
        {permissions.pages.includes("quotes") && <button onClick={() => setPage("quotes")}>🧾 Devis</button>}
        {permissions.pages.includes("invoices") && <button onClick={() => setPage("invoices")}>💶 Factures</button>}
        {permissions.canManageUsers && <button onClick={() => setPage("users")}>🔐 Utilisateurs</button>}
        {permissions.canEditSettings && <button onClick={() => setPage("settings")}>⚙️ Paramètres</button>}
        {permissions.canImport && <button onClick={() => setPage("import")}>📥 Import Excel</button>}
        {permissions.canManageUsers && <button onClick={() => setPage("backups")}>💾 Sauvegardes</button>}
        <button className="danger" onClick={logout}>Déconnexion</button>
      </aside>

      <main className="content">
        {!canAccessPage(currentRole, page) && <AccessDenied user={currentUser} logout={logout} />}
        {page === "dashboard" && canAccessPage(currentRole, "dashboard") && <Dashboard data={data} currentRole={currentRole} />}
        {page === "clients" && canAccessPage(currentRole, "clients") && <Clients data={data} setData={updateData} currentRole={currentRole} />}
        {page === "products" && canAccessPage(currentRole, "products") && <Products data={data} setData={updateData} currentRole={currentRole} />}
        {page === "categories" && canAccessPage(currentRole, "categories") && <Categories data={data} setData={updateData} currentRole={currentRole} />}
        {page === "quotes" && canAccessPage(currentRole, "quotes") && <Documents type="quote" data={data} setData={updateData} currentRole={currentRole} />}
        {page === "invoices" && canAccessPage(currentRole, "invoices") && <Documents type="invoice" data={data} setData={updateData} currentRole={currentRole} />}
        {page === "users" && permissions.canManageUsers && <UsersAdmin data={data} setData={updateData} />}
        {page === "settings" && permissions.canEditSettings && <Settings data={data} setData={updateData} />}
        {page === "import" && permissions.canImport && <ExcelImport data={data} setData={updateData} />}
        {page === "backups" && permissions.canManageUsers && <Backups data={data} setData={updateData} createCloudBackup={createCloudBackup} />}
      </main>
    </div>
  );
}

function AccessDenied({ user, logout }) {
  return (
    <div className="modern-auth">
      <div className="modern-auth-card admin-lock-card">
        <div className="lock-icon">⛔</div>
        <h2>Accès non autorisé</h2>
        <p className="auth-subtitle">
          Le compte {user?.email} existe dans Supabase, mais il n’est pas autorisé dans ce CRM.
        </p>
        <p className="admin-help">
          Un administrateur doit ajouter cet email dans la page Utilisateurs.
        </p>
        <button className="modern-primary" type="button" onClick={logout}>
          Se déconnecter <span>→</span>
        </button>
      </div>
    </div>
  );
}

function AuthPage({ data, setData, setCurrentUser }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  async function login(e) {
    e.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Indique ton email et ton mot de passe.");
      return;
    }

    const email = normalizeEmail(form.email);

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password: form.password,
    });

    if (error || !authData.user) {
      setError("Email ou mot de passe incorrect.");
      return;
    }

    if (!isAllowedUser(authData.user.email, data.users)) {
      await supabase.auth.signOut();
      setError("Compte non autorisé. Demande à l’administrateur d’ajouter ton email.");
      return;
    }

    const session = {
      id: authData.user.id,
      name: authData.user.user_metadata?.name || authData.user.email,
      email: authData.user.email,
      role: userRole(authData.user.email, data.users),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setCurrentUser(session);
  }

  return (
    <div className="modern-auth">
      <div className="auth-orb orb-one"></div>
      <div className="auth-orb orb-two"></div>

      <section className="auth-showcase">
        <div className="brand-icon">📊</div>
        <h1>
          Mon <span>CRM</span>
        </h1>
        <p className="brand-text">
          Accès privé réservé aux utilisateurs autorisés par l’administrateur.
        </p>

        <div className="auth-features">
          <div className="feature-item">
            <div>🔐</div>
            <span>
              <strong>Accès sécurisé</strong>
              L’inscription publique est désactivée.
            </span>
          </div>

          <div className="feature-item">
            <div>👑</div>
            <span>
              <strong>Mode admin</strong>
              Seul l’admin peut autoriser de nouveaux utilisateurs.
            </span>
          </div>

          <div className="feature-item">
            <div>☁️</div>
            <span>
              <strong>Supabase</strong>
              Données synchronisées dans le cloud.
            </span>
          </div>
        </div>
      </section>

      <form className="modern-auth-card" onSubmit={login}>
        <div className="lock-icon">🔒</div>

        <h2>Bienvenue !</h2>
        <p className="auth-subtitle">Connectez-vous à votre espace privé</p>

        <label className="modern-field">
          <span>✉️</span>
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </label>

        <label className="modern-field">
          <span>🔑</span>
          <input
            placeholder="Mot de passe"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </label>

        {error && <p className="modern-error">{error}</p>}

        <button className="modern-primary" type="submit">
          Se connecter
          <span>→</span>
        </button>

        <p className="auth-note">🛡️ Compte requis et validé par l’administrateur.</p>
      </form>
    </div>
  );
}

function Dashboard({ data }) {
  const invoices = data.invoices || [];
  const quotes = data.quotes || [];
  const clients = data.clients || [];
  const products = data.products || [];
  const categories = data.categories || [];

  const totalInvoices = invoices.reduce((sum, inv) => sum + Number(inv.totalTTC || 0), 0);
  const paidInvoices = invoices.reduce((sum, inv) => sum + invoicePaidAmount(inv), 0);
  const unpaidInvoices = invoices.reduce((sum, inv) => sum + invoiceRemainingAmount(inv), 0);
  const unpaidCount = invoices.filter((i) => invoiceRemainingAmount(i) > 0).length;
  const acceptedQuotes = quotes.filter((q) => q.status === "Accepté").length;

  const invoiceLines = invoices.flatMap((invoice) =>
    (invoice.lines || []).map((line) => ({
      ...line,
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      clientId: invoice.clientId,
      date: invoice.date,
      status: invoice.status,
    }))
  );

  const productStats = products
    .map((product) => {
      const lines = invoiceLines.filter((line) => String(line.productId) === String(product.id));
      const quantity = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
      const revenue = lines.reduce((sum, line) => sum + Number(line.totalHT || 0), 0);
      return { ...product, quantity, revenue };
    })
    .filter((p) => p.quantity > 0 || p.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const clientStats = clients
    .map((client) => {
      const clientInvoices = invoices.filter((invoice) => invoice.clientId === client.id);
      const total = clientInvoices.reduce((sum, inv) => sum + Number(inv.totalTTC || 0), 0);
      return { ...client, invoiceCount: clientInvoices.length, total };
    })
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const categoryStats = categories
    .map((category) => {
      const categoryName = category.name || category.label || category.category || "";
      const normalizedCategoryName = String(categoryName).trim().toLowerCase();

      const categoryProducts = products.filter((p) =>
        String(p.categoryId || "") === String(category.id || "") ||
        String(p.category || "").trim().toLowerCase() === normalizedCategoryName
      );

      const categoryProductIds = categoryProducts.map((p) => String(p.id));

      const lines = invoiceLines.filter((line) => {
        const lineProductId = String(line.productId || "");
        const lineCategory = String(line.category || "").trim().toLowerCase();

        return (
          categoryProductIds.includes(lineProductId) ||
          lineCategory === normalizedCategoryName
        );
      });

      const revenue = lines.reduce((sum, line) => sum + Number(line.totalHT || line.subtotal || 0), 0);
      const quantity = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);

      return { ...category, name: categoryName || "Sans catégorie", revenue, quantity };
    })
    .filter((c) => c.revenue > 0 || c.quantity > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const maxProductRevenue = Math.max(...productStats.map((p) => p.revenue), 1);
  const maxClientRevenue = Math.max(...clientStats.map((c) => c.total), 1);
  const maxCategoryRevenue = Math.max(...categoryStats.map((c) => c.revenue), 1);

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Tableau de bord</h2>
          <p>Statistiques de ventes, clients, produits et catégories.</p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><span>Clients</span><strong>{clients.length}</strong></div>
        <div className="card stat"><span>Produits</span><strong>{products.length}</strong></div>
        <div className="card stat"><span>Alertes stock</span><strong>{products.filter((p) => stockStatus(p).className !== "success" && p.trackStock !== false).length}</strong></div>
        <div className="card stat"><span>Devis</span><strong>{quotes.length}</strong></div>
        <div className="card stat"><span>Devis acceptés</span><strong>{acceptedQuotes}</strong></div>
        <div className="card stat"><span>Factures</span><strong>{invoices.length}</strong></div>
        <div className="card stat"><span>Non payées</span><strong>{unpaidCount}</strong></div>
        <div className="card stat"><span>Total facturé</span><strong>{money(totalInvoices)}</strong></div>
        <div className="card stat"><span>Payé</span><strong>{money(paidInvoices)}</strong></div>
        <div className="card stat"><span>À encaisser</span><strong>{money(unpaidInvoices)}</strong></div>
      </div>

      <div className="dashboard-grid">
        <div className="card">
          <h3>Top produits vendus</h3>
          {productStats.length === 0 ? (
            <p className="muted">Aucune vente produit pour le moment.</p>
          ) : (
            <div className="bar-list">
              {productStats.map((product) => (
                <div className="bar-row" key={product.id}>
                  <div className="bar-info">
                    <strong>{product.name}</strong>
                    <span>{product.quantity} vendu(s) — {money(product.revenue)} HT</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(6, (product.revenue / maxProductRevenue) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Meilleurs clients</h3>
          {clientStats.length === 0 ? (
            <p className="muted">Aucune facture client pour le moment.</p>
          ) : (
            <div className="bar-list">
              {clientStats.map((client) => (
                <div className="bar-row" key={client.id}>
                  <div className="bar-info">
                    <strong>{client.name}</strong>
                    <span>{client.invoiceCount} facture(s) — {money(client.total)} TTC</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(6, (client.total / maxClientRevenue) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Ventes par catégorie</h3>
          {categoryStats.length === 0 ? (
            <p className="muted">Aucune vente par catégorie pour le moment.</p>
          ) : (
            <div className="bar-list">
              {categoryStats.map((category) => (
                <div className="bar-row" key={category.id}>
                  <div className="bar-info">
                    <strong>{category.name}</strong>
                    <span>{category.quantity} article(s) — {money(category.revenue)} HT</span>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.max(6, (category.revenue / maxCategoryRevenue) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h3>Dernières factures</h3>
          {invoices.length === 0 ? (
            <p className="muted">Aucune facture pour le moment.</p>
          ) : (
            <div className="table compact-table">
              <table>
                <thead>
                  <tr><th>N°</th><th>Client</th><th>Total TTC</th><th>Statut</th></tr>
                </thead>
                <tbody>
                  {invoices.slice(-6).reverse().map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.number}</td>
                      <td>{clientName(data, invoice.clientId)}</td>
                      <td>{money(invoice.totalTTC)}</td>
                      <td><span className={statusClass(invoice.status)}>{invoice.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}



function Backups({ data, setData, createCloudBackup }) {
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const backups = pruneBackups(data.backups || [], 50);
  const selectedBackup = backups.find((backup) => backup.id === selectedBackupId);

  function exportFullJson() {
    const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadJson(filename, normalizeData({ ...data, backups: data.backups || [] }));
  }

  async function restoreBackup() {
    if (!selectedBackup) return alert("Choisis une sauvegarde à restaurer.");
    if (!confirm("Restaurer cette sauvegarde ? Les données actuelles seront remplacées.")) return;

    const restored = normalizeData({
      ...selectedBackup.data,
      backups: pruneBackups([
        createBackupSnapshot(data, "Avant restauration"),
        ...(data.backups || []),
      ], 12),
    });

    await setData(restored);
    alert("Sauvegarde restaurée.");
  }

  function deleteBackup(id) {
    if (!confirm("Supprimer cette sauvegarde ?")) return;
    setData({
      ...data,
      backups: (data.backups || []).filter((backup) => backup.id !== id),
    });
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Sauvegardes</h2>
          <p>Sauvegarde automatique cloud et restauration complète du CRM.</p>
        </div>
      </div>

      <div className="backup-grid">
        <div className="card backup-card">
          <h3>Créer une sauvegarde</h3>
          <p className="muted">
            Une sauvegarde automatique est créée environ toutes les 12 heures.
          </p>
          <button className="primary" onClick={() => createCloudBackup("Sauvegarde manuelle")}>
            💾 Créer une sauvegarde cloud
          </button>
          <button onClick={exportFullJson}>
            ⬇️ Export JSON complet
          </button>
        </div>

        <div className="card backup-card">
          <h3>Restaurer une sauvegarde</h3>
          <select value={selectedBackupId} onChange={(e) => setSelectedBackupId(e.target.value)}>
            <option value="">Choisir une sauvegarde</option>
            {backups.map((backup) => (
              <option key={backup.id} value={backup.id}>
                {new Date(backup.createdAt).toLocaleString()} — {backup.label}
              </option>
            ))}
          </select>
          <button className="danger" onClick={restoreBackup}>
            Restaurer la sauvegarde sélectionnée
          </button>
        </div>
      </div>

      <div className="table card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Clients</th>
              <th>Produits</th>
              <th>Factures</th>
              <th>Devis</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.map((backup) => (
              <tr key={backup.id}>
                <td>{new Date(backup.createdAt).toLocaleString()}</td>
                <td>{backup.label}</td>
                <td>{backup.clientsCount}</td>
                <td>{backup.productsCount}</td>
                <td>{backup.invoicesCount}</td>
                <td>{backup.quotesCount}</td>
                <td>
                  <button onClick={() => downloadJson(`crm-backup-${backup.createdAt.slice(0,10)}.json`, backup.data)}>
                    Exporter
                  </button>
                  <button className="danger" onClick={() => deleteBackup(backup.id)}>
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}

            {backups.length === 0 && (
              <tr>
                <td colSpan="7" className="muted">Aucune sauvegarde créée pour le moment.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UsersAdmin({ data, setData }) {
  const [form, setForm] = useState({ name: "", email: "", role: "Utilisateur", status: "Actif" });
  const users = data.users || [];

  function reset() {
    setForm({ name: "", email: "", role: "Utilisateur", status: "Actif" });
  }

  function addUser(e) {
    e.preventDefault();
    const email = normalizeEmail(form.email);

    if (!email) return alert("Email obligatoire.");
    if (isAdminEmail(email)) return alert("Cet email est déjà administrateur principal.");
    if (users.some((user) => normalizeEmail(user.email) === email)) {
      return alert("Cet utilisateur existe déjà.");
    }

    const nextUser = {
      id: uid(),
      createdAt: today(),
      name: form.name || email,
      email,
      role: form.role,
      status: form.status,
    };

    setData({ ...data, users: [...users, nextUser] });
    reset();
  }

  function updateUser(id, changes) {
    setData({
      ...data,
      users: users.map((user) => user.id === id ? { ...user, ...changes } : user),
    });
  }

  function removeUser(id) {
    if (!confirm("Retirer cet accès utilisateur ?")) return;
    setData({ ...data, users: users.filter((user) => user.id !== id) });
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Utilisateurs</h2>
          <p>Autorise les comptes qui peuvent accéder au CRM.</p>
        </div>
      </div>

      <div className="card admin-warning">
        <strong>Important :</strong>
        <p>
          L’inscription publique est désactivée. Pour créer un nouveau compte, ajoute d’abord
          l’utilisateur ici, puis crée son compte dans Supabase → Authentication → Users.
        </p>
      </div>

      <div className="card role-card">
        <h3>Permissions</h3>
        <p><span className="role-badge admin">👑 Admin</span> Accès complet, suppression, paramètres, import et utilisateurs.</p>
        <p><span className="role-badge employe">👨‍💼 Employé</span> Dashboard, clients, devis et factures. Pas de suppression.</p>
        <p><span className="role-badge comptable">💰 Comptable</span> Dashboard et factures. Pas de suppression.</p>
      </div>

      <form className="card form-grid" onSubmit={addUser}>
        <input
          placeholder="Nom utilisateur"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Email autorisé *"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option>Employé</option>
          <option>Comptable</option>
          <option>Admin</option>
          <option>Utilisateur</option>
        </select>
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option>Actif</option>
          <option>Désactivé</option>
        </select>
        <button className="primary">Autoriser l’utilisateur</button>
      </form>

      <div className="table card">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>AC Creation</td>
              <td>ac.creation.officiel@gmail.com</td>
              <td><span className="badge vip">Admin principal</span></td>
              <td><span className="badge client">Actif</span></td>
              <td>-</td>
            </tr>

            {users.map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.email}</td>
                <td>
                  <select value={user.role || "Utilisateur"} onChange={(e) => updateUser(user.id, { role: e.target.value })}>
                    <option>Employé</option>
                    <option>Comptable</option>
                    <option>Admin</option>
                    <option>Utilisateur</option>
                  </select>
                </td>
                <td>
                  <select value={user.status || "Actif"} onChange={(e) => updateUser(user.id, { status: e.target.value })}>
                    <option>Actif</option>
                    <option>Désactivé</option>
                  </select>
                </td>
                <td>
                  <button className="danger" onClick={() => removeUser(user.id)}>Retirer accès</button>
                </td>
              </tr>
            ))}

            {users.length === 0 && (
              <tr>
                <td colSpan="5" className="muted">Aucun utilisateur ajouté pour le moment.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Settings({ data, setData }) {
  const [form, setForm] = useState(data.settings);

  function submit(e) {
    e.preventDefault();
    setData({ ...data, settings: { ...form, taxRate: Number(form.taxRate || 0) } });
    alert("Paramètres sauvegardés.");
  }

  return (
    <section>
      <div className="page-header"><div><h2>Paramètres</h2><p>Infos utilisées sur les devis et factures.</p></div></div>
      <form className="card form-grid" onSubmit={submit}>
        <input placeholder="Nom entreprise" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        <input placeholder="Email entreprise" value={form.companyEmail} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} />
        <input placeholder="Téléphone entreprise" value={form.companyPhone} onChange={(e) => setForm({ ...form, companyPhone: e.target.value })} />
        <input placeholder="Adresse entreprise" value={form.companyAddress} onChange={(e) => setForm({ ...form, companyAddress: e.target.value })} />
        <input placeholder="N° TVA" value={form.vatNumber} onChange={(e) => setForm({ ...form, vatNumber: e.target.value })} />
        <input placeholder="URL du logo" value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} />
        <input type="number" min="0" placeholder="TVA %" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: e.target.value })} />
        <textarea placeholder="Conditions de paiement" value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })} />
        <textarea placeholder="Informations bancaires" value={form.bankInfo} onChange={(e) => setForm({ ...form, bankInfo: e.target.value })} />
        <button className="primary">Sauvegarder</button>
      </form>
    </section>
  );
}


function PaginationControls({ page, totalPages, onPageChange, totalItems, perPage }) {
  if (totalPages <= 1) return null;

  const start = (page - 1) * perPage + 1;
  const end = Math.min(page * perPage, totalItems);

  return (
    <div className="pagination-controls">
      <span>
        {start}-{end} sur {totalItems}
      </span>

      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPageChange(Math.max(1, page - 1))}
      >
        ← Précédent
      </button>

      <strong>
        Page {page} / {totalPages}
      </strong>

      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPageChange(Math.min(totalPages, page + 1))}
      >
        Suivant →
      </button>
    </div>
  );
}

function Clients({ data, setData, currentRole = 'Admin' }) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("nameAsc");
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", address: "", status: "Prospect", notes: "" });

  const itemsPerPage = 10;
  const clients = (data.clients || [])
    .filter((c) => [c.name, c.email, c.phone, c.company, c.status, c.address].join(" ").toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "nameAsc") return String(a.name || "").localeCompare(String(b.name || ""));
      if (sortBy === "nameDesc") return String(b.name || "").localeCompare(String(a.name || ""));
      if (sortBy === "dateDesc") return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      if (sortBy === "dateAsc") return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      if (sortBy === "status") return String(a.status || "").localeCompare(String(b.status || ""));
      return 0;
    });
  const clientTotalPages = Math.max(1, Math.ceil(clients.length / itemsPerPage));
  const clientPage = Math.min(currentPage, clientTotalPages);
  const paginatedClients = clients.slice((clientPage - 1) * itemsPerPage, clientPage * itemsPerPage);
  const selectedClient = (data.clients || []).find((c) => c.id === selectedClientId);
  const selectedClientInvoices = selectedClient
    ? (data.invoices || [])
        .filter((invoice) => String(invoice.clientId) === String(selectedClient.id))
        .sort((a, b) => new Date(b.createdAt || b.date || 0) - new Date(a.createdAt || a.date || 0))
    : [];
  const selectedClientInvoiceTotal = selectedClientInvoices.reduce((sum, invoice) => sum + Number(invoice.totalTTC || 0), 0);

  function reset() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", company: "", address: "", status: "Prospect", notes: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name) return alert("Le nom du client est obligatoire.");
    if (editing) {
      setData({ ...data, clients: data.paginatedClients.map((c) => (c.id === editing ? { ...c, ...form } : c)) });
    } else {
      const client = { id: uid(), createdAt: today(), ...form };
      setData({ ...data, clients: [...data.clients, client] });
      setSelectedClientId(client.id);
    }
    reset();
  }

  function edit(client) {
    setEditing(client.id);
    setForm({
      name: client.name || "", email: client.email || "", phone: client.phone || "",
      company: client.company || "", address: client.address || "",
      status: client.status || "Prospect", notes: client.notes || "",
    });
  }

  function remove(id) {
    if (!canDeleteData(currentRole)) return alert("Ton rôle ne permet pas de supprimer.");
    if (!confirm("Supprimer ce client ?")) return;
    setData({ ...data, clients: data.clients.filter((c) => c.id !== id) });
    if (selectedClientId === id) setSelectedClientId(null);
  }

  return (
    <section className="clients-page">
      <div className="page-header"><div><h2>Clients</h2><p>Ajoute tes prospects et clients.</p></div></div>

      <form className="card form-grid" onSubmit={submit}>
        <input placeholder="Nom client *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Téléphone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input placeholder="Société" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        <input placeholder="Adresse" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          <option>Prospect</option><option>Client</option><option>VIP</option><option>Inactif</option>
        </select>
        <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <button className="primary">{editing ? "Modifier" : "Ajouter"}</button>
        {editing && <button type="button" onClick={reset}>Annuler</button>}
      </form>

      <div className="clients-toolbar">
        <input className="search" placeholder="Rechercher un client..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
        <select className="client-sort" value={sortBy} onChange={(e) => { setSortBy(e.target.value); setCurrentPage(1); }}>
          <option value="nameAsc">Nom : A → Z</option>
          <option value="nameDesc">Nom : Z → A</option>
          <option value="dateDesc">Date : récent</option>
          <option value="dateAsc">Date : ancien</option>
          <option value="status">Statut</option>
        </select>
      </div>

      <div className="two-columns clients-layout">
        <div className="table card clients-table-card">
          <table>
            <thead><tr><th>Nom du client</th><th>Actions</th></tr></thead>
            <tbody>
              {paginatedClients.map((c) => (
                <tr key={c.id} className={selectedClientId === c.id ? "selected-client-row" : ""}>
                  <td>
                    <button className="link-button client-name-button" onClick={() => setSelectedClientId(c.id)}>
                      <strong>{c.name}</strong>
                    </button>
                  </td>
                  <td className="client-actions">
                    <button onClick={() => edit(c)}>Modifier</button>
                    <button className="danger" onClick={() => remove(c.id)}>Supprimer</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <PaginationControls
            page={clientPage}
            totalPages={clientTotalPages}
            totalItems={clients.length}
            perPage={itemsPerPage}
            onPageChange={setCurrentPage}
          />
        </div>

        <div className="card client-side-card">
          <h3>Fiche client</h3>
          {!selectedClient ? <p className="muted">Clique sur un client pour voir sa fiche.</p> : (
            <div className="client-card">
              <h2>{selectedClient.name}</h2>
              <p><strong>Société :</strong> {selectedClient.company || "-"}</p>
              <p><strong>Email :</strong> {selectedClient.email || "-"}</p>
              <p><strong>Téléphone :</strong> {selectedClient.phone || "-"}</p>
              <p><strong>Adresse :</strong> {selectedClient.address || "-"}</p>
              <p><strong>Statut :</strong> <span className={statusClass(selectedClient.status)}>{selectedClient.status}</span></p>
              <p><strong>Créé le :</strong> {selectedClient.createdAt}</p>
              <p><strong>Notes :</strong><br />{selectedClient.notes || "-"}</p>

              <div className="client-history">
                <h4>Historique factures</h4>
                <div className="client-history-total">
                  <span>{selectedClientInvoices.length} facture(s)</span>
                  <strong>{money(selectedClientInvoiceTotal)}</strong>
                </div>

                {selectedClientInvoices.length === 0 ? (
                  <p className="muted">Aucune facture pour ce client.</p>
                ) : (
                  <div className="client-history-list">
                    {selectedClientInvoices.slice(0, 5).map((invoice) => (
                      <div className="client-history-item" key={invoice.id}>
                        <div>
                          <strong>{invoice.number || "Facture"}</strong>
                          <span>{invoice.date || invoice.createdAt || "-"}</span>
                        </div>
                        <div>
                          <strong>{money(invoice.totalTTC || 0)}</strong>
                          <span className={statusClass(invoice.status)}>{invoice.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Documents({ type, data, setData, currentRole = 'Admin' }) {
  const isQuote = type === "quote";
  const listKey = isQuote ? "quotes" : "invoices";
  const title = isQuote ? "Devis" : "Factures";
  const prefix = isQuote ? "DEV" : "FAC";
  const defaultStatus = isQuote ? "Brouillon" : "Non payée";

  const emptyLine = { productId: "", description: "", quantity: 1, price: 0, discount: 0 };
  const [editingId, setEditingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("dateDesc");
  const [paymentDoc, setPaymentDoc] = useState(null);
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "Virement", note: "" });
  const [form, setForm] = useState({ clientId: "", status: defaultStatus, lines: [{ ...emptyLine }] });

  const itemsPerPage = 10;
  const documents = data[listKey];

  const sortedDocuments = useMemo(() => {
    const list = [...documents];

    function numberValue(doc) {
      return Number(String(doc.number || "").replace(/[^0-9]/g, "")) || 0;
    }

    function dateValue(doc) {
      const value = String(doc.date || "");
      const parts = value.split("/");
      if (parts.length === 3) {
        return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime() || 0;
      }
      return new Date(value || 0).getTime() || 0;
    }

    return list.sort((a, b) => {
      if (sortBy === "numberAsc") return numberValue(a) - numberValue(b);
      if (sortBy === "numberDesc") return numberValue(b) - numberValue(a);
      if (sortBy === "dateAsc") return dateValue(a) - dateValue(b);
      if (sortBy === "dateDesc") return dateValue(b) - dateValue(a);
      if (sortBy === "clientAsc") return clientName(data, a.clientId).localeCompare(clientName(data, b.clientId));
      if (sortBy === "clientDesc") return clientName(data, b.clientId).localeCompare(clientName(data, a.clientId));
      if (sortBy === "totalAsc") return Number(a.totalTTC || 0) - Number(b.totalTTC || 0);
      if (sortBy === "totalDesc") return Number(b.totalTTC || 0) - Number(a.totalTTC || 0);
      if (sortBy === "statusAsc") return String(a.status || "").localeCompare(String(b.status || ""));
      if (sortBy === "statusDesc") return String(b.status || "").localeCompare(String(a.status || ""));
      return 0;
    });
  }, [documents, sortBy, data]);

  const documentTotalPages = Math.max(1, Math.ceil(sortedDocuments.length / itemsPerPage));
  const documentPage = Math.min(currentPage, documentTotalPages);
  const paginatedDocuments = sortedDocuments.slice((documentPage - 1) * itemsPerPage, documentPage * itemsPerPage);

  function lineTotal(line) {
    const subtotal = Number(line.quantity || 0) * Number(line.price || 0);
    const discountAmount = subtotal * (Number(line.discount || 0) / 100);
    const totalHT = subtotal - discountAmount;
    return { subtotal, discountAmount, totalHT };
  }

  const totals = useMemo(() => {
    const subtotal = form.lines.reduce((sum, line) => sum + lineTotal(line).subtotal, 0);
    const discountAmount = form.lines.reduce((sum, line) => sum + lineTotal(line).discountAmount, 0);
    const totalHT = form.lines.reduce((sum, line) => sum + lineTotal(line).totalHT, 0);
    const taxAmount = totalHT * (Number(data.settings.taxRate || 0) / 100);
    const totalTTC = totalHT + taxAmount;
    return { subtotal, discountAmount, totalHT, taxAmount, totalTTC };
  }, [form.lines, data.settings.taxRate]);

  function updateLine(index, changes) {
    setForm({
      ...form,
      lines: form.lines.map((line, i) => (i === index ? { ...line, ...changes } : line)),
    });
  }

  function selectProduct(index, productId) {
    const product = (data.products || []).find((p) => String(p.id) === String(productId));

    if (!product) {
      updateLine(index, {
        productId: "",
        category: "",
        categoryId: "",
        description: "",
        price: 0,
      });
      return;
    }

    updateLine(index, {
      productId: product.id,
      category: product.category || "Sans catégorie",
      categoryId: product.categoryId || "",
      description: product.description || product.name || "",
      price: Number(product.price || 0),
    });
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { ...emptyLine }] });
  }

  function removeLine(index) {
    if (form.lines.length === 1) return alert("Il faut au moins une ligne.");
    setForm({ ...form, lines: form.lines.filter((_, i) => i !== index) });
  }

  function reset() {
    setEditingId(null);
    setForm({ clientId: "", status: defaultStatus, lines: [{ ...emptyLine }] });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.clientId) return alert("Choisis un client.");

    const cleanLines = form.lines
      .map((line) => {
        const product = (data.products || []).find((p) => String(p.id) === String(line.productId));
        return {
          ...line,
          productId: product?.id || line.productId || "",
          category: product?.category || line.category || "Sans catégorie",
          categoryId: product?.categoryId || line.categoryId || "",
          quantity: Number(line.quantity || 0),
          price: Number(line.price || 0),
          discount: Number(line.discount || 0),
          ...lineTotal(line),
        };
      })
      .filter((line) => line.description && line.quantity > 0);

    if (cleanLines.length === 0) return alert("Ajoute au moins un produit ou une prestation.");

    const firstDescription = cleanLines.length === 1 ? cleanLines[0].description : `${cleanLines.length} lignes`;

    if (editingId) {
      const previousDoc = documents.find((d) => d.id === editingId);
      const updatedDoc = previousDoc
        ? { ...previousDoc, clientId: form.clientId, status: form.status, description: firstDescription, lines: cleanLines, taxRate: data.settings.taxRate, ...totals }
        : null;

      let nextProducts = data.products || [];
      if (!isQuote && previousDoc) {
        nextProducts = applyStockDelta(nextProducts, previousDoc.lines || [], 1, `Correction ${previousDoc.number}`, previousDoc.number);
        nextProducts = applyStockDelta(nextProducts, cleanLines, -1, `Facture modifiée ${previousDoc.number}`, previousDoc.number);
      }

      setData({
        ...data,
        products: nextProducts,
        [listKey]: documents.map((d) => (d.id === editingId && updatedDoc ? updatedDoc : d)),
      });
    } else {
      const doc = {
        id: uid(),
        number: `${prefix}-${String(documents.length + 1).padStart(4, "0")}`,
        date: today(),
        taxRate: data.settings.taxRate,
        clientId: form.clientId,
        status: form.status,
        description: firstDescription,
        lines: cleanLines,
        paidAmount: !isQuote && form.status === "Payée" ? totals.totalTTC : 0,
        paymentHistory: !isQuote && form.status === "Payée" ? [{ id: uid(), amount: totals.totalTTC, method: "Paiement complet", date: today(), note: "Facture marquée payée à la création" }] : [],
        ...totals,
      };
      const nextProducts = isQuote ? data.products : applyStockDelta(data.products || [], cleanLines, -1, `Facture ${doc.number}`, doc.number);
      setData({ ...data, products: nextProducts, [listKey]: [...documents, doc] });
    }

    reset();
  }

  function edit(doc) {
    const lines = doc.lines?.length
      ? doc.lines
      : [{ productId: doc.productId || "", description: doc.description || "", quantity: doc.quantity || 1, price: doc.price || 0, discount: doc.discount || 0 }];

    setEditingId(doc.id);
    setForm({ clientId: doc.clientId, status: doc.status || defaultStatus, lines });
  }

  function remove(id) {
    if (!confirm(`Supprimer ce ${isQuote ? "devis" : "facture"} ?`)) return;
    const doc = documents.find((d) => d.id === id);
    const nextProducts = !isQuote && doc ? applyStockDelta(data.products || [], doc.lines || [], 1, `Suppression ${doc.number}`, doc.number) : data.products;
    setData({ ...data, products: nextProducts, [listKey]: documents.filter((d) => d.id !== id) });
  }

  function updateStatus(id, status) {
    setData({ ...data, [listKey]: documents.map((d) => {
      if (d.id !== id) return d;
      const fullPaid = !isQuote && status === "Payée";
      return {
        ...d,
        status,
        paidAmount: fullPaid ? Number(d.totalTTC || 0) : d.paidAmount,
        paymentHistory: fullPaid && invoicePaidAmount(d) < Number(d.totalTTC || 0)
          ? [{ id: uid(), amount: invoiceRemainingAmount(d), method: "Marquage manuel", date: today(), note: "Statut passé en Payée" }, ...(d.paymentHistory || [])]
          : (d.paymentHistory || []),
      };
    }) });
  }

  function openPayment(doc) {
    setPaymentDoc(doc);
    setPaymentForm({ amount: String(invoiceRemainingAmount(doc) || ""), method: "Virement", note: "" });
  }

  function addPayment(e) {
    e.preventDefault();
    if (!paymentDoc) return;
    const amount = Number(String(paymentForm.amount || "0").replace(",", "."));
    if (!amount || amount <= 0) return alert("Montant du paiement obligatoire.");

    setData({
      ...data,
      invoices: (data.invoices || []).map((invoice) => {
        if (invoice.id !== paymentDoc.id) return invoice;
        const payment = { id: uid(), amount, method: paymentForm.method, date: today(), note: paymentForm.note };
        const paidAmount = Math.min(Number(invoice.totalTTC || 0), invoicePaidAmount(invoice) + amount);
        return {
          ...invoice,
          paidAmount,
          paymentHistory: [payment, ...(invoice.paymentHistory || [])],
          status: paidAmount >= Number(invoice.totalTTC || 0) ? "Payée" : "Partiellement payée",
        };
      }),
    });
    setPaymentDoc(null);
  }

  function convertQuoteToInvoice(doc) {
    const invoice = { ...doc, id: uid(), number: `FAC-${String(data.invoices.length + 1).padStart(4, "0")}`, date: today(), status: "Non payée", paidAmount: 0, paymentHistory: [], convertedFrom: doc.number };
    const nextProducts = applyStockDelta(data.products || [], invoice.lines || [], -1, `Conversion ${invoice.number}`, invoice.number);
    setData({ ...data, products: nextProducts, invoices: [...data.invoices, invoice] });
    alert("Devis converti en facture. Le stock a été déduit automatiquement.");
  }

  return (
    <section>
      <div className="page-header"><div><h2>{title}</h2><p>Crée des {isQuote ? "devis" : "factures"} avec plusieurs produits ou prestations.</p></div></div>

      <form className="card" onSubmit={submit}>
        <div className="document-form-header">
          <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">Choisir un client</option>
            {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {isQuote ? <><option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Refusé</option></> : <><option>Non payée</option><option>Partiellement payée</option><option>Payée</option><option>En retard</option></>}
          </select>
        </div>

        <div className="document-lines">
          <div className="document-line document-line-head">
            <span>Produit</span><span>Description</span><span>Qté</span><span>Prix HT</span><span>Remise %</span><span>Total HT</span><span></span>
          </div>

          {form.lines.map((line, index) => {
            const total = lineTotal(line).totalHT;
            return (
              <div className="document-line" key={index}>
                <select value={line.productId || ""} onChange={(e) => selectProduct(index, e.target.value)}>
                  <option value="">Produit libre</option>
                  {(data.products || []).map((p) => <option key={p.id} value={p.id}>{p.category ? `${p.category} — ` : ""}{p.name} - {money(p.price)}</option>)}
                </select>
                <input placeholder="Produit / Prestation" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
                <input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                <input type="number" min="0" value={line.price} onChange={(e) => updateLine(index, { price: e.target.value })} />
                <input type="number" min="0" max="100" value={line.discount} onChange={(e) => updateLine(index, { discount: e.target.value })} />
                <strong>{money(total)}</strong>
                <button type="button" className="danger" onClick={() => removeLine(index)}>✕</button>
              </div>
            );
          })}
        </div>

        <div className="document-form-footer">
          <button type="button" onClick={addLine}>+ Ajouter une ligne</button>
          <div className="total-box"><span>HT : {money(totals.totalHT)}</span><span>TVA : {money(totals.taxAmount)}</span><strong>TTC : {money(totals.totalTTC)}</strong></div>
          <button className="primary">{editingId ? "Modifier" : `Créer ${isQuote ? "le devis" : "la facture"}`}</button>
          {editingId && <button type="button" onClick={reset}>Annuler</button>}
        </div>
      </form>

      <div className="table card">
        <div className="sort-row">
          <label>
            Trier par
            <select
              value={sortBy}
              onChange={(e) => {
                setSortBy(e.target.value);
                setCurrentPage(1);
              }}
            >
              <option value="dateDesc">Date : plus récent</option>
              <option value="dateAsc">Date : plus ancien</option>
              <option value="numberDesc">N° : décroissant</option>
              <option value="numberAsc">N° : croissant</option>
              <option value="clientAsc">Client : A → Z</option>
              <option value="clientDesc">Client : Z → A</option>
              <option value="totalDesc">Total : plus élevé</option>
              <option value="totalAsc">Total : plus bas</option>
              <option value="statusAsc">Statut : A → Z</option>
              <option value="statusDesc">Statut : Z → A</option>
            </select>
          </label>
        </div>

        <table>
          <thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Lignes</th><th>Total TTC</th>{!isQuote && <th>Payé / Reste</th>}<th>Statut</th><th>Actions</th></tr></thead>
          <tbody>
            {paginatedDocuments.map((d) => (
              <tr key={d.id}>
                <td>{d.number}</td><td>{d.date}</td><td>{clientName(data, d.clientId)}</td><td>{d.lines?.length || 1}</td><td>{money(d.totalTTC)}</td>
                {!isQuote && <td><strong>{money(invoicePaidAmount(d))}</strong><br /><span className="muted">Reste {money(invoiceRemainingAmount(d))}</span></td>}
                <td>
                  <select value={d.status} onChange={(e) => updateStatus(d.id, e.target.value)}>
                    {isQuote ? <><option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Refusé</option></> : <><option>Non payée</option><option>Partiellement payée</option><option>Payée</option><option>En retard</option></>}
                  </select>
                </td>
                <td className="actions">
                  <button onClick={() => setPreviewDoc(d)}>Voir</button>
                  {!isQuote && <button className="primary" onClick={() => openPayment(d)}>Paiement</button>}
                  <button onClick={() => edit(d)}>Modifier</button>
                  {isQuote && <button onClick={() => convertQuoteToInvoice(d)}>Convertir</button>}
                  <button className="danger" onClick={() => remove(d.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <PaginationControls
          page={documentPage}
          totalPages={documentTotalPages}
          totalItems={sortedDocuments.length}
          perPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>

      {paymentDoc && (
        <div className="modal">
          <form className="modal-content payment-modal" onSubmit={addPayment}>
            <div className="modal-actions no-print">
              <button type="button" onClick={() => setPaymentDoc(null)}>Fermer</button>
              <button className="primary">Enregistrer le paiement</button>
            </div>
            <h2>Paiement {paymentDoc.number}</h2>
            <p className="muted">Total : {money(paymentDoc.totalTTC)} · Déjà payé : {money(invoicePaidAmount(paymentDoc))} · Reste : {money(invoiceRemainingAmount(paymentDoc))}</p>
            <div className="form-grid">
              <input type="text" inputMode="decimal" placeholder="Montant reçu" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
              <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                <option>Virement</option><option>Carte bancaire</option><option>Espèces</option><option>PayPal</option><option>Chèque</option><option>Autre</option>
              </select>
              <textarea placeholder="Note paiement" value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} />
            </div>
            <div className="payment-history-list">
              <h3>Historique des paiements</h3>
              {(paymentDoc.paymentHistory || []).length === 0 ? <p className="muted">Aucun paiement enregistré.</p> : (paymentDoc.paymentHistory || []).map((payment) => (
                <div className="payment-history-item" key={payment.id}>
                  <strong>{money(payment.amount)}</strong><span>{payment.method}</span><span>{payment.date}</span><em>{payment.note}</em>
                </div>
              ))}
            </div>
          </form>
        </div>
      )}

      {previewDoc && <DocumentPreview doc={previewDoc} type={type} data={data} onClose={() => setPreviewDoc(null)} />}
    </section>
  );
}

function DocumentPreview({ doc, type, data, onClose }) {
  const isQuote = type === "quote";
  const client = data.clients.find((c) => c.id === doc.clientId);
  const amountDue = doc.status === "Payée" ? 0 : (doc.totalTTC || 0);
  const lines = doc.lines?.length
    ? doc.lines
    : [
        {
          description: doc.description,
          quantity: doc.quantity,
          price: doc.price,
          discount: doc.discount || 0,
          subtotal: doc.subtotal,
          totalHT: doc.totalHT,
        },
      ];

  async function downloadPdf() {
    const element = document.querySelector(".invoice-pdf-area");
    if (!element) return alert("Zone PDF introuvable.");

    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");

      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save(`${isQuote ? "devis" : "facture"}-${doc.number || "document"}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Impossible de générer le PDF.");
    }
  }

  function sendEmail() {
    if (!client?.email) {
      alert("Ce client n'a pas d'adresse email enregistrée.");
      return;
    }

    const documentName = isQuote ? "devis" : "facture";
    const subject = `${isQuote ? "Devis" : "Facture"} ${doc.number} - ${data.settings.companyName}`;
    const body = `Bonjour ${client?.name || ""},

Veuillez trouver ci-dessous les informations de votre ${documentName}.

${isQuote ? "Devis" : "Facture"} : ${doc.number}
Date : ${doc.date}
Montant total TTC : ${money(doc.totalTTC)}
Statut : ${doc.status}

${data.settings.paymentTerms || ""}

${data.settings.bankInfo || ""}

Cordialement,
${data.settings.companyName}
${data.settings.companyPhone || ""}
${data.settings.companyEmail || ""}`;

    window.location.href = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="modal">
      <div className="modal-content invoice-modal">
        <div className="no-print modal-actions">
          <button onClick={onClose}>Fermer</button>
          <button onClick={sendEmail}>Envoyer par email</button>
          <button onClick={() => window.print()}>
            Imprimer
          </button>
          <button className="primary" onClick={downloadPdf}>
            Télécharger PDF
          </button>
        </div>

        <div className="print-area invoice-template invoice-pink-template invoice-pdf-area">
          <div
            className="invoice-modern-header"
            style={{
              width: "92%",
              margin: "0 auto 26px auto",
              display: "grid",
              gridTemplateColumns: "115px 1fr 255px",
              gap: "22px",
              alignItems: "center",
              boxSizing: "border-box",
            }}
          >
            <div className="invoice-logo-box">
             <img
  className="invoice-main-logo"
  src={data.settings.logoUrl && data.settings.logoUrl.trim() !== "" ? data.settings.logoUrl : "./logo.png"}
  alt="Logo entreprise"
  onError={(e) => {
    e.currentTarget.src = "./logo.png";
  }}
/>
            </div>

            <div className="invoice-company-info">
              <h1>{data.settings.companyName}</h1>
              <p>{data.settings.companyAddress}</p>
              <p>{data.settings.companyPhone}</p>
              <p>{data.settings.companyEmail}</p>
              <p>
                <strong>N° TVA :</strong> {data.settings.vatNumber || "-"}
              </p>
            </div>

            <div
              className="invoice-document-head"
              style={{
                width: 255,
                maxWidth: 255,
                overflow: "hidden",
              }}
            >
              <h2>{isQuote ? "DEVIS" : "FACTURE"}</h2>
              <div className="invoice-number-box">
                <span>N° {isQuote ? "DEVIS" : "FACTURE"}</span>
                <strong>{String(doc.number || "").replace(/^(FAC-|DEV-|N°)/, "")}</strong>
              </div>
              <div className="invoice-date-box">
                <span>Date d'émission :</span>
                <strong>{doc.date}</strong>
              </div>
            </div>
          </div>

          <div className="invoice-info-grid">
            <div className="invoice-info-card">
              <div className="invoice-round-icon">👤</div>
              <div>
                <h3>FACTURÉ À</h3>
                <strong>{client?.name || "Client supprimé"}</strong>
                {client?.company && <p>{client.company}</p>}
                {client?.address && <p>{client.address}</p>}
                {client?.email && <p>{client.email}</p>}
                {client?.phone && <p>{client.phone}</p>}
              </div>
            </div>

            <div className="invoice-info-card">
              <div className="invoice-round-icon">📄</div>
              <div>
                <h3>RÉFÉRENCE</h3>
                <strong>{doc.convertedFrom || doc.number}</strong>
                <p><strong>Statut :</strong> {doc.status}</p>
                {!isQuote && doc.dueDate && <p><strong>Échéance :</strong> {doc.dueDate}</p>}
              </div>
            </div>
          </div>

          <table className="invoice-modern-table">
            <thead>
              <tr>
                <th>DÉSIGNATION</th>
                <th>PRIX UNITAIRE HT</th>
                <th>QUANTITÉ</th>
                <th>REMISE</th>
                <th>MONTANT TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td>{line.description}</td>
                  <td>{money(line.price)}</td>
                  <td>{Number(line.quantity || 0).toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</td>
                  <td>{line.discount || 0}%</td>
                  <td>{money(line.totalHT || line.subtotal)}</td>
                </tr>
              ))}

              {lines.length < 2 && (
                <tr className="invoice-empty-line">
                  <td>&nbsp;</td>
                  <td></td>
                  <td></td>
                  <td></td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="invoice-bottom-modern">
            <div className="invoice-payment-modern">
              <div className="invoice-section-heading">
                <span>💳</span>
                <strong>CONDITIONS DE PAIEMENT</strong>
              </div>
              <p>
                <strong>Échéance de paiement :</strong> {data.settings.paymentTerms}
              </p>
              <pre>{data.settings.bankInfo}</pre>
            </div>

            <div className="invoice-total-modern">
              <div>
                <span>Total HT</span>
                <strong>{money(doc.totalHT)}</strong>
              </div>
              <div>
                <span>TVA à {doc.taxRate}%</span>
                <strong>{money(doc.taxAmount)}</strong>
              </div>
              <div>
                <span>Total TTC</span>
                <strong>{money(doc.totalTTC)}</strong>
              </div>
              <div>
                <span>Remise</span>
                <strong>{money(doc.discountAmount)}</strong>
              </div>
              <div className="invoice-final-due">
                <span>À PAYER</span>
                <strong>{money(amountDue)}</strong>
              </div>
            </div>
          </div>

          <div className="invoice-legal-note">
            <strong>Mentions</strong>
            <p>Document généré électroniquement. Aucun escompte accordé sauf indication contraire. En cas de retard de paiement, des pénalités peuvent être appliquées selon les conditions convenues.</p>
          </div>

          <div className="invoice-thank-you">
            <div className="invoice-round-icon">i</div>
            <div>
              <strong>Merci pour votre confiance.</strong>
              <p>Pour toute question, n'hésitez pas à nous contacter.</p>
            </div>
            <div className="invoice-signature">Merci !</div>
          </div>

          <div className="invoice-modern-footer">
            <strong>{data.settings.companyName} — Personnalisation</strong>
            <span>
              {data.settings.companyAddress} — {data.settings.companyPhone} — {data.settings.companyEmail}
            </span>
            <span>N° TVA : {data.settings.vatNumber || "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Categories({ data, setData, currentRole = 'Admin' }) {
  const [form, setForm] = useState({ name: "", description: "" });
  const [editing, setEditing] = useState(null);

  const categories = data.categories || [];

  function reset() {
    setEditing(null);
    setForm({ name: "", description: "" });
  }

  function submit(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return alert("Nom de catégorie obligatoire.");

    const alreadyExists = categories.some(
      (category) => category.name.toLowerCase() === name.toLowerCase() && category.id !== editing
    );

    if (alreadyExists) return alert("Cette catégorie existe déjà.");

    if (editing) {
      const oldCategory = categories.find((category) => category.id === editing);
      setData({
        ...data,
        categories: categories.map((category) =>
          category.id === editing ? { ...category, name, description: form.description } : category
        ),
        products: (data.products || []).map((product) =>
          product.category === oldCategory?.name ? { ...product, category: name } : product
        ),
      });
    } else {
      setData({
        ...data,
        categories: [...categories, { id: uid(), createdAt: today(), name, description: form.description }],
      });
    }

    reset();
  }

  function edit(category) {
    setEditing(category.id);
    setForm({ name: category.name || "", description: category.description || "" });
  }

  function remove(category) {
    const used = (data.products || []).some((product) => product.category === category.name);

    if (used) {
      const clearProducts = confirm(
        "Cette catégorie est utilisée par des produits. Supprimer la catégorie et retirer cette catégorie des produits ?"
      );
      if (!clearProducts) return;
    } else if (!confirm("Supprimer cette catégorie ?")) {
      return;
    }

    setData({
      ...data,
      categories: categories.filter((c) => c.id !== category.id),
      products: (data.products || []).map((product) =>
        product.category === category.name ? { ...product, category: "" } : product
      ),
    });
  }

  function productCount(categoryName) {
    return (data.products || []).filter((product) => product.category === categoryName).length;
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Catégories</h2>
          <p>Organise tes produits par famille : sublimation, textile, accessoires, services...</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={submit}>
        <input
          placeholder="Nom de catégorie *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button className="primary">{editing ? "Modifier" : "Ajouter catégorie"}</button>
        {editing && <button type="button" onClick={reset}>Annuler</button>}
      </form>

      <div className="table card">
        <table>
          <thead>
            <tr><th>Catégorie</th><th>Description</th><th>Produits liés</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr><td colSpan="4" className="muted">Aucune catégorie pour le moment.</td></tr>
            )}
            {categories.map((category) => (
              <tr key={category.id}>
                <td><strong>{category.name}</strong></td>
                <td>{category.description}</td>
                <td>{productCount(category.name)}</td>
                <td>
                  <button onClick={() => edit(category)}>Modifier</button>
                  <button className="danger" onClick={() => remove(category)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Products({ data, setData, currentRole = 'Admin' }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockFilter, setStockFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [movementProduct, setMovementProduct] = useState(null);
  const [movementForm, setMovementForm] = useState({ type: "Entrée", quantity: "", reason: "Ajustement manuel" });
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    price: "",
    purchasePrice: "",
    stock: "",
    stockMin: "",
    supplier: "",
    trackStock: true,
    description: "",
  });

  const categories = data.categories || [];
  const itemsPerPage = 10;
  const allProducts = data.products || [];
  const stockAlerts = allProducts.filter((product) => product.trackStock !== false && stockStatus(product).className !== "success");
  const totalStockValue = allProducts.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.price || 0), 0);
  const totalPurchaseValue = allProducts.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.purchasePrice || 0), 0);

  const products = allProducts.filter((product) => {
    const matchesSearch = [product.name, product.sku, product.category, product.description, product.supplier]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());
    const matchesCategory = !categoryFilter || product.category === categoryFilter;
    const status = stockStatus(product);
    const matchesStock = !stockFilter || status.className === stockFilter;
    return matchesSearch && matchesCategory && matchesStock;
  });

  const productTotalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));
  const productPage = Math.min(currentPage, productTotalPages);
  const paginatedProducts = products.slice((productPage - 1) * itemsPerPage, productPage * itemsPerPage);

  function reset() {
    setEditing(null);
    setForm({ name: "", sku: "", category: "", price: "", purchasePrice: "", stock: "", stockMin: "", supplier: "", trackStock: true, description: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name) return alert("Nom du produit obligatoire.");

    const productData = {
      ...form,
      price: Number(form.price || 0),
      purchasePrice: Number(form.purchasePrice || 0),
      stock: Number(form.stock || 0),
      stockMin: Number(form.stockMin || 0),
      trackStock: Boolean(form.trackStock),
    };

    if (editing) {
      setData({
        ...data,
        products: allProducts.map((p) =>
          p.id === editing ? { ...p, ...productData, updatedAt: today() } : p
        ),
      });
    } else {
      setData({
        ...data,
        products: [...allProducts, { id: uid(), createdAt: today(), stockHistory: [], ...productData }],
      });
    }

    reset();
  }

  function edit(product) {
    setEditing(product.id);
    setForm({
      name: product.name || "",
      sku: product.sku || "",
      category: product.category || "",
      price: product.price || "",
      purchasePrice: product.purchasePrice || "",
      stock: product.stock || "",
      stockMin: product.stockMin || "",
      supplier: product.supplier || "",
      trackStock: product.trackStock !== false,
      description: product.description || "",
    });
  }

  function remove(id) {
    if (!canDeleteData(currentRole)) return alert("Ton rôle ne permet pas de supprimer.");
    if (!confirm("Supprimer ce produit ?")) return;
    setData({ ...data, products: allProducts.filter((p) => p.id !== id) });
    setSelectedProductIds(selectedProductIds.filter((productId) => productId !== id));
  }

  function toggleProductSelection(id) {
    setSelectedProductIds((current) => current.includes(id) ? current.filter((productId) => productId !== id) : [...current, id]);
  }

  function toggleVisibleProducts() {
    const visibleIds = paginatedProducts.map((product) => product.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedProductIds.includes(id));
    setSelectedProductIds(allVisibleSelected ? selectedProductIds.filter((id) => !visibleIds.includes(id)) : [...new Set([...selectedProductIds, ...visibleIds])]);
  }

  function applyBulkCategory() {
    if (!selectedProductIds.length) return alert("Sélectionne au moins un produit.");
    if (!bulkCategory) return alert("Choisis une catégorie.");
    setData({ ...data, products: allProducts.map((product) => selectedProductIds.includes(product.id) ? { ...product, category: bulkCategory } : product) });
    setSelectedProductIds([]);
    setBulkCategory("");
    alert("Catégorie appliquée aux produits sélectionnés.");
  }

  function openMovement(product) {
    setMovementProduct(product);
    setMovementForm({ type: "Entrée", quantity: "", reason: "Ajustement manuel" });
  }

  function saveMovement(e) {
    e.preventDefault();
    if (!movementProduct) return;
    const quantity = Number(movementForm.quantity || 0);
    if (!quantity || quantity <= 0) return alert("Quantité obligatoire.");
    const direction = movementForm.type === "Entrée" ? 1 : -1;
    setData({
      ...data,
      products: allProducts.map((product) => {
        if (product.id !== movementProduct.id) return product;
        const nextStock = Math.max(0, Number(product.stock || 0) + quantity * direction);
        return {
          ...product,
          stock: nextStock,
          stockHistory: [buildStockMovement(movementForm.type, quantity, movementForm.reason), ...(product.stockHistory || [])].slice(0, 30),
        };
      }),
    });
    setMovementProduct(null);
  }

  return (
    <section className="products-page">
      <div className="page-header">
        <div>
          <h2>Produits & Stock</h2>
          <p>Catalogue premium, valorisation du stock, alertes et mouvements.</p>
        </div>
      </div>

      <div className="product-kpi-grid">
        <div className="card product-kpi"><span>Produits actifs</span><strong>{allProducts.length}</strong><small>Catalogue complet</small></div>
        <div className="card product-kpi"><span>Valeur vente stock</span><strong>{money(totalStockValue)}</strong><small>Stock × prix HT</small></div>
        <div className="card product-kpi"><span>Valeur achat stock</span><strong>{money(totalPurchaseValue)}</strong><small>Stock × coût achat</small></div>
        <div className="card product-kpi alert"><span>Alertes stock</span><strong>{stockAlerts.length}</strong><small>Faible ou rupture</small></div>
      </div>

      <form className="card product-form" onSubmit={submit}>
        <div className="product-form-title">
          <h3>{editing ? "Modifier un produit" : "Nouveau produit"}</h3>
          <p className="muted">Les champs stock minimum et fournisseur alimentent les alertes et la fiche produit.</p>
        </div>
        <div className="form-grid">
          <input placeholder="Nom produit *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Référence SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            <option value="">Sans catégorie</option>
            {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
          </select>
          <input type="text" inputMode="decimal" placeholder="Prix vente HT" value={String(form.price).replace(".", ",")} onChange={(e) => setForm({ ...form, price: e.target.value.replace(",", ".") })} />
          <input type="text" inputMode="decimal" placeholder="Coût achat HT" value={String(form.purchasePrice).replace(".", ",")} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value.replace(",", ".") })} />
          <input type="number" min="0" placeholder="Stock actuel" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          <input type="number" min="0" placeholder="Stock minimum" value={form.stockMin} onChange={(e) => setForm({ ...form, stockMin: e.target.value })} />
          <input placeholder="Fournisseur" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          <label className="check-card"><input type="checkbox" checked={form.trackStock} onChange={(e) => setForm({ ...form, trackStock: e.target.checked })} /> Suivre le stock</label>
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="document-form-footer">
          <button className="primary">{editing ? "Modifier" : "Ajouter produit"}</button>
          {editing && <button type="button" onClick={reset}>Annuler</button>}
        </div>
      </form>

      <div className="filters-row product-filters">
        <input className="search" placeholder="Rechercher nom, SKU, fournisseur..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}>
          <option value="">Toutes les catégories</option>
          {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
        </select>
        <select value={stockFilter} onChange={(e) => { setStockFilter(e.target.value); setCurrentPage(1); }}>
          <option value="">Tous les statuts stock</option>
          <option value="success">Disponible</option>
          <option value="warning">Stock faible</option>
          <option value="danger">Rupture</option>
          <option value="neutral">Non suivi</option>
        </select>
      </div>

      <div className="table card product-table-card">
        <div className="bulk-actions">
          <strong>{selectedProductIds.length} produit(s) sélectionné(s)</strong>
          <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
            <option value="">Choisir une catégorie</option>
            {categories.map((category) => <option key={category.id} value={category.name}>{category.name}</option>)}
          </select>
          <button type="button" className="primary" onClick={applyBulkCategory}>Appliquer la catégorie</button>
          {selectedProductIds.length > 0 && <button type="button" onClick={() => setSelectedProductIds([])}>Désélectionner</button>}
        </div>

        <div className="product-card-grid">
          {paginatedProducts.map((product) => {
            const status = stockStatus(product);
            const margin = Number(product.price || 0) - Number(product.purchasePrice || 0);
            const maxLevel = Math.max(Number(product.stockMin || 0) * 2, Number(product.stock || 0), 1);
            const level = Math.min(100, Math.round((Number(product.stock || 0) / maxLevel) * 100));
            return (
              <article className="product-tile" key={product.id}>
                <div className="product-tile-top">
                  <input type="checkbox" checked={selectedProductIds.includes(product.id)} onChange={() => toggleProductSelection(product.id)} />
                  <span className={`stock-pill ${status.className}`}>{status.label}</span>
                </div>
                <h3>{product.name}</h3>
                <p className="muted">{product.sku || "Sans SKU"} · {product.category || "Sans catégorie"}</p>
                <div className="product-price-row"><strong>{money(product.price)}</strong><span>Marge {money(margin)}</span></div>
                <div className="stock-meter"><div style={{ width: `${level}%` }} /></div>
                <div className="product-stock-row"><span>Stock</span><strong>{product.trackStock === false ? "Non suivi" : product.stock}</strong><small>Min. {product.stockMin || 0}</small></div>
                {product.supplier && <p className="product-supplier">Fournisseur : {product.supplier}</p>}
                {product.description && <p className="product-description">{product.description}</p>}
                <div className="product-actions">
                  <button onClick={() => openMovement(product)}>Stock</button>
                  <button onClick={() => edit(product)}>Modifier</button>
                  <button className="danger" onClick={() => remove(product.id)}>Supprimer</button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="select-visible-row">
          <button type="button" onClick={toggleVisibleProducts}>Sélectionner / désélectionner cette page</button>
        </div>

        <PaginationControls page={productPage} totalPages={productTotalPages} totalItems={products.length} perPage={itemsPerPage} onPageChange={setCurrentPage} />
      </div>

      {movementProduct && (
        <div className="modal">
          <form className="modal-content payment-modal" onSubmit={saveMovement}>
            <div className="modal-actions no-print">
              <button type="button" onClick={() => setMovementProduct(null)}>Fermer</button>
              <button className="primary">Enregistrer</button>
            </div>
            <h2>Mouvement stock — {movementProduct.name}</h2>
            <p className="muted">Stock actuel : {movementProduct.stock || 0}</p>
            <div className="form-grid">
              <select value={movementForm.type} onChange={(e) => setMovementForm({ ...movementForm, type: e.target.value })}>
                <option>Entrée</option><option>Sortie</option>
              </select>
              <input type="number" min="1" placeholder="Quantité" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: e.target.value })} />
              <input placeholder="Motif" value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })} />
            </div>
            <div className="payment-history-list">
              <h3>Derniers mouvements</h3>
              {(movementProduct.stockHistory || []).length === 0 ? <p className="muted">Aucun mouvement enregistré.</p> : (movementProduct.stockHistory || []).slice(0, 10).map((move) => (
                <div className="payment-history-item" key={move.id}>
                  <strong>{move.type}</strong><span>{move.quantity}</span><span>{move.reason}</span><em>{move.documentNumber || new Date(move.createdAt).toLocaleDateString("fr-FR")}</em>
                </div>
              ))}
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function ExcelImport({ data, setData }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState(null);

  function cleanText(value) {
    if (value === null || value === undefined) return "";
    return String(value).trim();
  }

  function normalize(value) {
    return cleanText(value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function parseNumber(value) {
    if (value === null || value === undefined || value === "") return 0;
    if (typeof value === "number") return value;
    return Number(String(value).replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
  }

  function excelDate(value) {
    if (!value) return today();

    if (!isNaN(Number(value))) {
      const date = new Date((Number(value) - 25569) * 86400 * 1000);
      return date.toLocaleDateString("fr-FR");
    }

    return cleanText(value);
  }

  function getSheetRows(workbook, possibleNames) {
    const wanted = possibleNames.map(normalize);

    const sheetName = workbook.SheetNames.find((name) =>
      wanted.includes(normalize(name))
    );

    if (!sheetName) return [];

    return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      blankrows: false,
    });
  }

  function findClientIdByName(clientName, importedClients) {
    const allClients = [...(data.clients || []), ...importedClients];

    return (
      allClients.find((client) => normalize(client.name) === normalize(clientName))?.id || ""
    );
  }

  function importClients(workbook) {
    const rows = getSheetRows(workbook, ["Clients", "Client"]);

    return rows
      .slice(8) // ligne Excel 9
      .map((row) => {
        const customerNumber = cleanText(row[1]); // colonne B
        const name = cleanText(row[2]); // colonne C

        return {
          id: uid(),
          createdAt: today(),
          customerNumber,
          name,
          category: cleanText(row[3]), // D
          status: cleanText(row[4]) || "Client", // E
          paymentTerms: cleanText(row[5]), // F
          email: cleanText(row[7]), // H
          phone: cleanText(row[8]), // I
          address: [
            cleanText(row[9]), // J
            cleanText(row[10]), // K
            cleanText(row[11]), // L
            cleanText(row[12]), // M
          ]
            .filter(Boolean)
            .join(", "),
          birthday: cleanText(row[13]), // N
          notes: cleanText(row[14]) || "Import Excel", // O
        };
      })
      .filter((client) => {
        const n = normalize(client.name);
        return (
          client.name &&
          !["nomduclient", "client", "clientsociete", "totalclients"].includes(n) &&
          !n.includes("copyright") &&
          !n.includes("agathetemplates")
        );
      });
  }

  function importProducts(workbook) {
    const rows = getSheetRows(workbook, [
      "Mes produits",
      "Produits",
      "products",
      "Products",
      "Mes products",
    ]);

    return rows
      .slice(6) // ligne Excel 7
      .map((row) => {
        const sku = cleanText(row[1]); // B
        const name = cleanText(row[2]); // C
        const supplier = cleanText(row[3]); // D
        const price = parseNumber(row[4]); // E
        const taxRaw = parseNumber(row[6]); // G
        const notes = cleanText(row[7]); // H

        return {
          id: uid(),
          createdAt: today(),
          sku,
          name,
          supplier,
          price,
          taxRate:
            taxRaw > 0 && taxRaw < 1
              ? taxRaw * 100
              : taxRaw || Number(data.settings?.taxRate || 17),
          description: notes,
          stock: 0,
          categoryId: "",
        };
      })
      .filter((product) => {
        const s = normalize(product.sku);
        const n = normalize(product.name);
        return (
          product.sku &&
          product.name &&
          product.price > 0 &&
          !["reference", "ref"].includes(s) &&
          !["produitservice", "produit", "service"].includes(n) &&
          !n.includes("calculateur") &&
          !n.includes("fournisseur") &&
          !s.includes("agathe")
        );
      });
  }

  function importInvoices(workbook, importedClients) {
    const rows = getSheetRows(workbook, [
      "Toutes les factures",
      "Factures",
      "invoices",
      "Invoices",
      "Mes factures",
    ]);

    return rows
      .slice(9) // ligne Excel 10 : première facture réelle
      .map((row, index) => {
        const rawNumber = cleanText(row[1]); // B
        const clientName = cleanText(row[2]); // C
        const invoiceDate = excelDate(row[3]); // D
        const dueDate = excelDate(row[4]); // E
        const totalHT = parseNumber(row[6]); // G Montant de la facture
        const paidAmount = parseNumber(row[8]); // I
        const remainingAmount = parseNumber(row[10]); // K
        const status = cleanText(row[14]) || (remainingAmount <= 0 ? "Payée" : "Non payée"); // O

        const taxRate = Number(data.settings?.taxRate || 17);
        const taxAmount = totalHT * (taxRate / 100);
        const totalTTC = totalHT + taxAmount;

        return {
          id: uid(),
          number: rawNumber || `FAC-${String(index + 1).padStart(4, "0")}`,
          date: invoiceDate,
          dueDate,
          clientId: findClientIdByName(clientName, importedClients),
          clientName,
          status,
          paidAmount,
          remaining: remainingAmount,
          lines: [
            {
              id: uid(),
              productId: "",
              description: `Facture importée ${rawNumber || ""}`.trim(),
              quantity: 1,
              price: Number(totalHT.toFixed(2)),
              discount: 0,
              totalHT: Number(totalHT.toFixed(2)),
            },
          ],
          subtotal: Number(totalHT.toFixed(2)),
          discountAmount: 0,
          totalHT: Number(totalHT.toFixed(2)),
          taxRate,
          taxAmount: Number(taxAmount.toFixed(2)),
          totalTTC: Number(totalTTC.toFixed(2)),
          importedFromExcel: true,
        };
      })
      .filter((invoice) => {
        const n = normalize(invoice.number);
        const c = normalize(invoice.clientName);
        return (
          invoice.number &&
          invoice.clientName &&
          invoice.totalHT > 0 &&
          !n.includes("numerodefacture") &&
          !n.includes("numero") &&
          !n.includes("facture") &&
          !c.includes("client")
        );
      });
  }

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage("Lecture du fichier Excel...");
    setPreview(null);

    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const workbook = XLSX.read(evt.target.result, { type: "binary" });

        const importedClients = importClients(workbook);
        const importedProducts = importProducts(workbook);
        const importedInvoices = importInvoices(workbook, importedClients);

        const result = {
          importedClients,
          importedProducts,
          importedInvoices,
        };

        setPreview(result);

        setData({
          ...data,
          clients: [...(data.clients || []), ...importedClients],
          products: [...(data.products || []), ...importedProducts],
          invoices: [...(data.invoices || []), ...importedInvoices],
        });

        setMessage(
          `Import terminé : ${importedClients.length} clients, ${importedProducts.length} produits, ${importedInvoices.length} factures.`
        );
      } catch (err) {
        console.error(err);
        setMessage("Erreur lors de l'import du fichier Excel.");
      }

      setLoading(false);
    };

    reader.readAsBinaryString(file);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Import Excel</h2>
          <p>Importe les clients, produits et factures depuis ton fichier Excel.</p>
        </div>
      </div>

      <div className="card">
        <input type="file" accept=".xlsx,.xls,.xlsm,.csv" onChange={handleFile} />
        {loading && <p className="muted">Import en cours...</p>}
        {message && <p style={{ marginTop: 20 }}>{message}</p>}
      </div>

      {preview && (
        <div className="stats">
          <div className="card stat">
            <span>Clients importés</span>
            <strong>{preview.importedClients.length}</strong>
          </div>
          <div className="card stat">
            <span>Produits importés</span>
            <strong>{preview.importedProducts.length}</strong>
          </div>
          <div className="card stat">
            <span>Factures importées</span>
            <strong>{preview.importedInvoices.length}</strong>
          </div>
        </div>
      )}
    </section>
  );
}

