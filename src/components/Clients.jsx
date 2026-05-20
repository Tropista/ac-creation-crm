import { useState } from "react";

function money(value) {
  return Number(value || 0).toLocaleString(
    "fr-FR",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ) + " €";
}

export default function Clients({
  data,
  setData,
  currentRole = "Admin",
  logActivity
}) {

  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("nameAsc");
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", address: "", status: "Prospect", notes: "" });

  const itemsPerPage = 25;
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
      setData({ ...data, clients: data.clients.map((c) => (c.id === editing ? { ...c, ...form } : c)) });
      logActivity?.("Modification client", form.name);
    } else {
      const client = { id: uid(), createdAt: today(), ...form };
      setData({ ...data, clients: [...data.clients, client] });
      setSelectedClientId(client.id);
      logActivity?.("Création client", client.name);
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
    const removedClient = data.clients.find((c) => c.id === id);
    setData({ ...data, clients: data.clients.filter((c) => c.id !== id) });
    logActivity?.("Suppression client", removedClient?.name || id);
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
<div className="pagination">
  <button
    type="button"
    disabled={clientPage <= 1}
    onClick={() => setCurrentPage(clientPage - 1)}
  >
    Précédent
  </button>

  <span>
    Page {clientPage} / {clientTotalPages}
  </span>

  <button
    type="button"
    disabled={clientPage >= clientTotalPages}
    onClick={() => setCurrentPage(clientPage + 1)}
  >
    Suivant
  </button>
</div>
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
