export const CALCULATOR_TYPES = {
  laser: "laser",
  dtf: "dtf",
  uvdtf: "uvdtf",
  print3d: "print3d",
};

const STORAGE_KEY = "crm_calculator_projects_v1";
const MAX_PROJECTS_PER_TYPE = 30;

function uid() {
  return crypto.randomUUID();
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function loadCalculatorProjects(calculatorType) {
  const store = readAll();
  const list = store[calculatorType];
  return Array.isArray(list) ? list : [];
}

export function saveCalculatorProject(calculatorType, { name, form }) {
  const label = String(name || "").trim() || `Projet ${new Date().toLocaleDateString("fr-FR")}`;
  const snapshot = {
    id: uid(),
    name: label,
    calculatorType,
    form: { ...(form || {}) },
    savedAt: new Date().toISOString(),
  };

  const existing = loadCalculatorProjects(calculatorType);
  const next = [snapshot, ...existing].slice(0, MAX_PROJECTS_PER_TYPE);
  const store = readAll();
  store[calculatorType] = next;
  writeAll(store);
  return snapshot;
}

export function deleteCalculatorProject(calculatorType, projectId) {
  const next = loadCalculatorProjects(calculatorType).filter(
    (entry) => String(entry.id) !== String(projectId)
  );
  const store = readAll();
  store[calculatorType] = next;
  writeAll(store);
  return next;
}

export function mergeSettingsCalculatorProjects(settings = {}) {
  const fromSettings = settings.calculatorProjects;
  if (!fromSettings || typeof fromSettings !== "object") return settings;

  const store = readAll();
  let changed = false;

  for (const [type, projects] of Object.entries(fromSettings)) {
    if (!Array.isArray(projects) || !projects.length) continue;
    const local = loadCalculatorProjects(type);
    const ids = new Set(local.map((entry) => String(entry.id)));
    const merged = [...local];
    for (const project of projects) {
      if (!project?.id || ids.has(String(project.id))) continue;
      merged.push(project);
      ids.add(String(project.id));
    }
    if (merged.length !== local.length) {
      store[type] = merged.slice(0, MAX_PROJECTS_PER_TYPE);
      changed = true;
    }
  }

  if (changed) writeAll(store);
  return settings;
}

export function syncCalculatorProjectsIntoSettings(settings = {}) {
  return {
    ...settings,
    calculatorProjects: readAll(),
  };
}
