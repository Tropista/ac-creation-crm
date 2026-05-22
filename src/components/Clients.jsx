import { useMemo, useState } from "react";
import PaginationControls from "./PaginationControls";
import { canDeleteData } from "../services/authService";
import { showToast } from "../utils/toast";

function statusClass(status) {
  const value = String(status || "").toLowerCase();

  if (value.includes("vip")) return "vip";
  if (value.includes("actif")) return "client";
  if (value.includes("prospect")) return "quote";
  if (value.includes("accept")) return "client";
  if (value.includes("pay")) return "client";
  if (value.includes("impay")) return "danger";
  if (value.includes("retard")) return "danger";
  if (value.includes("inactif")) return "danger";

  return "client";
}

function money(value) {
  return (
    Number(value || 0).toLocaleString("fr-FR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function uid() {
  return crypto.randomUUID();
}

function today() {
  return new Date().toISOString();
}

function formatDate(value) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function docDate(doc) {
  return doc?.date || doc?.createdAt || doc?.updatedAt || "";
}

function docTotal(doc) {
  return Number(doc?.totalTTC || doc?.total || doc?.amount || 0);
}

function isAcceptedQuote(quote) {
  const status = String(quote?.status || "").toLowerCase();
  return status.includes("accept") || status.includes("valid") || status.includes("sign");
}

function isPaidInvoice(invoice) {
  const status = String(invoice?.status || "").toLowerCase();
  return status.includes("pay") || status.includes("régl") || status.includes("regl");
}

function isUnpaidInvoice(invoice) {
  const status = String(invoice?.status || "").toLowerCase();
  return (
    status.includes("impay") ||
    status.includes("non payé") ||
    status.includes("non paye") ||
    status.includes("en attente") ||
    status.includes("retard")
  );
}

const emptyClientForm = {
  name: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  status: "Prospect",
  clientType: "Professionnel",
  website: "",
  vat: "",
  zip: "",
  city: "",
  country: "Luxembourg",
  notes: "",
};

export default function Clients({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
  setPage,
}) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("nameAsc");
  const [clientTab, setClientTab] = useState("infos");
  const [form, setForm] = useState(emptyClientForm);
  const [showClientForm, setShowClientForm] = useState(false);

  const itemsPerPage = 25;

  const clients = (data.clients || [])
    .filter((client) =>
      [
        client.name,
        client.email,
        client.phone,
        client.company,
        client.status,
        client.address,
        client.clientType,
        client.website,
        client.vat,
        client.zip,
        client.city,
        client.country,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    )
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
  const selectedClient = (data.clients || []).find((client) => client.id === selectedClientId);

  const selectedClientInvoices = useMemo(() => {
    if (!selectedClient) return [];

    return (data.invoices || [])
      .filter((invoice) => String(invoice.clientId) === String(selectedClient.id))
      .sort((a, b) => new Date(docDate(b) || 0) - new Date(docDate(a) || 0));
  }, [data.invoices, selectedClient]);

  const selectedClientQuotes = useMemo(() => {
    if (!selectedClient) return [];

    return (data.quotes || [])
      .filter((quote) => String(quote.clientId) === String(selectedClient.id))
      .sort((a, b) => new Date(docDate(b) || 0) - new Date(docDate(a) || 0));
  }, [data.quotes, selectedClient]);

  const clientHistory = useMemo(() => {
    const quotes = selectedClientQuotes.map((quote) => ({
      id: `quote-${quote.id}`,
      type: "Devis",
      docType: "quote",
      doc: quote,
      icon: "🧾",
      title: quote.number || quote.reference || "Devis",
      status: quote.status || "Sans statut",
      date: docDate(quote),
      total: docTotal(quote),
    }));

    const invoices = selectedClientInvoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: "Facture",
      docType: "invoice",
      doc: invoice,
      icon: "💶",
      title: invoice.number || invoice.reference || "Facture",
      status: invoice.status || "Sans statut",
      date: docDate(invoice),
      total: docTotal(invoice),
    }));

    const created = selectedClient
      ? [
          {
            id: `client-${selectedClient.id}`,
            type: "Client",
            icon: "👤",
            title: "Client créé",
            status: selectedClient.status || "Sans statut",
            date: selectedClient.createdAt,
            total: 0,
          },
        ]
      : [];

    return [...quotes, ...invoices, ...created].sort(
      (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
    );
  }, [selectedClient, selectedClientInvoices, selectedClientQuotes]);

  const selectedClientInvoiceTotal = selectedClientInvoices.reduce(
    (sum, invoice) => sum + docTotal(invoice),
    0
  );

  const selectedClientQuoteTotal = selectedClientQuotes.reduce(
    (sum, quote) => sum + docTotal(quote),
    0
  );

  const selectedClientPaidInvoices = selectedClientInvoices.filter(isPaidInvoice);
  const selectedClientUnpaidInvoices = selectedClientInvoices.filter(isUnpaidInvoice);
  const selectedClientAcceptedQuotes = selectedClientQuotes.filter(isAcceptedQuote);
  const selectedClientLastInvoice = selectedClientInvoices[0];
  const selectedClientLastQuote = selectedClientQuotes[0];
  const selectedClientLastOrder = selectedClientInvoices[0] || selectedClientAcceptedQuotes[0] || null;

  const selectedClientPaidTotal = selectedClientPaidInvoices.reduce(
    (sum, invoice) => sum + docTotal(invoice),
    0
  );

  const clientAverageBasket =
    selectedClientInvoices.length > 0 ? selectedClientInvoiceTotal / selectedClientInvoices.length : 0;

  const clientConversionRate =
    selectedClientQuotes.length > 0
      ? (selectedClientAcceptedQuotes.length / selectedClientQuotes.length) * 100
      : 0;

  const clientUnpaidAmount = selectedClientUnpaidInvoices.reduce(
    (sum, invoice) => sum + docTotal(invoice),
    0
  );

  const topProducts = useMemo(() => {
    const stats = {};

    selectedClientInvoices.forEach((invoice) => {
      (invoice.lines || []).forEach((line) => {
        const key = line.description || "Sans nom";
        stats[key] = (stats[key] || 0) + Number(line.quantity || 0);
      });
    });

    return Object.entries(stats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [selectedClientInvoices]);

  function reset() {
    setEditing(null);
    setForm(emptyClientForm);
    setShowClientForm(false);
  }

  function submit(e) {
    e.preventDefault();

    if (!form.name) {
      showToast("Le nom du client est obligatoire.", "error");
      return;
    }

    if (editing) {
      setData({
        ...data,
        clients: (data.clients || []).map((client) =>
          client.id === editing ? { ...client, ...form } : client
        ),
      });

      logActivity?.("Modification client", form.name);
    } else {
      const client = {
        id: uid(),
        createdAt: today(),
        ...form,
      };

      setData({
        ...data,
        clients: [...(data.clients || []), client],
      });

      setSelectedClientId(client.id);
      setClientTab("infos");
      logActivity?.("Création client", client.name);
    }

    reset();
  }

  function edit(client) {
    setEditing(client.id);
    setShowClientForm(true);

    setForm({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      company: client.company || "",
      address: client.address || "",
      status: client.status || "Prospect",
      clientType: client.clientType || "Professionnel",
      website: client.website || "",
      vat: client.vat || "",
      zip: client.zip || "",
      city: client.city || "",
      country: client.country || "Luxembourg",
      notes: client.notes || "",
    });
  }

  function remove(id) {
    if (!canDeleteData(currentRole)) {
      showToast("Ton rôle ne permet pas de supprimer.", "error");
      return;
    }

    if (!confirm("Supprimer ce client ?")) return;

    const removedClient = (data.clients || []).find((client) => client.id === id);

    setData({
      ...data,
      clients: (data.clients || []).filter((client) => client.id !== id),
    });

    logActivity?.("Suppression client", removedClient?.name || id);

    if (selectedClientId === id) {
      setSelectedClientId(null);
    }
  }

  function goToDocumentPage(pageName) {
    if (!selectedClient) return;

    localStorage.setItem("crm_prefill_client_id", selectedClient.id);
    setPage?.(pageName);
  }

  function openDocument(doc, type) {
    if (!doc) return;

    localStorage.setItem("crm_open_document_id", doc.id);
    localStorage.setItem("crm_open_document_type", type);

    setPage?.(type === "quote" ? "quotes" : "invoices");
  }

  function remindClient(mode = "copy") {
    if (!selectedClient) return;

    const invoices = selectedClientUnpaidInvoices;

    if (invoices.length === 0) {
      showToast("Aucune facture impayée.", "info");
      return;
    }

    const invoiceList = invoices
      .map((inv) => `${inv.number} - ${money(docTotal(inv))}`)
      .join("\n");

    const text = `Bonjour ${selectedClient.name},

Nous vous rappelons que les factures suivantes restent impayées :

${invoiceList}

Montant total dû :
${money(clientUnpaidAmount)}

Merci.

AC Creation`;

    if (mode === "copy") {
      navigator.clipboard.writeText(text);
      showToast("Relance copiée", "success");
      return;
    }

    const subject = encodeURIComponent("Relance facture impayée - AC Creation");
    const body = encodeURIComponent(text);

    window.open(`mailto:${selectedClient.email || ""}?subject=${subject}&body=${body}`);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <section className="clients-page">
      <div className="page-header">
        <div>
          <h2>Clients</h2>
          <p>Ajoute tes prospects et clients.</p>
        </div>
      </div>

      <div className="clients-form-toggle">
        <button
          type="button"
          className="primary"
          onClick={() => {
            setEditing(null);
            setForm(emptyClientForm);
            setShowClientForm(true);
          }}
        >
          + Nouveau client
        </button>
      </div>

      {showClientForm && (
        <form className="card form-grid client-form-panel" onSubmit={submit}>
          <input placeholder="Nom client *" value={form.name} onChange={(e) => updateForm("name", e.target.value)} />
          <input placeholder="Email" value={form.email} onChange={(e) => updateForm("email", e.target.value)} />
          <input placeholder="Téléphone" value={form.phone} onChange={(e) => updateForm("phone", e.target.value)} />
          <input placeholder="Société" value={form.company} onChange={(e) => updateForm("company", e.target.value)} />
          <input placeholder="Site web" value={form.website} onChange={(e) => updateForm("website", e.target.value)} />
          <input placeholder="TVA" value={form.vat} onChange={(e) => updateForm("vat", e.target.value)} />
          <input placeholder="Adresse" value={form.address} onChange={(e) => updateForm("address", e.target.value)} />
          <input placeholder="Code postal" value={form.zip} onChange={(e) => updateForm("zip", e.target.value)} />
          <input placeholder="Ville" value={form.city} onChange={(e) => updateForm("city", e.target.value)} />
          <input placeholder="Pays" value={form.country} onChange={(e) => updateForm("country", e.target.value)} />

          <select value={form.clientType} onChange={(e) => updateForm("clientType", e.target.value)}>
            <option>Professionnel</option>
            <option>Particulier</option>
            <option>Association</option>
          </select>

          <select value={form.status} onChange={(e) => updateForm("status", e.target.value)}>
            <option>Prospect</option>
            <option>Client</option>
            <option>VIP</option>
            <option>Inactif</option>
          </select>

          <textarea placeholder="Notes" value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} />

          <button className="primary">{editing ? "Modifier" : "Ajouter"}</button>
          <button type="button" onClick={reset}>
            Annuler
          </button>
        </form>
      )}

      <div className="clients-toolbar">
        <input
          className="search"
          placeholder="Rechercher un client..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
        />

        <select
          className="client-sort"
          value={sortBy}
          onChange={(e) => {
            setSortBy(e.target.value);
            setCurrentPage(1);
          }}
        >
          <option value="nameAsc">Nom : A → Z</option>
          <option value="nameDesc">Nom : Z → A</option>
          <option value="dateDesc">Date : récent</option>
          <option value="dateAsc">Date : ancien</option>
          <option value="status">Statut</option>
        </select>
      </div>

      <div className="two-columns clients-layout">
        <div className="table card clients-table-card">
          <p className="muted">{clients.length} client(s) trouvé(s)</p>

          <PaginationControls
            page={clientPage}
            totalPages={clientTotalPages}
            onPageChange={setCurrentPage}
            totalItems={clients.length}
            perPage={itemsPerPage}
          />

          <div className="clients-erp-list">
            {paginatedClients.map((client) => {
              const clientInvoices = (data.invoices || []).filter(
                (invoice) => String(invoice.clientId) === String(client.id)
              );

              const clientCa = clientInvoices.reduce(
                (sum, invoice) => sum + docTotal(invoice),
                0
              );

              const isSelected = selectedClientId === client.id;

              return (
                <div
                  key={client.id}
                  className={isSelected ? "client-erp-row selected" : "client-erp-row"}
                  onClick={() => {
                    setSelectedClientId(client.id);
                    setClientTab("infos");
                  }}
                >
                  <div className="client-erp-avatar">
                    {(client.name || "?")
                      .split(" ")
                      .slice(0, 2)
                      .map((value) => value[0])
                      .join("")
                      .toUpperCase()}
                  </div>

                  <div className="client-erp-main">
                    <div className="client-erp-name-row">
                      <strong>{client.name || "Sans nom"}</strong>
                      <span className={"status-badge " + statusClass(client.status)}>
                        {client.status || "Prospect"}
                      </span>
                    </div>

                    <span className="client-erp-sub">
                      {client.email || client.phone || "Aucun contact"}
                    </span>

                    <div className="client-erp-meta">
                      <span>{client.company || client.clientType || "Client"}</span>
                      <span>CA : {money(clientCa)}</span>
                    </div>
                  </div>

                  <div className="client-erp-actions" onClick={(event) => event.stopPropagation()}>
                    <button type="button" onClick={() => edit(client)}>
                      Modifier
                    </button>

                    <button type="button" className="danger" onClick={() => remove(client.id)}>
                      Supprimer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <PaginationControls
            page={clientPage}
            totalPages={clientTotalPages}
            onPageChange={setCurrentPage}
            totalItems={clients.length}
            perPage={itemsPerPage}
          />
        </div>

        <div className="card client-side-card">
          <div className="client-header erp-client-header">
            <div className="erp-client-left">
              <div className="client-avatar">
                {(selectedClient?.name || "?")
                  .split(" ")
                  .slice(0, 2)
                  .map((value) => value[0])
                  .join("")
                  .toUpperCase()}
              </div>

              <div className="erp-client-title">
                <div className="erp-client-top">
                  <h2>{selectedClient?.name || "Fiche client"}</h2>

                  {selectedClient && (
                    <span className={"status-badge " + statusClass(selectedClient.status)}>
                      {selectedClient.status || "Client"}
                    </span>
                  )}
                </div>

                {selectedClient && (
                  <span className="erp-created">Client depuis le {formatDate(selectedClient.createdAt)}</span>
                )}
              </div>
            </div>

            {selectedClient && (
              <button
  className="erp-print-btn"
  onClick={() => {
    if (!selectedClient) return;

    const win = window.open("", "_blank");

    win.document.write(`
      <html>
        <head>
          <title>Fiche client</title>
         <style>
body{
  font-family:Arial,sans-serif;
  padding:22px;
  color:#111827;
  background:white;
}

.header{
  display:flex;
  align-items:center;
  gap:18px;
  border-bottom:2px solid #eee;
  padding-bottom:14px;
  margin-bottom:16px;
}

.avatar{
  width:58px;
  height:58px;
  border-radius:50%;
  background:linear-gradient(135deg,#f472b6,#8b5cf6);
  color:white;
  display:flex;
  align-items:center;
  justify-content:center;
  font-size:20px;
  font-weight:700;
}

h1{
  margin:0;
  font-size:24px;
}

.badge{
  display:inline-block;
  padding:4px 10px;
  border-radius:20px;
  background:#dcfce7;
  color:#15803d;
  font-weight:700;
  margin-top:6px;
}

.grid{
  display:grid;
  grid-template-columns:repeat(2,1fr);
  gap:10px;
  margin-top:14px;
}

.box{
  border:1px solid #e5e7eb;
  border-radius:12px;
  padding:10px 12px;
  background:#f8fafc;
  page-break-inside:avoid;
}

.box strong{
  display:block;
  font-size:10px;
  color:#64748b;
  margin-bottom:4px;
  text-transform:uppercase;
}

.box span{
  font-size:13px;
  font-weight:600;
}

.notes-box{
  margin-top:10px;
}

@page{
  size:A4;
  margin:10mm;
}
</style>
        </head>
        <body>
          <div class="header">
            <div class="avatar">
              ${(selectedClient.name || "?").slice(0,2).toUpperCase()}
            </div>
            <div>
              <h1>${selectedClient.name || "-"}</h1>
              <div>Client depuis le ${formatDate(selectedClient.createdAt)}</div>
              <div class="badge">${selectedClient.status || "Client"}</div>
            </div>
          </div>

          <div class="grid">
            <div class="box"><strong>Société</strong><span>${selectedClient.company || "-"}</span></div>
            <div class="box"><strong>Type client</strong><span>${selectedClient.clientType || "-"}</span></div>
            <div class="box"><strong>Email</strong><span>${selectedClient.email || "-"}</span></div>
            <div class="box"><strong>Téléphone</strong><span>${selectedClient.phone || "-"}</span></div>
            <div class="box"><strong>Site web</strong><span>${selectedClient.website || "-"}</span></div>
            <div class="box"><strong>TVA</strong><span>${selectedClient.vat || "-"}</span></div>
            <div class="box"><strong>Adresse</strong><span>${selectedClient.address || "-"}</span></div>
            <div class="box"><strong>Ville</strong><span>${selectedClient.zip || ""} ${selectedClient.city || ""}</span></div>
            <div class="box"><strong>Pays</strong><span>${selectedClient.country || "-"}</span></div>
            <div class="box"><strong>CA total</strong><span>${money(selectedClientInvoiceTotal)}</span></div>
            <div class="box"><strong>Devis</strong><span>${selectedClientQuotes.length}</span></div>
            <div class="box"><strong>Factures</strong><span>${selectedClientInvoices.length}</span></div>
          </div>

          <div class="box notes-box">
            <strong>Notes</strong>
            <span>${selectedClient.notes || "-"}</span>
          </div>
        </body>
      </html>
    `);

    win.document.close();

    setTimeout(() => {
      win.print();
    }, 300);
  }}
>
  🖨 Imprimer la fiche
</button>
            )}
          </div>

          {selectedClient && (
            <div className="client-mini-stats">
              <div>
                <strong>{selectedClientQuotes.length}</strong>
                <span>Devis</span>
              </div>

              <div>
                <strong>{selectedClientInvoices.length}</strong>
                <span>Factures</span>
              </div>

              <div>
                <strong>{money(selectedClientInvoiceTotal)}</strong>
                <span>CA total</span>
              </div>

              <div>
                <strong>{formatDate(selectedClientLastInvoice?.date || selectedClientLastInvoice?.createdAt)}</strong>
                <span>Dernière facture</span>
              </div>
            </div>
          )}

          {!selectedClient ? (
            <p className="muted">Clique sur un client pour voir sa fiche.</p>
          ) : (
            <>
              <div className="client-tabs">
                <button type="button" className={clientTab === "infos" ? "active" : ""} onClick={() => setClientTab("infos")}>ℹ Informations</button>
                <button type="button" className={clientTab === "contact" ? "active" : ""} onClick={() => setClientTab("contact")}>📞 Contact</button>
                <button type="button" className={clientTab === "address" ? "active" : ""} onClick={() => setClientTab("address")}>📍 Adresse</button>
                <button type="button" className={clientTab === "documents" ? "active" : ""} onClick={() => setClientTab("documents")}>📄 Documents</button>
                <button type="button" className={clientTab === "history" ? "active" : ""} onClick={() => setClientTab("history")}>🕘 Activité</button>
              </div>

              <div className="client-card">
                {clientTab === "infos" && (
                  <div className="erp-info-grid">
                    <InfoBox label="Société" value={selectedClient.company} />
                    <InfoBox label="Type client" value={selectedClient.clientType} />
                    <InfoBox label="Site web" value={selectedClient.website} />
                    <InfoBox label="TVA" value={selectedClient.vat} />
                    <InfoBox label="Statut" value={selectedClient.status} />
                    <InfoBox label="Notes" value={selectedClient.notes} />
                  </div>
                )}

                {clientTab === "contact" && (
                  <div className="erp-info-grid">
                    <InfoBox label="Email" value={selectedClient.email} />
                    <InfoBox label="Téléphone" value={selectedClient.phone} />
                  </div>
                )}

                {clientTab === "address" && (
                  <div className="erp-info-grid">
                    <InfoBox label="Adresse" value={selectedClient.address} />
                    <InfoBox label="CP" value={selectedClient.zip} />
                    <InfoBox label="Ville" value={selectedClient.city} />
                    <InfoBox label="Pays" value={selectedClient.country} />
                  </div>
                )}

                
                {clientTab === "documents" && (
                  <div className="client-documents">
                    <div className="client-doc-top">
                      <DashboardCard label="CA client" value={money(selectedClientInvoiceTotal)} />
                      <DashboardCard label="Impayés" value={money(clientUnpaidAmount)} danger />
                      <DashboardCard label="Devis" value={selectedClientQuotes.length} />
                      <DashboardCard label="Factures" value={selectedClientInvoices.length} />
                    </div>

                    <div className="client-doc-actions">
                      <button onClick={()=>goToDocumentPage("quotes")}>🧾 Nouveau devis</button>
                      <button onClick={()=>goToDocumentPage("invoices")}>💶 Nouvelle facture</button>
                      {selectedClientUnpaidInvoices.length>0 && (
                        <button className="danger" onClick={()=>remindClient("mail")}>✉ Relancer</button>
                      )}
                    </div>

                    <div className="client-doc-grid">
                      <div className="client-history-section">
                        <h4>Derniers devis</h4>
                        <div className="client-history-list">
                          {selectedClientQuotes.slice(0,5).map((quote)=>(
                            <DocumentRow key={quote.id} doc={quote} type="quote" label="Devis" onOpen={openDocument}/>
                          ))}
                        </div>
                      </div>

                      <div className="client-history-section">
                        <h4>Dernières factures</h4>
                        <div className="client-history-list">
                          {selectedClientInvoices.slice(0,5).map((invoice)=>(
                            <DocumentRow key={invoice.id} doc={invoice} type="invoice" label="Facture" onOpen={openDocument}/>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}



                {clientTab === "history" && (
                  <Timeline items={clientHistory.slice(0, 8)} />
                )}


              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function InfoBox({ label, value }) {
  return (
    <div className="client-info-box">
      <strong>{label}</strong>
      <span>{value || "-"}</span>
    </div>
  );
}

function Kpi({ label, value }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DashboardCard({ label, value, danger = false }) {
  return (
    <div className={danger ? "client-dashboard-card danger" : "client-dashboard-card"}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function DocumentRow({ doc, type, label, onOpen }) {
  return (
    <div className="client-history-item clickable" onClick={() => onOpen(doc, type)}>
      <div>
        <strong>{doc.number || doc.reference || label}</strong>
        <span>{formatDate(docDate(doc))}</span>
      </div>

      <div>
        <strong>{money(docTotal(doc))}</strong>
        <span className={"status-badge " + statusClass(doc.status)}>{doc.status || "Sans statut"}</span>
      </div>
    </div>
  );
}

function Timeline({ items }) {
  if (!items.length) {
    return <p className="muted">Aucune activité pour ce client.</p>;
  }

  return (
    <div className="client-timeline">
      {items.map((item) => (
        <div className="timeline-item" key={item.id}>
          <div className="timeline-dot" />

          <div>
            <strong>
              {item.icon} {item.type} — {item.title}
            </strong>

            <p>
              {formatDate(item.date)} · {item.status}
              {item.total > 0 ? ` · ${money(item.total)}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
