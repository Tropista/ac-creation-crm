import { describe, expect, it } from "vitest";
import { rowsToCsv } from "./exportCsv";

describe("exportCsv", () => {
  it("escapes cells and uses semicolon separator", () => {
    const csv = rowsToCsv(
      ["Nom", "Notes"],
      [["AC; Corp", 'Ligne "test"']]
    );

    expect(csv).toContain("Nom;Notes");
    expect(csv).toContain('"AC; Corp"');
    expect(csv).toContain('"Ligne ""test"""');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
});
