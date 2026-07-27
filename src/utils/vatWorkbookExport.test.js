import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import * as XLSX from "xlsx";
import { buildVatWorkbookExport } from "./vatWorkbookExport";

const template = new Uint8Array(readFileSync("public/templates/TVA-Carla-draft-1.xlsx"));
const baseLine = { id: "snapshot-2026", sourceType: "expense", sourceId: "expense-2026", date: "2026-01-15", partner: "Fournisseur 2026", number: "F-2026", nature: "Achat", country: "LU", amountCurrency: 100, currency: "EUR", exchangeRate: 1, amountHT: 100, vatRate: 17, vatAmount: 17, totalTTC: 117 };
const emptySheets = () => ({ achatsLux: [], aic: [], chidaLux: [], chidaUeTaxable: [], chidaUeExempt: [], importations1: [], chidaHue: [], importations: [] });
const lines = (count, key = "achatsLux") => Array.from({ length: count }, (_, index) => ({
  ...baseLine,
  id: `${key}-${index + 1}`,
  sourceId: `${key}-source-${index + 1}`,
  partner: `${key}-partner-${index + 1}`,
  number: `${key}-${index + 1}`,
}));

describe("vatWorkbookExport", () => {
  it("supprime calcChain, développe les formules partagées et garde un XLSX lisible", () => {
    const result = buildVatWorkbookExport(template, { id: "period-2026", startDate: "2026-01-01", endDate: "2026-01-31", sheets: emptySheets() });
    const files = unzipSync(result.bytes);
    expect(files["xl/calcChain.xml"]).toBeUndefined();
    expect(strFromU8(files["xl/_rels/workbook.xml.rels"])).not.toContain("calcChain");
    expect(strFromU8(files["[Content_Types].xml"])).not.toContain("/xl/calcChain.xml");
    expect(strFromU8(files["xl/workbook.xml"])).toContain('fullCalcOnLoad="1"');
    ["sheet1.xml", "sheet2.xml", "sheet3.xml"].forEach((sheet) => {
      const xml = strFromU8(files[`xl/worksheets/${sheet}`]);
      expect(xml).not.toContain('t="shared"');
      expect(xml).toContain("<worksheet");
    });
    expect(Object.keys(files)).toContain("xl/workbook.xml");
    expect(() => XLSX.read(result.bytes, { type: "array" })).not.toThrow();
  });

  it("exporte seulement les snapshots du dossier ouvert et conserve le bon identifiant", () => {
    const sheets = emptySheets(); sheets.achatsLux.push(baseLine);
    const result = buildVatWorkbookExport(template, { id: "january-2026", startDate: "2026-01-01", endDate: "2026-01-31", sheets });
    const sheet = strFromU8(unzipSync(result.bytes)["xl/worksheets/sheet1.xml"]);
    expect(result).toMatchObject({ filename: "TVA_AC-Creation_2026-01.xlsx", workbookPeriodId: "january-2026", selectedSheetCounts: { achatsLux: 1, aic: 0 } });
    expect(sheet).toContain("Fournisseur 2026");
    expect(sheet).not.toContain("Atome3D");
  });

  it("nomme une période annuelle et trimestrielle sans utiliser la date courante", () => {
    expect(buildVatWorkbookExport(template, { startDate: "2025-01-01", endDate: "2025-12-31", sheets: emptySheets() }).filename).toBe("TVA_AC-Creation_2025.xlsx");
    expect(buildVatWorkbookExport(template, { startDate: "2026-04-01", endDate: "2026-06-30", sheets: emptySheets() }).filename).toBe("TVA_AC-Creation_2026-T2.xlsx");
  });

  it("exporte un ancien dossier 2025 avec des feuilles manquantes ou vides", () => {
    const result = buildVatWorkbookExport(template, {
      id: "period-2025-legacy",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      status: "draft",
      sheets: { achatsLux: [{ ...baseLine, id: "snapshot-2025", sourceId: "expense-2025", date: "2025-02-10", partner: "Fournisseur 2025" }] },
    });
    const files = unzipSync(result.bytes);
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.filename).toBe("TVA_AC-Creation_2025.xlsx");
    expect(result.selectedSheetCounts).toMatchObject({ achatsLux: 1, aic: 0, chidaLux: 0, importations: 0 });
    expect(strFromU8(files["xl/worksheets/sheet1.xml"])).toContain("Fournisseur 2025");
  });

  it("identifie une valeur historique non exportable avec sa ligne source", () => {
    const sheets = emptySheets();
    sheets.achatsLux.push({ ...baseLine, id: "invalid-snapshot", sourceId: "bad-source", amountHT: Number.NaN });
    expect(() => buildVatWorkbookExport(template, { id: "period-2025", startDate: "2025-01-01", endDate: "2025-12-31", sheets })).toThrow(/achatsLux, ligne 1 .*bad-source/);
  });

  it.each([[1, 0], [38, 0], [39, 1], [60, 22]])("etend Achats_LUX pour %i lignes sans perdre de snapshot", (count, insertedRows) => {
    const sheets = emptySheets();
    sheets.achatsLux = lines(count);
    const result = buildVatWorkbookExport(template, { id: `achats-${count}`, startDate: "2025-01-01", endDate: "2025-12-31", sheets });
    const sheet = strFromU8(unzipSync(result.bytes)["xl/worksheets/sheet1.xml"]);
    expect(result.sheetCapacities.achatsLux).toMatchObject({ initialCapacity: 38, requiredRowCount: count, insertedRows, finalCapacity: Math.max(38, count) });
    expect(sheet).toContain("achatsLux-partner-1");
    expect(sheet).toContain(`achatsLux-partner-${count}`);
    expect(sheet).not.toContain('t="shared"');
    if (count > 38) {
      const lastDataRow = 11 + count;
      expect(sheet).toContain(`<f>SUM(F12:F${lastDataRow})</f>`);
      expect(sheet).toContain(`<row r="${lastDataRow + 1}"`);
      expect(sheet).toContain(`<mergeCell ref="B${lastDataRow + 1}:E${lastDataRow + 1}"/>`);
      const templateStyle = strFromU8(unzipSync(template)["xl/worksheets/sheet1.xml"]).match(/<c\b(?=[^>]*\br="B49")[^>]*\bs="([^"]+)"/)?.[1];
      expect(sheet).toContain(`<c r="B50" s="${templateStyle}" t="inlineStr">`);
    }
  });

  it("etend chaque annexe et conserve les huit feuilles dans leur ordre", () => {
    const sheets = emptySheets();
    sheets.achatsLux = lines(39, "achatsLux");
    sheets.aic = lines(37, "aic");
    sheets.chidaLux = lines(50, "chidaLux");
    sheets.chidaUeTaxable = lines(13, "chidaUeTaxable");
    sheets.chidaUeExempt = lines(22, "chidaUeExempt");
    sheets.importations1 = lines(3, "importations1");
    sheets.chidaHue = lines(36, "chidaHue");
    sheets.importations = lines(3, "importations");
    const result = buildVatWorkbookExport(template, { id: "all-sheets", startDate: "2025-01-01", endDate: "2025-12-31", sheets });
    const files = unzipSync(result.bytes);
    expect(result.sheetCapacities).toMatchObject({
      achatsLux: { insertedRows: 1 }, aic: { insertedRows: 1 }, chidaLux: { insertedRows: 1 },
      chidaUeTaxable: { insertedRows: 1 }, chidaUeExempt: { insertedRows: 1 }, importations1: { insertedRows: 1 },
      chidaHue: { insertedRows: 1 }, importations: { insertedRows: 1 },
    });
    const chidaUe = strFromU8(files["xl/worksheets/sheet4.xml"]);
    expect(chidaUe).toContain("chidaUeTaxable-partner-13");
    expect(chidaUe).toContain("chidaUeExempt-partner-22");
    const workbook = XLSX.read(result.bytes, { type: "array" });
    expect(workbook.SheetNames).toEqual(XLSX.read(template, { type: "array" }).SheetNames);
  });
});
