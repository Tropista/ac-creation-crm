import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import "./App.css";


const MOBILE_CSS = `
@media (max-width: 768px) {
  body {
    font-size: 14px;
  }

  .layout,
  .app-layout,
  .main-layout {
    flex-direction: column !important;
  }

  .sidebar,
  .nav,
  .menu {
    width: 100% !important;
    height: auto !important;
  }

  .sidebar {
    position: fixed !important;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-around;
    gap: 4px;
    padding: 8px;
    border-top: 1px solid rgba(255,255,255,0.1);
    overflow-x: auto;
  }

  .sidebar button,
  .nav button,
  .menu button {
    flex: 1;
    min-width: 70px;
    margin: 2px;
    font-size: 12px;
    padding: 10px 4px;
    white-space: nowrap;
  }

  .content,
  .main,
  main {
    padding-bottom: 110px !important;
    width: 100% !important;
  }

  table {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }

  input,
  select,
  textarea,
  button {
    min-height: 42px;
    font-size: 16px;
  }

  .documents-grid,
  .dashboard-grid,
  .stats-grid,
  .grid {
    grid-template-columns: 1fr !important;
  }

  .topbar,
  .actions,
  .row {
    flex-direction: column !important;
    gap: 10px;
  }

  .card,
  .stat {
    width: 100%;
  }
}
`;

const STORAGE_KEY = "crm_local_data_v2";
const SESSION_KEY = "crm_current_user_v2";

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

