import { useState } from "react";
import {
  pruneBackups,
  downloadJson,
  normalizeData,
  createBackupSnapshot
} from "../utils/documents";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";
export default function Backups({
  data,
  setData,
  createCloudBackup,
  logActivity
}) {
  const [selectedBackupId, setSelectedBackupId] = useState("");
  const backups = pruneBackups(data.backups || [], 50);
  const selectedBackup = backups.find((backup) => backup.id === selectedBackupId);

  function exportFullJson() {
    const filename = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
    downloadJson(filename, normalizeData({ ...data, backups: data.backups || [] }));
  }

  async function restoreBackup() {
    if (!selectedBackup) return showToast("Choisis une sauvegarde à restaurer.", "error");
    if (
      !(await confirmAction({
        title: "Restaurer la sauvegarde",
        message: "Les données actuelles seront remplacées par cette sauvegarde.",
        detail: "Une sauvegarde de l'état actuel sera conservée avant restauration.",
        confirmLabel: "Restaurer",
        danger: true,
      }))
    ) return;

    const restored = normalizeData({
      ...selectedBackup.data,
      backups: pruneBackups([
        createBackupSnapshot(data, "Avant restauration"),
        ...(data.backups || []),
      ], 12),
    });

    await setData(restored);
    await logActivity?.("Sauvegarde restaurée", selectedBackup.label, selectedBackup.createdAt);
    showToast("Sauvegarde restaurée.", "success");
  }

  async function deleteBackup(id) {
    if (
      !(await confirmAction({
        title: "Supprimer la sauvegarde",
        message: "Cette sauvegarde sera retirée de la liste.",
        confirmLabel: "Supprimer",
        danger: true,
      }))
    ) return;
    const backupToDelete = (data.backups || []).find((backup) => backup.id === id);
    setData({
      ...data,
      backups: (data.backups || []).filter((backup) => backup.id !== id),
    });
    logActivity?.("Sauvegarde supprimée", backupToDelete?.label || id);
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
