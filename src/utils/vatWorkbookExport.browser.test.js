// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { exportVatWorkbook } from "./vatWorkbookExport";

const template = new Uint8Array(readFileSync("public/templates/TVA-Carla-draft-1.xlsx"));
const emptySheets = { achatsLux: [], aic: [], chidaLux: [], chidaUeTaxable: [], chidaUeExempt: [], importations1: [], chidaHue: [], importations: [] };

describe("exportVatWorkbook browser download", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("genere et declenche le telechargement d'un dossier 2025 valide", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength) }));
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:vat-2025"), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const result = await exportVatWorkbook({ id: "period-2025", startDate: "2025-01-01", endDate: "2025-12-31", status: "draft", sheets: emptySheets });
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.filename).toBe("TVA_AC-Creation_2025.xlsx");
    expect(click).toHaveBeenCalledOnce();
  }, 60000);
});
