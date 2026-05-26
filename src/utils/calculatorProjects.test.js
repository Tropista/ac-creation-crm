import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  deleteCalculatorProject,
  loadCalculatorProjects,
  saveCalculatorProject,
  syncCalculatorProjectsIntoSettings,
  CALCULATOR_TYPES,
} from "./calculatorProjects.js";

function createStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    clear: () => map.clear(),
  };
}

describe("calculatorProjects", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  it("sauvegarde et recharge un preset par type", () => {
    saveCalculatorProject(CALCULATOR_TYPES.laser, {
      name: "Plaque bois",
      form: { material: "Bois", quantity: 10 },
    });

    const projects = loadCalculatorProjects(CALCULATOR_TYPES.laser);
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Plaque bois");
    expect(projects[0].form.quantity).toBe(10);
  });

  it("supprime un projet enregistré", () => {
    const saved = saveCalculatorProject(CALCULATOR_TYPES.dtf, {
      name: "Hoodie",
      form: { garment: "Hoodie / Sweat" },
    });
    deleteCalculatorProject(CALCULATOR_TYPES.dtf, saved.id);
    expect(loadCalculatorProjects(CALCULATOR_TYPES.dtf)).toHaveLength(0);
  });

  it("exporte les projets dans settings.calculatorProjects", () => {
    saveCalculatorProject(CALCULATOR_TYPES.laser, {
      name: "Test",
      form: { quantity: 2 },
    });
    const settings = syncCalculatorProjectsIntoSettings({ companyName: "AC" });
    expect(settings.calculatorProjects.laser).toHaveLength(1);
    expect(settings.companyName).toBe("AC");
  });
});
