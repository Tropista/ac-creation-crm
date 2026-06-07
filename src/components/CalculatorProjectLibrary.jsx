import { useMemo, useState } from "react";
import {
  deleteCalculatorProject,
  loadCalculatorProjects,
  saveCalculatorProject,
} from "../utils/calculatorProjects";
import { showToast } from "../utils/toast";
import { confirmAction } from "../utils/confirmAction";

function formatSavedAt(value) {
  if (!value) return "";
  try {
    return new Date(value).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function CalculatorProjectLibrary({
  calculatorType,
  currentName = "",
  getFormSnapshot,
  onLoadForm,
  onSyncSettings,
  className = "",
}) {
  const [projectName, setProjectName] = useState(currentName || "");
  const [projects, setProjects] = useState(() => loadCalculatorProjects(calculatorType));

  const sortedProjects = useMemo(
    () =>
      [...projects].sort(
        (a, b) => new Date(b.savedAt || 0).getTime() - new Date(a.savedAt || 0).getTime()
      ),
    [projects]
  );

  function refresh() {
    setProjects(loadCalculatorProjects(calculatorType));
  }

  function pushSettingsSync() {
    onSyncSettings?.();
  }

  function handleSave() {
    const form = typeof getFormSnapshot === "function" ? getFormSnapshot() : null;
    if (!form) {
      showToast("Impossible de sauvegarder ce projet.", "error");
      return;
    }
    const saved = saveCalculatorProject(calculatorType, {
      name: projectName || currentName,
      form,
    });
    refresh();
    setProjectName(saved.name);
    pushSettingsSync();
    showToast(`Projet « ${saved.name} » sauvegardé.`, "success");
  }

  function handleLoad(projectId) {
    const project = projects.find((entry) => String(entry.id) === String(projectId));
    if (!project?.form) return;
    onLoadForm?.(project.form);
    setProjectName(project.name || "");
    showToast(`Projet « ${project.name} » chargé.`, "success");
  }

  async function handleDelete(projectId) {
    const project = projects.find((entry) => String(entry.id) === String(projectId));
    if (!project) return;
    if (
      !(await confirmAction({
        title: "Supprimer le projet",
        message: `Supprimer le projet « ${project.name} » ?`,
        confirmLabel: "Supprimer",
        danger: true,
      }))
    ) return;
    deleteCalculatorProject(calculatorType, projectId);
    refresh();
    pushSettingsSync();
    showToast("Projet supprimé.", "info");
  }

  return (
    <section className={`calculator-projects card ${className}`.trim()}>
      <header className="calculator-projects__header">
        <div>
          <strong>Bibliothèque de projets</strong>
          <span className="muted">Sauvegarde cloud — {sortedProjects.length} projet(s)</span>
        </div>
      </header>

      <div className="calculator-projects__save">
        <input
          type="text"
          placeholder="Nom du projet"
          value={projectName}
          onChange={(event) => setProjectName(event.target.value)}
        />
        <button type="button" className="primary compact" onClick={handleSave}>
          Sauvegarder
        </button>
      </div>

      {sortedProjects.length ? (
        <ul className="calculator-projects__list">
          {sortedProjects.map((project) => (
            <li key={project.id} className="calculator-projects__item">
              <div>
                <strong>{project.name}</strong>
                <span className="muted">{formatSavedAt(project.savedAt)}</span>
              </div>
              <div className="calculator-projects__item-actions">
                <button type="button" className="compact" onClick={() => handleLoad(project.id)}>
                  Charger
                </button>
                <button
                  type="button"
                  className="danger compact"
                  onClick={() => handleDelete(project.id)}
                >
                  Supprimer
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted calculator-projects__empty">
          Aucun projet enregistré pour ce calculateur.
        </p>
      )}
    </section>
  );
}
