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
  buildQuoteDraftPayload,
  mergeQuoteDraftSources,
  resolveQuoteDraftForApply,
  openQuoteFromCalculator,
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

  it("persiste les pièces jointes dans le brouillon", () => {
    saveQuoteDraft({
      source: "outil atelier",
      lines: [{ description: "Ligne", quantity: 1 }],
      attachments: [{ id: "a1", name: "export.zip", url: "data:application/zip;base64,AA==" }],
    });
    expect(peekQuoteDraft()?.attachments).toHaveLength(1);
  });

  it("conserve localBlobId même si l'URL blob est retirée à la persistance", () => {
    const largeBase64 = `data:application/zip;base64,${"A".repeat(700 * 1024)}`;
    saveQuoteDraft({
      source: "outil atelier",
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

  it("buildQuoteDraftPayload garde les lignes et allège les pièces jointes", () => {
    const payload = buildQuoteDraftPayload({
      source: "outil atelier",
      lines: [{ description: "Mug personnalisé", quantity: 2, price: 0 }],
      attachments: [
        {
          id: "zip-1",
          name: "export-mug.zip",
          url: "blob:http://localhost/abc",
          localBlobId: "idb-mug",
          mimeType: "application/zip",
        },
      ],
      notes: "Notes atelier mug",
    });

    expect(payload.source).toBe("outil atelier");
    expect(payload.lines).toHaveLength(1);
    expect(payload.lines[0].description).toBe("Mug personnalisé");
    expect(payload.attachments[0].localBlobId).toBe("idb-mug");
    expect(payload.attachments[0].url).toBe("blob:http://localhost/abc");
  });

  it("mergeQuoteDraftSources préfère les lignes navigation et localBlobId storage", () => {
    const merged = mergeQuoteDraftSources(
      {
        source: "outil atelier",
        lines: [{ description: "Mon texte", quantity: 1 }],
        attachments: [],
        savedAt: 100,
      },
      {
        source: "outil atelier",
        lines: [],
        attachments: [{ id: "a1", name: "export.zip", localBlobId: "idb-1" }],
        notes: "Notes storage",
        savedAt: 99,
      }
    );

    expect(merged.lines[0].description).toBe("Mon texte");
    expect(merged.attachments[0].localBlobId).toBe("idb-1");
    expect(merged.notes).toBe("Notes storage");
  });

  it("resolveQuoteDraftForApply lit le storage sans consommer", () => {
    saveQuoteDraft({
      source: "outil atelier",
      lines: [{ description: "Ligne mug", quantity: 1 }],
    });

    const draft = resolveQuoteDraftForApply(null);
    expect(draft?.lines[0].description).toBe("Ligne mug");
    expect(peekQuoteDraft()?.lines).toHaveLength(1);
    expect(localStorage.getItem(QUOTE_DRAFT_KEY)).not.toBeNull();
  });

  it("openQuoteFromCalculator enregistre avant navigation", () => {
    const navigate = vi.fn();
    openQuoteFromCalculator(navigate, {
      source: "outil atelier",
      lines: [{ description: "Mug", quantity: 1, price: 0 }],
      notes: "test",
    });

    expect(peekQuoteDraft()?.lines[0].description).toBe("Mug");
    expect(navigate).toHaveBeenCalledWith("/devis", {
      state: {
        quoteDraft: expect.objectContaining({
          source: "outil atelier",
          lines: [{ description: "Mug", quantity: 1, price: 0 }],
        }),
      },
    });
  });
});
