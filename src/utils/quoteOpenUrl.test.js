import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildQuoteOpenPath,
  buildQuoteOpenUrl,
  parseQuoteOpenIdFromLocation,
  parseQuoteOpenIdFromSearch,
  QUOTE_OPEN_QUERY_KEY,
} from "./quoteOpenUrl.js";

describe("quoteOpenUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parse l'identifiant devis depuis la query", () => {
    expect(parseQuoteOpenIdFromSearch(`?${QUOTE_OPEN_QUERY_KEY}=abc-123`)).toBe("abc-123");
  });

  it("parse open= depuis le hash (HashRouter)", () => {
    expect(
      parseQuoteOpenIdFromLocation({ search: "", hash: "#/devis?open=quote-hash" })
    ).toBe("quote-hash");
  });

  it("construit une URL avec paramètre open", () => {
    global.window = {
      location: {
        origin: "http://localhost:5173",
        pathname: "/",
        protocol: "http:",
      },
    };

    const url = buildQuoteOpenUrl("quote-42");
    expect(url).toContain("open=quote-42");
    expect(url).toContain("/devis");
  });

  it("utilise l'URL publique en dev au lieu de localhost", () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "https://ac-creation-crm.vercel.app");
    global.window = {
      location: {
        origin: "http://localhost:5173",
        pathname: "/",
        protocol: "http:",
      },
    };

    const url = buildQuoteOpenUrl("quote-42", {
      settings: { publicAppUrl: "https://ac-creation-crm.vercel.app" },
    });
    expect(url).toBe("https://ac-creation-crm.vercel.app/devis?open=quote-42");
    expect(url).not.toContain("localhost");
    expect(url).not.toContain("#");
  });

  it("force le format web pour QR même en Electron file://", () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "https://ac-creation-crm.vercel.app");
    global.window = {
      location: {
        origin: "file://",
        pathname: "/C:/Users/app/dist/index.html",
        protocol: "file:",
      },
    };

    const url = buildQuoteOpenUrl("quote-42", {
      settings: { publicAppUrl: "https://ac-creation-crm.vercel.app" },
    });
    expect(url).toBe("https://ac-creation-crm.vercel.app/devis?open=quote-42");
    expect(url).not.toContain("index.html");
    expect(url).not.toContain("#");
  });

  it("localFormat produit un hash Electron pour usage interne", () => {
    global.window = {
      location: {
        origin: "file://",
        pathname: "/dist/index.html",
        protocol: "file:",
      },
    };

    const url = buildQuoteOpenUrl("quote-42", {
      localFormat: true,
      origin: "https://ac-creation-crm.vercel.app",
    });
    expect(url).toBe(
      "https://ac-creation-crm.vercel.app/dist/index.html#/devis?open=quote-42"
    );
  });

  it("buildQuoteOpenPath retourne le chemin CRM interne", () => {
    expect(buildQuoteOpenPath("quote-42")).toBe("/devis?open=quote-42");
  });
});
