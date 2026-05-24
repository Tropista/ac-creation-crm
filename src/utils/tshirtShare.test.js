import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  compactConfigSnapshot,
  expandConfigSnapshot,
  encodeSharePayload,
  decodeSharePayload,
  decodeConfiguratorShareParam,
  decodeQuoteShareParam,
  buildShareMailto,
  CONFIG_SHARE_PARAM,
  QUOTE_SHARE_PARAM,
} from "./tshirtShare";

describe("tshirtShare", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { origin: "https://crm.example.com", protocol: "https:", pathname: "/" },
    });
  });

  it("compacte et restaure un snapshot configurateur", () => {
    const snapshot = {
      name: "Client Dupont",
      orderQuantity: 10,
      tshirtColor: "#ff0000",
      garmentSize: "L",
      items: [{ id: "1", type: "text", text: "Hello", area: "front" }],
      customFonts: [{ name: "MaPolice", dataUrl: "data:font/woff2;base64,abc" }],
    };
    const compact = compactConfigSnapshot(snapshot);
    const expanded = expandConfigSnapshot(compact);
    expect(expanded.name).toBe("Client Dupont");
    expect(expanded.orderQuantity).toBe(10);
    expect(expanded.items[0].text).toBe("Hello");
    expect(expanded.customFonts[0].name).toBe("MaPolice");
  });

  it("encode et décode une configuration", async () => {
    const encoded = await encodeSharePayload({
      t: "cfg",
      d: compactConfigSnapshot({
        name: "Test",
        items: [{ id: "a", type: "text", text: "AC", area: "front" }],
      }),
    });
    expect(encoded).toMatch(/^[01]\./);
    const restored = await decodeConfiguratorShareParam(encoded);
    expect(restored.name).toBe("Test");
    expect(restored.items[0].text).toBe("AC");
  });

  it("encode et décode un brouillon de devis", async () => {
    const draft = {
      source: "configurateur t-shirt",
      lines: [{ description: "T-shirt", quantity: 5, price: 12 }],
    };
    const encoded = await encodeSharePayload({ t: "q", d: draft });
    const restored = await decodeQuoteShareParam(encoded);
    expect(restored.source).toBe("configurateur t-shirt");
    expect(restored.lines[0].description).toBe("T-shirt");
  });

  it("rejette un payload de version inconnue", async () => {
    const invalid = `0.${btoa(JSON.stringify({ v: 99, t: "cfg", d: {} }))}`;
    await expect(decodeSharePayload(invalid)).rejects.toThrow("Version de lien non supportée.");
  });

  it("génère un mailto avec le lien", () => {
    const mailto = buildShareMailto("https://crm.example.com/configurateur-tshirt?cfg=abc", "Projet A");
    expect(mailto).toMatch(/^mailto:\?subject=/);
    expect(decodeURIComponent(mailto)).toContain("https://crm.example.com/configurateur-tshirt?cfg=abc");
  });

  it("expose les noms de paramètres URL", () => {
    expect(CONFIG_SHARE_PARAM).toBe("cfg");
    expect(QUOTE_SHARE_PARAM).toBe("draft");
  });
});
