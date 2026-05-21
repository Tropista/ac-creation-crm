import { useMemo, useState } from "react";
import PaginationControls from "./PaginationControls";
import { canDeleteData } from "../services/authService";

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
      maximumFractionDigits: 2
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

export default function Clients({
  data,
  setData,
  currentRole = "Admin",
  logActivity,
  setPage
}) {
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("nameAsc");
  const [clientTab, setClientTab] = useState("infos");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    address: "",
    status: "Prospect",
    notes: ""
  });

  const itemsPerPage = 25;

  const clients = (data.clients || [])
    .filter((client) =>
      [
        client.name,
        client.email,
        client.phone,
        client.company,
        client.status,
        client.address
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
      icon: "🧾",
      title: quote.number || quote.reference || "Devis",
      status: quote.status || "Sans statut",
      date: docDate(quote),
      total: docTotal(quote)
    }));

    const invoices = selectedClientInvoices.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      type: "Facture",
      icon: "💶",
      title: invoice.number || invoice.reference || "Facture",
      status: invoice.status || "Sans statut",
      date: docDate(invoice),
      total: docTotal(invoice)
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
            total: 0
          }
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
  selectedClientInvoices.length > 0
    ? selectedClientInvoiceTotal /
      selectedClientInvoices.length
    : 0;

const clientConversionRate =
  selectedClientQuotes.length > 0
    ? (
        selectedClientAcceptedQuotes.length /
        selectedClientQuotes.length
      ) * 100
    : 0;

const clientUnpaidAmount =
  selectedClientUnpaidInvoices.reduce(
    (sum, invoice) =>
      sum + docTotal(invoice),
    0
  );

