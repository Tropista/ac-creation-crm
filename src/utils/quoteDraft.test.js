import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  INVOICE_DRAFT_KEY,
  INVOICES_LIST_NAV_STATE,
  QUOTE_DRAFT_KEY,
  QUOTES_LIST_NAV_STATE,
  saveQuoteDraft,
  peekQuoteDraft,
  consumeQuoteDraft,
  clearInvoiceDraft,
  getCrmInvoicesUrl,
  getCrmQuotesUrl,
  navigateToInvoicesList,
  navigateToQuotesList,
  buildTshirtConfiguratorQuoteDescription,
  buildTshirtConfiguratorWorkshopNotes,
  formatTshirtColorLabel,
} from "./quoteDraft";

function createStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe("quoteDraft", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
  });

  it("sauvegarde et consomme un brouillon", () => {
    saveQuoteDraft({ source: "test", lines: [{ description: "Ligne", quantity: 2 }] });
    expect(peekQuoteDraft()?.source).toBe("test");
    const draft = consumeQuoteDraft();
    expect(draft?.lines[0].description).toBe("Ligne");
    expect(localStorage.getItem(QUOTE_DRAFT_KEY)).toBeNull();
  });

  it("génère une description t-shirt minimale", () => {
    expect(buildTshirtConfiguratorQuoteDescription({ tshirtColor: "#ffffff" })).toBe(
      "T-shirt blanc"
    );
    expect(buildTshirtConfiguratorQuoteDescription({ tshirtColor: "#ff00aa" })).toBe(
      "T-shirt #ff00aa"
    );
    expect(buildTshirtConfiguratorQuoteDescription()).toBe("T-shirt");
  });

  it("déplace le détail marquage dans les notes atelier", () => {
    const notes = buildTshirtConfiguratorWorkshopNotes({
      projectName: "Club FC",
      garmentSize: "M",
      garmentPresetLabel: "M",
      tshirtColor: "#111827",
      techniqueSummary: "DTF",
      quantity: 10,
      totalUnitHT: 15.5,
      markings: [
        {
          zone: "Avant",
          content: '"Logo"',
          technique: "DTF",
          width: 28,
          height: 35,
          unitPrice: 15.5,
        },
      ],
    });

    expect(formatTshirtColorLabel("#111827")).toBe("anthracite");
    expect(notes).toContain("Club FC");
    expect(notes).toContain("Qté 10");
    expect(notes).toContain("Avant : \"Logo\"");
    expect(notes).not.toContain("Personnalisations");
    expect(notes.split("\n").length).toBeLessThan(8);
  });

  it("persiste les pièces jointes dans le brouillon", () => {
    saveQuoteDraft({
      source: "configurateur t-shirt",
      lines: [{ description: "Ligne", quantity: 1 }],
      attachments: [{ id: "a1", name: "export.zip", url: "data:application/zip;base64,AA==" }],
    });
    expect(peekQuoteDraft()?.attachments).toHaveLength(1);
  });

  it("conserve localBlobId même si l'URL blob est retirée à la persistance", () => {
    const largeBase64 = `data:application/zip;base64,${"A".repeat(700 * 1024)}`;
    saveQuoteDraft({
      source: "configurateur t-shirt",
      lines: [{ description: "Ligne", quantity: 1 }],
      attachments: [
        {
          id: "zip-1",
          name: "export.zip",
          url: largeBase64,
          localBlobId: "idb-zip",
          mimeType: "application/zip",
        },
      ],
    });

    const saved = peekQuoteDraft()?.attachments?.[0];
    expect(saved?.localBlobId).toBe("idb-zip");
    expect(saved?.url).toBe("");
  });

  it("navigue vers la liste Devis sans brouillon", () => {
    const navigate = vi.fn();
    navigateToQuotesList(navigate);
    expect(navigate).toHaveBeenCalledWith("/devis", { state: QUOTES_LIST_NAV_STATE });
  });

  it("navigue vers la liste Factures", () => {
    const navigate = vi.fn();
    navigateToInvoicesList(navigate);
    expect(navigate).toHaveBeenCalledWith("/factures", { state: INVOICES_LIST_NAV_STATE });
  });

  it("efface le brouillon facture", () => {
    localStorage.setItem(INVOICE_DRAFT_KEY, "{}");
    clearInvoiceDraft();
    expect(localStorage.getItem(INVOICE_DRAFT_KEY)).toBeNull();
  });

  it("retourne l’URL Factures en mode hash", () => {
    vi.stubGlobal("window", {
      location: { protocol: "file:", pathname: "/index.html" },
    });
    expect(getCrmInvoicesUrl()).toBe("/index.html#/factures");
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", createStorage());
  });

  it("retourne l’URL Devis en mode hash", () => {
    vi.stubGlobal("window", {
      location: { protocol: "file:", pathname: "/index.html" },
    });
    expect(getCrmQuotesUrl()).toBe("/index.html#/devis");
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", createStorage());
  });
});
