import { useState } from "react";
export default function ActivityLogs({ data }) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("Toutes");

  const logs = [...(data.logs || [])]
    .sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0));

  const actions = ["Toutes", ...Array.from(new Set(logs.map((log) => log.action).filter(Boolean)))];

  const filteredLogs = logs.filter((log) => {
    const text = [
      log.user_name,
      log.user,
      log.email,
      log.action,
      log.target,
      log.details,
      log.role,
    ].join(" ").toLowerCase();

    const matchesSearch = text.includes(search.trim().toLowerCase());
    const matchesAction = actionFilter === "Toutes" || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  return (
    <section>
      <div className="page-header">
        <div>
          <h2>Journal d’activité</h2>
          <p>Historique des actions effectuées dans le CRM.</p>
        </div>
      </div>

      <div className="card form-grid">
        <input
          placeholder="Rechercher par utilisateur, action, cible..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
          {actions.map((action) => (
            <option key={action} value={action}>{action}</option>
          ))}
        </select>
      </div>

      <div className="table card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Utilisateur</th>
              <th>Rôle</th>
              <th>Action</th>
              <th>Cible</th>
              <th>Détails</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log.id}>
                <td>{log.date ? new Date(log.date).toLocaleString("fr-FR") : "-"}</td>
                <td>{log.user_name || log.user || "Système"}</td>
                <td>{log.role || "-"}</td>
                <td>{log.action || "-"}</td>
                <td>{log.target || "-"}</td>
                <td>{log.details || "-"}</td>
              </tr>
            ))}

            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan="6" className="muted">Aucune activité enregistrée.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