const topProducts = useMemo(() => {
  const stats = {};

  selectedClientInvoices.forEach(
    (invoice) => {
      (invoice.lines || []).forEach(
        (line) => {
          const key =
            line.description ||
            "Sans nom";

          stats[key] =
            (stats[key] || 0) +
            Number(
              line.quantity || 0
            );
        }
      );
    }
  );

  return Object.entries(stats)
    .sort(
      (a, b) =>
        b[1] - a[1]
    )
    .slice(0, 5);

}, [selectedClientInvoices]);
  function reset() {
    setEditing(null);
    setForm({
      name: "",
      email: "",
      phone: "",
      company: "",
      address: "",
      status: "Prospect",
      notes: ""
    });
  }

  function submit(e) {
    e.preventDefault();

    if (!form.name) {
      alert("Le nom du client est obligatoire.");
      return;
    }

    if (editing) {
      setData({
        ...data,
        clients: (data.clients || []).map((client) =>
          client.id === editing ? { ...client, ...form } : client
        )
      });

      logActivity?.("Modification client", form.name);
    } else {
      const client = {
        id: uid(),
        createdAt: today(),
        ...form
      };

      setData({
        ...data,
        clients: [...(data.clients || []), client]
      });

      setSelectedClientId(client.id);
      setClientTab("infos");
      logActivity?.("Création client", client.name);
    }

    reset();
  }

  function edit(client) {
    setEditing(client.id);

    setForm({
      name: client.name || "",
      email: client.email || "",
      phone: client.phone || "",
      company: client.company || "",
      address: client.address || "",
      status: client.status || "Prospect",
      notes: client.notes || ""
    });
  }

  function remove(id) {
    if (!canDeleteData(currentRole)) {
      alert("Ton rôle ne permet pas de supprimer.");
      return;
    }

    if (!confirm("Supprimer ce client ?")) return;

    const removedClient = (data.clients || []).find((client) => client.id === id);

    setData({
      ...data,
      clients: (data.clients || []).filter((client) => client.id !== id)
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

  localStorage.setItem(
    "crm_open_document_id",
    doc.id
  );

  localStorage.setItem(
    "crm_open_document_type",
    type
  );

  setPage?.(
    type === "quote"
      ? "quotes"
      : "invoices"
  );
}
function remindClient(mode = "copy") {
  if (!selectedClient) return;

  const invoices =
    selectedClientUnpaidInvoices;

  if (invoices.length === 0) {
    alert(
      "Aucune facture impayée."
    );
    return;
  }

  const invoiceList =
    invoices
      .map(
        (inv) =>
          `${inv.number} - ${money(
            docTotal(inv)
          )}`
      )
      .join("\n");

  const text = `Bonjour ${
    selectedClient.name
  },

Nous vous rappelons que les factures suivantes restent impayées :

${invoiceList}

Montant total dû :
${money(
clientUnpaidAmount
)}

Merci.

AC Creation`;

  if (mode === "copy") {
    navigator.clipboard.writeText(
      text
    );

    alert(
      "Relance copiée"
    );

    return;
  }

  const subject =
    encodeURIComponent(
      "Relance facture impayée - AC Creation"
    );

  const body =
    encodeURIComponent(
      text
    );

  window.open(
`mailto:${
selectedClient.email || ""
}?subject=${subject}&body=${body}`
  );
}
  return (
    <section className="clients-page">
      <div className="page-header">
        <div>
          <h2>Clients</h2>
          <p>Ajoute tes prospects et clients.</p>
        </div>
      </div>

      <form className="card form-grid" onSubmit={submit}>
        <input
          placeholder="Nom client *"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <input
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />

        <input
          placeholder="Téléphone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        <input
          placeholder="Société"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
        />

        <input
          placeholder="Adresse"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />

        <select
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
        >
          <option>Prospect</option>
          <option>Client</option>
          <option>VIP</option>
          <option>Inactif</option>
        </select>

        <textarea
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        <button className="primary">
          {editing ? "Modifier" : "Ajouter"}
        </button>

        {editing && (
          <button type="button" onClick={reset}>
            Annuler
          </button>
        )}
      </form>

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
          <p className="muted">
            {clients.length} client(s) trouvé(s)
          </p>

          <PaginationControls
            page={clientPage}
            totalPages={clientTotalPages}
            onPageChange={setCurrentPage}
            totalItems={clients.length}
            perPage={itemsPerPage}
          />

          <table>
            <thead>
              <tr>
                <th>Nom du client</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {paginatedClients.map((client) => (
                <tr
                  key={client.id}
                  className={selectedClientId === client.id ? "selected-client-row" : ""}
                >
                  <td>
                    <button
                      type="button"
                      className="link-button client-name-button"
                      onClick={() => {
                        setSelectedClientId(client.id);
                        setClientTab("infos");
                      }}
                    >
                      <strong>{client.name}</strong>
                    </button>
                  </td>

                  <td className="client-actions">
                    <button type="button" onClick={() => edit(client)}>
                      Modifier
                    </button>

                    <button
                      type="button"
                      className="danger"
                      onClick={() => remove(client.id)}
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationControls
            page={clientPage}
            totalPages={clientTotalPages}
            onPageChange={setCurrentPage}
            totalItems={clients.length}
            perPage={itemsPerPage}
          />
        </div>

        <div className="card client-side-card">
          <div className="client-header">
            <div className="client-avatar">
              {(selectedClient?.name || "?")
                .split(" ")
                .slice(0, 2)
                .map((value) => value[0])
                .join("")
                .toUpperCase()}
            </div>

            <div className="client-head-info">
              <h3>
                {selectedClient?.name || "Fiche client"}
              </h3>

              {selectedClient && (
                <>
                  <div className="client-meta">
                    <span className={"status-badge " + statusClass(selectedClient.status)}>
                      {selectedClient.status || "Sans statut"}
                    </span>

                    <span>
                      Client depuis : {formatDate(selectedClient.createdAt)}
                    </span>
                  </div>

                  <div className="client-quick-actions">
                    <button type="button" onClick={() => edit(selectedClient)}>
                      ✏️ Modifier
                    </button>

                    <button type="button" onClick={() => goToDocumentPage("quotes")}>
                      🧾 Nouveau devis
                    </button>

                    <button type="button" onClick={() => goToDocumentPage("invoices")}>
                      💶 Nouvelle facture
                    </button>
                  </div>
                </>
              )}
            </div>
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
            <p className="muted">
              Clique sur un client pour voir sa fiche.
            </p>
          ) : (
            <>
              <div className="client-tabs">
                <button
                  type="button"
                  className={clientTab === "infos" ? "active" : ""}
                  onClick={() => setClientTab("infos")}
                >
                  ℹ Informations
                </button>

                <button
                  type="button"
                  className={clientTab === "contact" ? "active" : ""}
                  onClick={() => setClientTab("contact")}
                >
                  📞 Contact
                </button>

                <button
                  type="button"
                  className={clientTab === "address" ? "active" : ""}
                  onClick={() => setClientTab("address")}
                >
                  📍 Adresse
                </button>

                <button
                  type="button"
                  className={clientTab === "invoices" ? "active" : ""}
                  onClick={() => setClientTab("invoices")}
                >
                  🧾 Factures
                </button>

                <button
                  type="button"
                  className={clientTab === "history" ? "active" : ""}
                  onClick={() => setClientTab("history")}
                >
                  🕘 Activité
                </button>

                <button
                  type="button"
                  className={clientTab === "fullHistory" ? "active" : ""}
                  onClick={() => setClientTab("fullHistory")}
                >
                  📚 Historique complet
                </button>
              </div>

              <div className="client-card">
                {clientTab === "infos" && (
                  <>
                    <div className="client-info-box">
                      <strong>Société</strong>
                      <span>{selectedClient.company || "-"}</span>
                    </div>

                    <div className="client-info-box">
                      <strong>Statut</strong>
                      <span>{selectedClient.status || "-"}</span>
                    </div>

                    <div className="client-info-box">
                      <strong>Notes</strong>
                      <span>{selectedClient.notes || "-"}</span>
                    </div>
                  </>
                )}

                {clientTab === "contact" && (
                  <>
                    <div className="client-info-box">
                      <strong>Email</strong>
                      <span>{selectedClient.email || "-"}</span>
                    </div>

                    <div className="client-info-box">
                      <strong>Téléphone</strong>
                      <span>{selectedClient.phone || "-"}</span>
                    </div>
                  </>
                )}

                {clientTab === "address" && (
                  <div className="client-info-box">
                    <strong>Adresse</strong>
                    <span>{selectedClient.address || "-"}</span>
                  </div>
                )}

                {clientTab === "invoices" && (
                  <div className="client-history">
                    <h4>Historique factures</h4>

                    <div className="client-history-total">
                      <span>{selectedClientInvoices.length} facture(s)</span>
                      <strong>{money(selectedClientInvoiceTotal)}</strong>
                    </div>

                    {selectedClientInvoices.length === 0 ? (
                      <p className="muted">
                        Aucune facture pour ce client.
                      </p>
                    ) : (
                      <div className="client-history-list">
                        {selectedClientInvoices.slice(0, 8).map((invoice) => (
<div
  className="client-history-item clickable"
  key={invoice.id}
  onClick={() =>
    openDocument(
      invoice,
      "invoice"
    )
  }
>
                            <div>
                              <strong>{invoice.number || invoice.reference || "Facture"}</strong>
                              <span>{formatDate(docDate(invoice))}</span>
                            </div>

                            <div>
                              <strong>{money(docTotal(invoice))}</strong>
                              <span className={"status-badge " + statusClass(invoice.status)}>
                                {invoice.status || "Sans statut"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {clientTab === "history" && (
                  <div className="client-timeline">
                    {clientHistory.slice(0, 8).map((item) => (
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
                )}

                {clientTab === "fullHistory" && (
                  <div className="client-full-history">
                    <div className="client-history-section">
                      <h4>Historique complet</h4>
<div className="client-dashboard-grid">
{
selectedClientUnpaidInvoices
.length > 0 && (

<div className="
client-reminder-box
">

<div>

<strong>
Factures impayées :
</strong>

<span>
{
selectedClientUnpaidInvoices
.length
}
</span>

</div>

<div>

<strong>
Montant dû :
</strong>

<span>
{
money(
clientUnpaidAmount
)
}
</span>

</div>
<div className="
client-reminder-actions
">

<button
className="
client-reminder-btn
"
onClick={() =>
remindClient(
"copy"
)
}
>

📋 Copier relance

</button>

<button
className="
client-reminder-btn mail
"
onClick={() =>
remindClient(
"mail"
)
}
>

✉ Ouvrir email

</button>

</div>
</div>
)}
<div className="client-dashboard-card">
<strong>
{money(
selectedClientInvoiceTotal
)}
</strong>

<span>
CA Client
</span>
</div>

<div className="client-dashboard-card">
<strong>
{money(
clientAverageBasket
)}
</strong>

<span>
Panier moyen
</span>
</div>

<div className="client-dashboard-card">
<strong>
{clientConversionRate.toFixed(
0
)} %
</strong>

<span>
Conversion devis
</span>
</div>

<div className="client-dashboard-card danger">
<strong>
{money(
clientUnpaidAmount
)}
</strong>

<span>
Impayés
</span>
</div>

</div>
                      <div className="client-kpi-grid">
                        <div>
                          <strong>{money(selectedClientInvoiceTotal)}</strong>
                          <span>CA total client</span>
                        </div>

                        <div>
                          <strong>{money(selectedClientPaidTotal)}</strong>
                          <span>Total dépensé/payé</span>
                        </div>

                        <div>
                          <strong>{selectedClientQuotes.length}</strong>
                          <span>Nombre devis</span>
                        </div>

                        <div>
                          <strong>{selectedClientInvoices.length}</strong>
                          <span>Nombre factures</span>
                        </div>

                        <div>
                          <strong>{selectedClientAcceptedQuotes.length}</strong>
                          <span>Devis acceptés</span>
                        </div>

                        <div>
                          <strong>{selectedClientPaidInvoices.length}</strong>
                          <span>Factures payées</span>
                        </div>

                        <div>
                          <strong>{selectedClientUnpaidInvoices.length}</strong>
                          <span>Factures impayées</span>
                        </div>

                        <div>
                          <strong>{money(selectedClientQuoteTotal)}</strong>
                          <span>Total devis</span>
                        </div>
                      </div>

                      <div className="client-last-grid">
                        <div className="client-info-box">
                          <strong>Dernière commande</strong>
                          <span>
                            {selectedClientLastOrder
                              ? `${selectedClientLastOrder.number || selectedClientLastOrder.reference || "Document"} · ${formatDate(docDate(selectedClientLastOrder))}`
                              : "-"}
                          </span>
                        </div>

                        <div className="client-info-box">
                          <strong>Dernier devis</strong>
                          <span>
                            {selectedClientLastQuote
                              ? `${selectedClientLastQuote.number || selectedClientLastQuote.reference || "Devis"} · ${formatDate(docDate(selectedClientLastQuote))}`
                              : "-"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="client-history-section">
                      <div className="client-history-section">

<h4>
Top produits achetés
</h4>

{
topProducts.length===0
?

<p className="muted">
Aucun achat
</p>

:

<div className="top-products">

{
topProducts.map(
(
product,
index
)=>(

<div
key={index}
className="
top-product-item
"
>

<strong>
#{index+1}
</strong>

<span>
{
product[0]
}
</span>

<b>
{
product[1]
}
x
</b>

</div>

))
}

</div>

}

</div>
                      <h4>Chronologie activité</h4>

                      {clientHistory.length === 0 ? (
                        <p className="muted">Aucune activité pour ce client.</p>
                      ) : (
                        <div className="client-timeline">
                          {clientHistory.map((item) => (
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
                      )}
                    </div>

                    <div className="client-history-section">
                      <h4>Historique devis</h4>

                      {selectedClientQuotes.length === 0 ? (
                        <p className="muted">Aucun devis pour ce client.</p>
                      ) : (
                        <div className="client-history-list">
                          {selectedClientQuotes.map((quote) => (
                            <div
  className="client-history-item clickable"
  key={quote.id}
  onClick={() =>
    openDocument(
      quote,
      "quote"
    )
  }
>
                              <div>
                                <strong>{quote.number || quote.reference || "Devis"}</strong>
                                <span>{formatDate(docDate(quote))}</span>
                              </div>

                              <div>
                                <strong>{money(docTotal(quote))}</strong>
                                <span className={"status-badge " + statusClass(quote.status)}>
                                  {quote.status || "Sans statut"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="client-history-section">
                      <h4>Historique factures</h4>

                      {selectedClientInvoices.length === 0 ? (
                        <p className="muted">Aucune facture pour ce client.</p>
                      ) : (
                        <div className="client-history-list">
                          {selectedClientInvoices.map((invoice) => (
                            <div
  className="client-history-item clickable"
  key={invoice.id}
  onClick={() =>
    openDocument(
      invoice,
      "invoice"
    )
  }
>
                              <div>
                                <strong>{invoice.number || invoice.reference || "Facture"}</strong>
                                <span>{formatDate(docDate(invoice))}</span>
                              </div>

                              <div>
                                <strong>{money(docTotal(invoice))}</strong>
                                <span className={"status-badge " + statusClass(invoice.status)}>
                                  {invoice.status || "Sans statut"}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