const emptyData = {
  users: [],
  settings: {
    companyName: "Mon Entreprise",
    companyEmail: "contact@monentreprise.com",
    gmailSenderEmail: "ac.creation.officiel@gmail.com",
    gmailSenders: "ac.creation.officiel@gmail.com|AC Création\ndos.santos.alves.daniel@gmail.com|Daniel personnel",
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

function parseDecimal(value) {
  if (value === null || value === undefined || value === "") return 0;
  return Number(String(value).replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
}

function productLabel(product) {
  if (!product) return "";
  return `${product.category ? `${product.category} — ` : ""}${product.name} - ${money(product.price)}`;
}

function today() {
  return new Date().toLocaleDateString("fr-FR");
}

function dateInputTodayPlus(days = 30) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function inputDateToFrench(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function frenchDateToInput(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parts = text.split("/");
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return "";
}

function dateValueFromAny(value) {
  if (!value) return 0;
  const input = frenchDateToInput(value);
  return new Date(input || value).getTime() || 0;
}

function isInvoiceOverdue(doc) {
  if (!doc?.dueDate || doc.status === "Payée") return false;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  return dateValueFromAny(doc.dueDate) < todayStart.getTime();
}

function remainingAmount(doc) {
  return Math.max(0, Number(doc?.totalTTC || 0) - Number(doc?.paidAmount || 0));
}

function getInvoicePaymentStatus(doc) {
  const total = Number(doc?.totalTTC || 0);
  const paid = Number(doc?.paidAmount || 0);
  const rawStatus = String(doc?.status || "").toLowerCase().trim();

  if (total > 0 && paid >= total) return "Payée";
  if (paid > 0 && paid < total) return isInvoiceOverdue(doc) ? "En retard" : "Partiel";
  if (isInvoiceOverdue(doc)) return "En retard";

  if (rawStatus.includes("payée") || rawStatus.includes("payee")) return "Payée";
  if (rawStatus.includes("partiel")) return "Partiel";
  if (rawStatus.includes("retard")) return "En retard";

  return "Non payée";
}

function buildReminderMessage(doc, client, settings) {
  const status = getInvoicePaymentStatus(doc);
  return `Bonjour ${client?.name || ""},

Je me permets de vous relancer concernant la facture ${doc.number}, d'un montant total de ${money(doc.totalTTC)}.

Montant déjà payé : ${money(doc.paidAmount || 0)}
Montant restant à payer : ${money(remainingAmount(doc))}
Date d'échéance : ${doc.dueDate || "non renseignée"}
Statut : ${status}

Sauf erreur de notre part, le règlement reste en attente.

Vous pouvez effectuer le paiement avec les informations bancaires indiquées sur la facture.

Cordialement,
${settings.companyName || ""}`;
}

function clientName(data, id) {
  return data.clients.find((c) => c.id === id)?.name || "Client supprimé";
}

function statusClass(status) {
  return "badge " + String(status || "").toLowerCase().replaceAll(" ", "-").replaceAll("é", "e");
}

export default function App() {

  useEffect(() => {
    const existing = document.getElementById("crm-mobile-css");
    if (existing) return;

    const style = document.createElement("style");
    style.id = "crm-mobile-css";
    style.textContent = MOBILE_CSS;
    document.head.appendChild(style);

    return () => {
      const current = document.getElementById("crm-mobile-css");
      if (current) current.remove();
    };
  }, []);

  const [data, setData] = useState(loadData);
  const [currentUser, setCurrentUser] = useState(() => JSON.parse(localStorage.getItem(SESSION_KEY) || "null"));
  const [page, setPage] = useState("dashboard");
  const [invoiceFilter, setInvoiceFilter] = useState("all");

  const openInvoiceFilter = (filter) => {
    setInvoiceFilter(filter);
    setPage("invoices");
  };
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState("Connexion à Supabase...");

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

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>{data.settings.companyName}</h1>
        <p className="user">Connecté : {currentUser.name}</p>
        <p className="cloud-status">☁️ {syncStatus}</p>
        <button onClick={() => setPage("dashboard")}>📊 Tableau de bord</button>
        <button onClick={() => setPage("clients")}>👥 Clients</button>
        <button onClick={() => setPage("products")}>📦 Produits</button>
        <button onClick={() => setPage("categories")}>🏷️ Catégories</button>
        <button onClick={() => setPage("quotes")}>🧾 Devis</button>
        <button onClick={() => { setInvoiceFilter("all"); setPage("invoices"); }}>💶 Factures</button>
        <button onClick={() => setPage("settings")}>⚙️ Paramètres</button>
        <button onClick={() => setPage("import")}>📥 Import Excel</button>
        <button onClick={() => setPage("backup")}>💾 Sauvegarde</button>
        <button className="danger" onClick={logout}>Déconnexion</button>
      </aside>

      <main className="content">
        {page === "dashboard" && <Dashboard data={data} openInvoiceFilter={openInvoiceFilter} />}
        {page === "clients" && <Clients data={data} setData={updateData} />}
        {page === "products" && <Products data={data} setData={updateData} />}
        {page === "categories" && <Categories data={data} setData={updateData} />}
        {page === "quotes" && <Documents type="quote" data={data} setData={updateData} />}
        {page === "invoices" && <Documents type="invoice" data={data} setData={updateData} invoiceFilter={invoiceFilter} setInvoiceFilter={setInvoiceFilter} />}
        {page === "settings" && <Settings data={data} setData={updateData} />}
        {page === "import" && <ExcelImport data={data} setData={updateData} />}
        {page === "backup" && <BackupRestore data={data} setData={updateData} />}
      </main>
    </div>
  );
}

function AuthPage({ data, setData, setCurrentUser }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  async function register(e) {
    e.preventDefault();
    setError("");

    if (!form.name || !form.email || !form.password) {
      setError("Remplis tous les champs.");
      return;
    }

    const { data: authData, error } = await supabase.auth.signUp({
      email: form.email.toLowerCase(),
      password: form.password,
      options: {
        data: {
          name: form.name,
        },
      },
    });

    if (error) {
      setError(error.message || "Impossible de créer le compte.");
      return;
    }

    if (!authData.user) {
      setError("Compte créé, mais connexion impossible pour le moment.");
      return;
    }

    const session = {
      id: authData.user.id,
      name: form.name,
      email: authData.user.email,
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setCurrentUser(session);
  }

  async function login(e) {
    e.preventDefault();
    setError("");

    if (!form.email || !form.password) {
      setError("Indique ton email et ton mot de passe.");
      return;
    }

    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email: form.email.toLowerCase(),
      password: form.password,
    });

    if (error || !authData.user) {
      setError("Email ou mot de passe incorrect.");
      return;
    }

    const session = {
      id: authData.user.id,
      name: authData.user.user_metadata?.name || authData.user.email,
      email: authData.user.email,
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
          Gérez vos clients, devis et factures simplement et efficacement.
        </p>

        <div className="auth-features">
          <div className="feature-item">
            <div>👥</div>
            <span>
              <strong>Gestion clients</strong>
              Centralisez toutes vos informations clients.
            </span>
          </div>

          <div className="feature-item">
            <div>🧾</div>
            <span>
              <strong>Devis & Factures</strong>
              Créez et suivez vos documents en quelques clics.
            </span>
          </div>

          <div className="feature-item">
            <div>📈</div>
            <span>
              <strong>Tableaux de bord</strong>
              Analysez votre activité en temps réel.
            </span>
          </div>
        </div>
      </section>

      <form className="modern-auth-card" onSubmit={mode === "login" ? login : register}>
        <div className="lock-icon">🔒</div>

        <h2>{mode === "login" ? "Bienvenue !" : "Créer un compte"}</h2>
        <p className="auth-subtitle">
          {mode === "login" ? "Connectez-vous à votre espace" : "Créez votre accès CRM"}
        </p>

        {mode === "register" && (
          <label className="modern-field">
            <span>👤</span>
            <input
              placeholder="Nom"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
        )}

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
          {mode === "login" ? "Se connecter" : "Créer mon compte"}
          <span>→</span>
        </button>

        <div className="auth-separator">
          <span></span>
          <p>ou</p>
          <span></span>
        </div>

        <button
          type="button"
          className="modern-secondary"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Créer un compte" : "Se connecter"}
        </button>

        <p className="auth-note">🛡️ Données synchronisées avec Supabase.</p>
      </form>
    </div>
  );
}



function Dashboard({ data, openInvoiceFilter }) {
  const invoices = data.invoices || [];
  const quotes = data.quotes || [];
  const clients = data.clients || [];
  const products = data.products || [];
  const categories = data.categories || [];

  const totalInvoices = invoices.reduce((sum, inv) => sum + Number(inv.totalTTC || 0), 0);
  const paidInvoices = invoices.reduce((sum, inv) => sum + Number(inv.paidAmount || (inv.status === "Payée" ? inv.totalTTC : 0) || 0), 0);
  const unpaidInvoices = invoices.reduce((sum, inv) => sum + remainingAmount(inv), 0);
  const unpaidCount = invoices.filter((i) => {
    const total = Number(i?.totalTTC || 0);
    const paid = Number(i?.paidAmount || 0);
    return total > 0 && paid <= 0;
  }).length;
  const partialCount = invoices.filter((i) => getInvoicePaymentStatus(i) === "Partiel").length;
  const overdueCount = invoices.filter((i) => getInvoicePaymentStatus(i) === "En retard").length;
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
      const lines = invoiceLines.filter((line) => line.productId === product.id);
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
      const categoryProducts = products.filter((p) => p.categoryId === category.id);
      const categoryProductIds = categoryProducts.map((p) => p.id);
      const revenue = invoiceLines
        .filter((line) => categoryProductIds.includes(line.productId))
        .reduce((sum, line) => sum + Number(line.totalHT || 0), 0);
      const quantity = invoiceLines
        .filter((line) => categoryProductIds.includes(line.productId))
        .reduce((sum, line) => sum + Number(line.quantity || 0), 0);
      return { ...category, revenue, quantity };
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
        <div className="card stat"><span>Devis</span><strong>{quotes.length}</strong></div>
        <div className="card stat"><span>Devis acceptés</span><strong>{acceptedQuotes}</strong></div>
        <div className="card stat"><span>Factures</span><strong>{invoices.length}</strong></div>
        <button type="button" className="card stat clickable" onClick={() => openInvoiceFilter && openInvoiceFilter("unpaid")}><span>Non payées</span><strong>{unpaidCount}</strong></button>
        <button type="button" className="card stat clickable" onClick={() => openInvoiceFilter && openInvoiceFilter("partial")}><span>Partielles</span><strong>{partialCount}</strong></button>
        <button type="button" className="card stat clickable" onClick={() => openInvoiceFilter && openInvoiceFilter("overdue")}><span>En retard</span><strong>{overdueCount}</strong></button>
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
                      <td><span className={statusClass(getInvoicePaymentStatus(invoice))}>{getInvoicePaymentStatus(invoice)}</span></td>
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


function BackupRestore({ data, setData }) {
  const [message, setMessage] = useState("");

  const backupData = normalizeData(data);
  const backupDate = new Date().toISOString().slice(0, 10);
  const backupName = `crm-backup-${backupDate}`;

  function downloadFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const payload = {
      app: "CRM Electron React Supabase",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: backupData,
    };

    downloadFile(`${backupName}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    setMessage("Sauvegarde JSON exportée.");
  }

  function exportExcel() {
    const workbook = XLSX.utils.book_new();

    const clientsSheet = (backupData.clients || []).map((client) => ({
      ID: client.id,
      Nom: client.name || "",
      Email: client.email || "",
      Téléphone: client.phone || "",
      Société: client.company || "",
      Adresse: client.address || "",
      Statut: client.status || "",
      Notes: client.notes || "",
    }));

    const productsSheet = (backupData.products || []).map((product) => ({
      ID: product.id,
      Nom: product.name || "",
      Catégorie: product.category || "",
      "Prix HT": product.price || 0,
      Stock: product.stock || 0,
      Description: product.description || "",
    }));

    const categoriesSheet = (backupData.categories || []).map((category) => ({
      ID: category.id,
      Nom: category.name || "",
    }));

    const quotesSheet = (backupData.quotes || []).map((quote) => ({
      ID: quote.id,
      Numéro: quote.number || "",
      Date: quote.date || "",
      Client: clientName(backupData, quote.clientId),
      "ID client": quote.clientId || "",
      Statut: quote.status || "",
      "Total HT": quote.totalHT || 0,
      TVA: quote.taxAmount || 0,
      "Total TTC": quote.totalTTC || 0,
      Notes: quote.notes || "",
    }));

    const invoicesSheet = (backupData.invoices || []).map((invoice) => ({
      ID: invoice.id,
      Numéro: invoice.number || "",
      Date: invoice.date || "",
      Client: clientName(backupData, invoice.clientId),
      "ID client": invoice.clientId || "",
      Statut: getInvoicePaymentStatus(invoice),
      "Date échéance": invoice.dueDate || "",
      "Montant payé": invoice.paidAmount || 0,
      "Reste à payer": remainingAmount(invoice),
      "Total HT": invoice.totalHT || 0,
      TVA: invoice.taxAmount || 0,
      "Total TTC": invoice.totalTTC || 0,
      Notes: invoice.notes || "",
    }));

    const linesSheet = [
      ...(backupData.quotes || []).flatMap((doc) =>
        (doc.lines || []).map((line, index) => ({
          Type: "Devis",
          "ID document": doc.id,
          Numéro: doc.number || "",
          Ligne: index + 1,
          Produit: line.description || "",
          "ID produit": line.productId || "",
          Quantité: line.quantity || 0,
          "Prix HT": line.price || 0,
          "Remise %": line.discount || 0,
          "Total HT": line.totalHT || 0,
        }))
      ),
      ...(backupData.invoices || []).flatMap((doc) =>
        (doc.lines || []).map((line, index) => ({
          Type: "Facture",
          "ID document": doc.id,
          Numéro: doc.number || "",
          Ligne: index + 1,
          Produit: line.description || "",
          "ID produit": line.productId || "",
          Quantité: line.quantity || 0,
          "Prix HT": line.price || 0,
          "Remise %": line.discount || 0,
          "Total HT": line.totalHT || 0,
        }))
      ),
    ];

    const settingsSheet = Object.entries(backupData.settings || {}).map(([key, value]) => ({
      Clé: key,
      Valeur: typeof value === "object" ? JSON.stringify(value) : value,
    }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clientsSheet), "Clients");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(productsSheet), "Produits");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(categoriesSheet), "Categories");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(quotesSheet), "Devis");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(invoicesSheet), "Factures");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(linesSheet), "Lignes");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(settingsSheet), "Parametres");

    XLSX.writeFile(workbook, `${backupName}.xlsx`);
    setMessage("Sauvegarde Excel exportée.");
  }

  function restoreBackup(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const confirmed = window.confirm(
      "Restaurer cette sauvegarde va remplacer les données actuelles du CRM. Continuer ?"
    );

    if (!confirmed) {
      e.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const restoredData = normalizeData(parsed.data || parsed);

        await setData(restoredData);
        setMessage("Sauvegarde restaurée avec succès. Les données ont aussi été synchronisées avec Supabase.");
      } catch (error) {
        console.error(error);
        setMessage("Erreur : fichier de sauvegarde JSON invalide.");
      } finally {
        e.target.value = "";
      }
    };

    reader.readAsText(file);
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Sauvegarde / backup</h2>
          <p>Exporte ou restaure toutes les données importantes du CRM.</p>
        </div>
      </div>

      <div className="stats">
        <div className="card stat"><span>Clients</span><strong>{backupData.clients.length}</strong></div>
        <div className="card stat"><span>Produits</span><strong>{backupData.products.length}</strong></div>
        <div className="card stat"><span>Factures</span><strong>{backupData.invoices.length}</strong></div>
        <div className="card stat"><span>Devis</span><strong>{backupData.quotes.length}</strong></div>
      </div>

      <div className="grid two">
        <div className="card">
          <h3>Exporter une sauvegarde</h3>
          <p className="muted">Le JSON sert à restaurer le CRM. L'Excel sert à consulter ou archiver les données.</p>
          <div className="actions">
            <button type="button" className="primary" onClick={exportJSON}>Exporter en JSON</button>
            <button type="button" onClick={exportExcel}>Exporter en Excel</button>
          </div>
        </div>

        <div className="card">
          <h3>Restaurer une sauvegarde</h3>
          <p className="muted">Sélectionne un fichier JSON exporté depuis ce CRM. Les données actuelles seront remplacées.</p>
          <input type="file" accept=".json,application/json" onChange={restoreBackup} />
        </div>
      </div>

      {message && <div className="card"><strong>{message}</strong></div>}
    </section>
  );
}

function Settings({ data, setData }) {
  const [form, setForm] = useState(data.settings);

  function submit(e) {
    e.preventDefault();
    setData({ ...data, settings: { ...form, taxRate: parseDecimal(form.taxRate) } });
    alert("Paramètres sauvegardés.");
  }

  return (
    <section>
      <div className="page-header"><div><h2>Paramètres</h2><p>Infos utilisées sur les devis et factures.</p></div></div>
      <form className="card form-grid" onSubmit={submit}>
        <input placeholder="Nom entreprise" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        <input placeholder="Email entreprise" value={form.companyEmail} onChange={(e) => setForm({ ...form, companyEmail: e.target.value })} />
        <label>Adresse Gmail à utiliser pour l'envoi</label>
        <select value={form.gmailSenderEmail || ""} onChange={(e) => setForm({ ...form, gmailSenderEmail: e.target.value })}>
          {(form.gmailSenders || "ac.creation.officiel@gmail.com|AC Création").split("\n").map((line) => {
            const [email, label] = line.split("|");
            const cleanEmail = (email || "").trim();
            if (!cleanEmail) return null;
            return <option key={cleanEmail} value={cleanEmail}>{label ? `${label.trim()} — ${cleanEmail}` : cleanEmail}</option>;
          })}
        </select>
        <textarea
          placeholder={"Adresses Gmail disponibles, une par ligne. Exemple :\nac.creation.officiel@gmail.com|AC Création\ndos.santos.alves.daniel@gmail.com|Daniel personnel"}
          value={form.gmailSenders || ""}
          onChange={(e) => {
            const value = e.target.value;
            const firstEmail = value.split("\n").map((line) => line.split("|")[0]?.trim()).find(Boolean) || "";
            setForm({ ...form, gmailSenders: value, gmailSenderEmail: form.gmailSenderEmail || firstEmail });
          }}
        />
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

function Clients({ data, setData }) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", address: "", status: "Prospect", notes: "" });

  const itemsPerPage = 10;
  const clients = data.clients.filter((c) => [c.name, c.email, c.phone, c.company, c.status, c.address].join(" ").toLowerCase().includes(search.toLowerCase()));
  const clientTotalPages = Math.max(1, Math.ceil(clients.length / itemsPerPage));
  const clientPage = Math.min(currentPage, clientTotalPages);
  const paginatedClients = clients.slice((clientPage - 1) * itemsPerPage, clientPage * itemsPerPage);
  const selectedClient = data.clients.find((c) => c.id === selectedClientId);

  function reset() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", company: "", address: "", status: "Prospect", notes: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name) return alert("Le nom du client est obligatoire.");
    if (editing) {
      setData({ ...data, clients: data.clients.map((c) => (c.id === editing ? { ...c, ...form } : c)) });
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
    if (!confirm("Supprimer ce client ?")) return;
    setData({ ...data, clients: data.clients.filter((c) => c.id !== id) });
    if (selectedClientId === id) setSelectedClientId(null);
  }

  return (
    <section>
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

      <input className="search" placeholder="Rechercher un client..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />

      <div className="two-columns">
        <div className="table card">
          <table>
            <thead><tr><th>Nom</th><th>Email</th><th>Téléphone</th><th>Statut</th><th>Actions</th></tr></thead>
            <tbody>
              {paginatedClients.map((c) => (
                <tr key={c.id}>
                  <td><button className="link-button" onClick={() => setSelectedClientId(c.id)}>{c.name}</button></td>
                  <td>{c.email}</td><td>{c.phone}</td><td><span className={statusClass(c.status)}>{c.status}</span></td>
                  <td><button onClick={() => edit(c)}>Modifier</button><button className="danger" onClick={() => remove(c.id)}>Supprimer</button></td>
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

        <div className="card">
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
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Documents({ type, data, setData, invoiceFilter = "all", setInvoiceFilter}) {
  const isQuote = type === "quote";
  const listKey = isQuote ? "quotes" : "invoices";
  const title = isQuote ? "Devis" : "Factures";
  const prefix = isQuote ? "DEV" : "FAC";
  const defaultStatus = isQuote ? "Brouillon" : "Non payée";

  const emptyLine = { productId: "", productSearch: "", description: "", quantity: 1, price: 0, discount: 0 };
  const [editingId, setEditingId] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);
  const [reminderDoc, setReminderDoc] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("dateDesc");
  const [form, setForm] = useState({
    clientId: "",
    status: defaultStatus,
    dueDate: isQuote ? "" : dateInputTodayPlus(30),
    paidAmount: 0,
    lines: [{ ...emptyLine }],
  });

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

  const filteredDocuments = type === "invoice" && invoiceFilter !== "all"
    ? sortedDocuments.filter((doc) => {
        const status = getInvoicePaymentStatus(doc);
        const total = Number(doc?.totalTTC || 0);
        const paid = Number(doc?.paidAmount || 0);

        if (invoiceFilter === "unpaid") return total > 0 && paid <= 0;
        if (invoiceFilter === "partial") return status === "Partiel";
        if (invoiceFilter === "overdue") return status === "En retard";
        return true;
      })
    : sortedDocuments;

  const documentTotalPages = Math.max(1, Math.ceil(filteredDocuments.length / itemsPerPage));
  const documentPage = Math.min(currentPage, documentTotalPages);
  const paginatedDocuments = filteredDocuments.slice((documentPage - 1) * itemsPerPage, documentPage * itemsPerPage);

  function lineTotal(line) {
    const subtotal = parseDecimal(line.quantity) * parseDecimal(line.price);
    const discountAmount = subtotal * (parseDecimal(line.discount) / 100);
    const totalHT = subtotal - discountAmount;
    return { subtotal, discountAmount, totalHT };
  }

  const totals = useMemo(() => {
    const subtotal = form.lines.reduce((sum, line) => sum + lineTotal(line).subtotal, 0);
    const discountAmount = form.lines.reduce((sum, line) => sum + lineTotal(line).discountAmount, 0);
    const totalHT = form.lines.reduce((sum, line) => sum + lineTotal(line).totalHT, 0);
    const taxAmount = totalHT * (parseDecimal(data.settings.taxRate) / 100);
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
      updateLine(index, { productId: "", productSearch: "", description: "", price: 0 });
      return;
    }

    updateLine(index, {
      productId: product.id,
      productSearch: productLabel(product),
      description: product.description || product.name || "",
      price: product.price,
    });
  }

  function updateProductSearch(index, value) {
    const product = (data.products || []).find((p) => productLabel(p) === value);

    if (product) {
      selectProduct(index, product.id);
    } else {
      updateLine(index, { productId: "", productSearch: value });
    }
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
    setForm({
      clientId: "",
      status: defaultStatus,
      dueDate: isQuote ? "" : dateInputTodayPlus(30),
      paidAmount: 0,
      lines: [{ ...emptyLine }],
    });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.clientId) return alert("Choisis un client.");

    const cleanLines = form.lines
      .map((line) => ({
        ...line,
        quantity: parseDecimal(line.quantity),
        price: parseDecimal(line.price),
        discount: parseDecimal(line.discount),
        ...lineTotal(line),
      }))
      .filter((line) => line.description && line.quantity > 0);

    if (cleanLines.length === 0) return alert("Ajoute au moins un produit ou une prestation.");

    const firstDescription = cleanLines.length === 1 ? cleanLines[0].description : `${cleanLines.length} lignes`;

    if (editingId) {
      setData({
        ...data,
        [listKey]: documents.map((d) =>
          d.id === editingId
            ? {
                ...d,
                clientId: form.clientId,
                status: isQuote ? form.status : getInvoicePaymentStatus({ ...d, ...totals, paidAmount: parseDecimal(form.paidAmount), dueDate: inputDateToFrench(form.dueDate) }),
                dueDate: isQuote ? d.dueDate : inputDateToFrench(form.dueDate),
                paidAmount: isQuote ? d.paidAmount : parseDecimal(form.paidAmount),
                description: firstDescription,
                lines: cleanLines,
                taxRate: data.settings.taxRate,
                ...totals,
              }
            : d
        ),
      });
    } else {
      const doc = {
        id: uid(),
        number: `${prefix}-${String(documents.length + 1).padStart(4, "0")}`,
        date: today(),
        taxRate: data.settings.taxRate,
        clientId: form.clientId,
        status: isQuote ? form.status : getInvoicePaymentStatus({ totalTTC: totals.totalTTC, paidAmount: parseDecimal(form.paidAmount), dueDate: inputDateToFrench(form.dueDate), status: form.status }),
        dueDate: isQuote ? "" : inputDateToFrench(form.dueDate),
        paidAmount: isQuote ? 0 : parseDecimal(form.paidAmount),
        description: firstDescription,
        lines: cleanLines,
        ...totals,
      };
      setData({ ...data, [listKey]: [...documents, doc] });
    }

    reset();
  }

  function edit(doc) {
    const lines = doc.lines?.length
      ? doc.lines
      : [{ productId: doc.productId || "", productSearch: "", description: doc.description || "", quantity: doc.quantity || 1, price: doc.price || 0, discount: doc.discount || 0 }];

    const linesWithSearch = lines.map((line) => {
      const product = (data.products || []).find((p) => String(p.id) === String(line.productId));
      return { ...emptyLine, ...line, productSearch: line.productSearch || productLabel(product) };
    });

    setEditingId(doc.id);
    setForm({
      clientId: doc.clientId,
      status: isQuote ? (doc.status || defaultStatus) : getInvoicePaymentStatus(doc),
      dueDate: isQuote ? "" : frenchDateToInput(doc.dueDate) || dateInputTodayPlus(30),
      paidAmount: doc.paidAmount || (doc.status === "Payée" ? doc.totalTTC : 0) || 0,
      lines: linesWithSearch,
    });
  }

  function remove(id) {
    if (!confirm(`Supprimer ce ${isQuote ? "devis" : "facture"} ?`)) return;
    setData({ ...data, [listKey]: documents.filter((d) => d.id !== id) });
  }

  function updateStatus(id, status) {
    setData({
      ...data,
      [listKey]: documents.map((d) => {
        if (d.id !== id) return d;
        if (isQuote) return { ...d, status };

        let paidAmount = Number(d.paidAmount || 0);
        if (status === "Payée") paidAmount = Number(d.totalTTC || 0);
        if (status === "Non payée") paidAmount = 0;

        return { ...d, status, paidAmount };
      }),
    });
  }

  function updatePaidAmount(id, paidAmount) {
    setData({
      ...data,
      [listKey]: documents.map((d) =>
        d.id === id
          ? { ...d, paidAmount: parseDecimal(paidAmount), status: getInvoicePaymentStatus({ ...d, paidAmount: parseDecimal(paidAmount) }) }
          : d
      ),
    });
  }

  function convertQuoteToInvoice(doc) {
    const invoice = {
      ...doc,
      id: uid(),
      number: `FAC-${String(data.invoices.length + 1).padStart(4, "0")}`,
      date: today(),
      dueDate: inputDateToFrench(dateInputTodayPlus(30)),
      paidAmount: 0,
      status: "Non payée",
      convertedFrom: doc.number,
    };
    setData({ ...data, invoices: [...data.invoices, invoice] });
    alert("Devis converti en facture.");
  }

  return (
    <section>
      <div className="page-header"><div><h2>{title}</h2>
      {type === "invoice" && invoiceFilter !== "all" && (
        <div className="filter-banner">
          <strong>Filtre actif :</strong>{" "}
          {invoiceFilter === "unpaid" ? "Factures non payées" : invoiceFilter === "partial" ? "Factures partielles" : "Factures en retard"}
          <button type="button" onClick={() => setInvoiceFilter("all")}>Afficher toutes</button>
        </div>
      )}
<p>Crée des {isQuote ? "devis" : "factures"} avec plusieurs produits ou prestations.</p></div></div>

      <form className="card" onSubmit={submit}>
        <div className="document-form-header">
          <select value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })}>
            <option value="">Choisir un client</option>
            {data.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            {isQuote ? <><option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Refusé</option></> : <><option>Non payée</option><option>Partiel</option><option>Payée</option><option>En retard</option></>}
          </select>
        </div>

        {!isQuote && (
          <div className="document-form-header" style={{ marginTop: 12 }}>
            <label>
              Date d'échéance
              <input
                type="date"
                value={form.dueDate || ""}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </label>
            <label>
              Montant déjà payé
              <input
                type="text"
                inputMode="decimal"
                value={form.paidAmount || ""}
                onChange={(e) => setForm({ ...form, paidAmount: e.target.value })}
                placeholder="0,00"
              />
            </label>
            <div className="total-box">
              <span>Restant : {money(Math.max(0, totals.totalTTC - parseDecimal(form.paidAmount)))}</span>
              <strong>Statut : {getInvoicePaymentStatus({ totalTTC: totals.totalTTC, paidAmount: parseDecimal(form.paidAmount), dueDate: inputDateToFrench(form.dueDate), status: form.status })}</strong>
            </div>
          </div>
        )}

        <div className="document-lines">
          <div className="document-line document-line-head">
            <span>Produit</span><span>Description</span><span>Qté</span><span>Prix HT</span><span>Remise %</span><span>Total HT</span><span></span>
          </div>

          {form.lines.map((line, index) => {
            const total = lineTotal(line).totalHT;
            return (
              <div className="document-line" key={index}>
                <>
                  <input
                    list={`products-list-${index}`}
                    placeholder="Rechercher un produit"
                    value={line.productSearch || ""}
                    onChange={(e) => updateProductSearch(index, e.target.value)}
                  />
                  <datalist id={`products-list-${index}`}>
                    {(data.products || []).map((p) => <option key={p.id} value={productLabel(p)} />)}
                  </datalist>
                </>
                <input placeholder="Produit / Prestation" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
                <input type="number" min="1" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
                <input type="text" inputMode="decimal" value={line.price} onChange={(e) => updateLine(index, { price: e.target.value })} />
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
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              {!isQuote && <th>Échéance</th>}
              <th>Client</th>
              <th>Lignes</th>
              <th>Total TTC</th>
              {!isQuote && <th>Payé</th>}
              {!isQuote && <th>Restant</th>}
              <th>Statut</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedDocuments.map((d) => (
              <tr key={d.id}>
                <td>{d.number}</td>
                <td>{d.date}</td>
                {!isQuote && <td>{d.dueDate || "-"}</td>}
                <td>{clientName(data, d.clientId)}</td>
                <td>{d.lines?.length || 1}</td>
                <td>{money(d.totalTTC)}</td>
                {!isQuote && (
                  <td>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={d.paidAmount || ""}
                      onChange={(e) => updatePaidAmount(d.id, e.target.value)}
                      style={{ width: 90 }}
                    />
                  </td>
                )}
                {!isQuote && <td>{money(remainingAmount(d))}</td>}
                <td>
                  <select value={isQuote ? d.status : getInvoicePaymentStatus(d)} onChange={(e) => updateStatus(d.id, e.target.value)}>
                    {isQuote ? <><option>Brouillon</option><option>Envoyé</option><option>Accepté</option><option>Refusé</option></> : <><option>Non payée</option><option>Partiel</option><option>Payée</option><option>En retard</option></>}
                  </select>
                </td>
                <td className="actions">
                  <button onClick={() => setPreviewDoc(d)}>Voir</button>
                  <button onClick={() => edit(d)}>Modifier</button>
                  {isQuote && <button onClick={() => convertQuoteToInvoice(d)}>Convertir</button>}
                  {!isQuote && remainingAmount(d) > 0 && <button onClick={() => setReminderDoc(d)}>Relance</button>}
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

      {previewDoc && <DocumentPreview doc={previewDoc} type={type} data={data} onClose={() => setPreviewDoc(null)} />}

      {reminderDoc && (
        <ReminderModal
          doc={reminderDoc}
          client={data.clients.find((c) => c.id === reminderDoc.clientId)}
          settings={data.settings}
          onClose={() => setReminderDoc(null)}
        />
      )}
    </section>
  );
}


function ReminderModal({ doc, client, settings, onClose }) {
  const message = buildReminderMessage(doc, client, settings);

  async function copyReminder() {
    try {
      await navigator.clipboard.writeText(message);
      alert("Relance copiée. Tu peux la coller dans Gmail.");
    } catch {
      alert("Impossible de copier automatiquement. Sélectionne le texte puis copie-le.");
    }
  }

  return (
    <div className="modal">
      <div className="modal-content">
        <div className="no-print modal-actions">
          <button onClick={onClose}>Fermer</button>
          <button className="primary" onClick={copyReminder}>Copier la relance</button>
        </div>

        <h2>Relance client</h2>
        <p className="muted">
          Facture {doc.number} — restant à payer : <strong>{money(remainingAmount(doc))}</strong>
        </p>
        <textarea
          readOnly
          value={message}
          style={{ width: "100%", minHeight: 320, marginTop: 12 }}
        />
      </div>
    </div>
  );
}

function DocumentPreview({ doc, type, data, onClose }) {
  const invoiceRef = useRef(null);
  const isQuote = type === "quote";
  const client = data.clients.find((c) => c.id === doc.clientId);
  const amountDue = isQuote ? (doc.totalTTC || 0) : remainingAmount(doc);
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



  async function createPdf(saveFile = true) {
    if (!invoiceRef.current) return null;

    const documentLabel = isQuote ? "devis" : "facture";
    const safeNumber = String(doc.number || "document").replace(/[^a-zA-Z0-9_-]/g, "-");
    const filename = `${documentLabel}-${safeNumber}.pdf`;

    const canvas = await html2canvas(invoiceRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0,
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * usableWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = margin;

    pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeight);
    heightLeft -= pageHeight - margin * 2;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + margin;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, usableWidth, imgHeight);
      heightLeft -= pageHeight - margin * 2;
    }

    if (saveFile) pdf.save(filename);

    return { pdf, filename };
  }

  async function downloadPdf() {
    try {
      await createPdf(true);
    } catch (error) {
      console.error(error);
      alert("Impossible de générer le PDF. Vérifie que html2canvas et jspdf sont bien installés.");
    }
  }

  return (
    <div className="modal">
      <div className="modal-content invoice-modal">
        <div className="no-print modal-actions">
          <button onClick={onClose}>Fermer</button>
                    <button className="primary" onClick={downloadPdf}>
            Télécharger PDF
          </button>
          <button onClick={() => window.print()}>
            Imprimer
          </button>
        </div>

        <div ref={invoiceRef} className="print-area invoice-template invoice-pink-template">
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
              {!isQuote && (
                <div className="invoice-date-box">
                  <span>Date d'échéance :</span>
                  <strong>{doc.dueDate || "-"}</strong>
                </div>
              )}
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
              {!isQuote && (
                <div>
                  <span>Déjà payé</span>
                  <strong>{money(doc.paidAmount || 0)}</strong>
                </div>
              )}
              <div className="invoice-final-due">
                <span>{isQuote ? "À PAYER" : "RESTANT À PAYER"}</span>
                <strong>{money(amountDue)}</strong>
              </div>
            </div>
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
            <strong>{data.settings.companyName} — Solutions digitales</strong>
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

function Categories({ data, setData }) {
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

function Products({ data, setData }) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [bulkCategory, setBulkCategory] = useState("");
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    price: "",
    stock: "",
    description: "",
  });

  const categories = data.categories || [];
  const itemsPerPage = 10;

  const products = (data.products || []).filter((product) => {
    const matchesSearch = [product.name, product.sku, product.category, product.description]
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesCategory = !categoryFilter || product.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const productTotalPages = Math.max(1, Math.ceil(products.length / itemsPerPage));
  const productPage = Math.min(currentPage, productTotalPages);
  const paginatedProducts = products.slice((productPage - 1) * itemsPerPage, productPage * itemsPerPage);

  function reset() {
    setEditing(null);
    setForm({ name: "", sku: "", category: "", price: "", stock: "", description: "" });
  }

  function submit(e) {
    e.preventDefault();
    if (!form.name) return alert("Nom du produit obligatoire.");

    const productData = {
      ...form,
      price: parseDecimal(form.price),
      stock: parseDecimal(form.stock),
    };

    if (editing) {
      setData({
        ...data,
        products: (data.products || []).map((p) =>
          p.id === editing ? { ...p, ...productData } : p
        ),
      });
    } else {
      setData({
        ...data,
        products: [...(data.products || []), { id: uid(), createdAt: today(), ...productData }],
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
      stock: product.stock || "",
      description: product.description || "",
    });
  }

  function remove(id) {
    if (!confirm("Supprimer ce produit ?")) return;
    setData({ ...data, products: (data.products || []).filter((p) => p.id !== id) });
    setSelectedProductIds(selectedProductIds.filter((productId) => productId !== id));
  }

  function toggleProductSelection(id) {
    setSelectedProductIds((current) =>
      current.includes(id)
        ? current.filter((productId) => productId !== id)
        : [...current, id]
    );
  }

  function toggleVisibleProducts() {
    const visibleIds = paginatedProducts.map((product) => product.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedProductIds.includes(id));

    if (allVisibleSelected) {
      setSelectedProductIds(selectedProductIds.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedProductIds([...new Set([...selectedProductIds, ...visibleIds])]);
    }
  }

  function applyBulkCategory() {
    if (!selectedProductIds.length) return alert("Sélectionne au moins un produit.");
    if (!bulkCategory) return alert("Choisis une catégorie.");

    setData({
      ...data,
      products: (data.products || []).map((product) =>
        selectedProductIds.includes(product.id)
          ? { ...product, category: bulkCategory }
          : product
      ),
    });

    setSelectedProductIds([]);
    setBulkCategory("");
    alert("Catégorie appliquée aux produits sélectionnés.");
  }

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Produits</h2>
          <p>Gère tes produits, prix, références et stocks.</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={submit}>
        <input placeholder="Nom produit *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input placeholder="Référence SKU" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          <option value="">Sans catégorie</option>
          {categories.map((category) => (
            <option key={category.id} value={category.name}>{category.name}</option>
          ))}
        </select>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Prix HT"
          value={String(form.price).replace(".", ",")}
          onChange={(e) => setForm({ ...form, price: e.target.value.replace(",", ".") })}
        />
        <input type="number" min="0" placeholder="Stock" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
        <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <button className="primary">{editing ? "Modifier" : "Ajouter produit"}</button>
        {editing && <button type="button" onClick={reset}>Annuler</button>}
      </form>

      <div className="filters-row">
        <input className="search" placeholder="Rechercher un produit..." value={search} onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }} />
        <select value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setCurrentPage(1); }}>
          <option value="">Toutes les catégories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.name}>{category.name}</option>
          ))}
        </select>
      </div>

      <div className="table card">
        <div className="bulk-actions">
          <strong>{selectedProductIds.length} produit(s) sélectionné(s)</strong>

          <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}>
            <option value="">Choisir une catégorie</option>
            {categories.map((category) => (
              <option key={category.id} value={category.name}>{category.name}</option>
            ))}
          </select>

          <button type="button" className="primary" onClick={applyBulkCategory}>
            Appliquer la catégorie
          </button>

          {selectedProductIds.length > 0 && (
            <button type="button" onClick={() => setSelectedProductIds([])}>
              Désélectionner
            </button>
          )}
        </div>

        <table>
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={paginatedProducts.length > 0 && paginatedProducts.every((product) => selectedProductIds.includes(product.id))}
                  onChange={toggleVisibleProducts}
                />
              </th>
              <th>Produit</th><th>SKU</th><th>Catégorie</th><th>Prix HT</th><th>Stock</th><th>Description</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProducts.map((product) => (
              <tr key={product.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedProductIds.includes(product.id)}
                    onChange={() => toggleProductSelection(product.id)}
                  />
                </td>
                <td>{product.name}</td>
                <td>{product.sku}</td>
                <td>{product.category}</td>
                <td>{money(product.price)}</td>
                <td>{product.stock}</td>
                <td>{product.description}</td>
                <td>
                  <button onClick={() => edit(product)}>Modifier</button>
                  <button className="danger" onClick={() => remove(product.id)}>Supprimer</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <PaginationControls
          page={productPage}
          totalPages={productTotalPages}
          totalItems={products.length}
          perPage={itemsPerPage}
          onPageChange={setCurrentPage}
        />
      </div>
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

