import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildQuoteShareUrl,
  buildQuoteWhatsAppMessage,
  buildWhatsAppShareUrl,
  buildOrderReadyWhatsAppMessage,
  buildWhatsAppUrlWithPhone,
  normalizePhoneForWhatsApp,
  DEFAULT_PUBLIC_APP_URL,
  getQuoteIdFromLocation,
  resolvePublicAppOrigin,
} from "./quoteShare.js";

describe("resolvePublicAppOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("utilise options.origin en priorité absolue", () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "https://env.example");
    expect(
      resolvePublicAppOrigin({
        origin: "https://custom.example",
        settings: { publicAppUrl: "https://settings.example" },
      })
    ).toBe("https://custom.example");
  });

  it("lit VITE_PUBLIC_APP_URL", () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "https://crm.ac-creation.lu");
    expect(resolvePublicAppOrigin()).toBe("https://crm.ac-creation.lu");
  });

  it("lit VITE_VERCEL_URL sans schéma", () => {
    vi.stubEnv("VITE_VERCEL_URL", "ac-creation-crm.vercel.app");
    expect(resolvePublicAppOrigin()).toBe("https://ac-creation-crm.vercel.app");
  });

  it("lit settings.publicAppUrl", () => {
    expect(
      resolvePublicAppOrigin({ settings: { publicAppUrl: "https://crm.ac-creation.lu" } })
    ).toBe("https://crm.ac-creation.lu");
  });

  it("retombe sur DEFAULT_PUBLIC_APP_URL en dev (localhost)", () => {
    expect(
      resolvePublicAppOrigin({ warnOnLocalhost: false })
    ).toBe(DEFAULT_PUBLIC_APP_URL);
  });

  it("normalise une URL sans https://", () => {
    expect(
      resolvePublicAppOrigin({ settings: { publicAppUrl: "crm.ac-creation.lu" } })
    ).toBe("https://crm.ac-creation.lu");
  });
});

describe("buildQuoteShareUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("génère une URL /devis-public?id= pour le web", () => {
    expect(
      buildQuoteShareUrl({ id: "q-42", number: "DEV-2025-0001", shareToken: "abc" }, {
        origin: "https://crm.ac-creation.lu",
      })
    ).toBe("https://crm.ac-creation.lu/devis-public?id=q-42&token=abc");
  });

  it("encode la référence du devis", () => {
    expect(
      buildQuoteShareUrl({ id: "a b", number: "DEV-1", shareToken: "tok" }, {
        origin: "https://example.com",
      })
    ).toBe("https://example.com/devis-public?id=a%20b&token=tok");
  });

  it("utilise settings.publicAppUrl quand aucune origin explicite", () => {
    expect(
      buildQuoteShareUrl(
        { id: "q-1", shareToken: "tok" },
        { settings: { publicAppUrl: "https://crm.ac-creation.lu" } }
      )
    ).toBe("https://crm.ac-creation.lu/devis-public?id=q-1&token=tok");
  });

  it("utilise VITE_PUBLIC_APP_URL en dev au lieu de localhost", () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "https://ac-creation-crm.vercel.app");
    expect(
      buildQuoteShareUrl({ id: "q-dev", shareToken: "abc" })
    ).toBe("https://ac-creation-crm.vercel.app/devis-public?id=q-dev&token=abc");
  });
});

describe("buildQuoteWhatsAppMessage", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("prépare un message professionnel en français", () => {
    const message = buildQuoteWhatsAppMessage(
      { number: "DEV-2025-0042", totalTTC: 150 },
      { companyName: "AC Creation" },
      { name: "Marie Martin" }
    );

    expect(message).toContain("Bonjour Marie Martin");
    expect(message).toContain("DEV-2025-0042");
    expect(message).toContain("AC Creation");
    expect(message).toContain("/devis-public?id=");
  });

  it("inclut l'URL publique configurée, pas localhost", () => {
    vi.stubEnv("VITE_PUBLIC_APP_URL", "https://ac-creation-crm.vercel.app");
    const message = buildQuoteWhatsAppMessage(
      { id: "q-99", number: "DEV-1", totalTTC: 100, shareToken: "tok" },
      { companyName: "AC Creation" }
    );
    expect(message).toContain("https://ac-creation-crm.vercel.app/devis-public?id=q-99&token=tok");
    expect(message).not.toContain("localhost");
  });
});

describe("buildWhatsAppShareUrl", () => {
  it("encode le texte pour wa.me", () => {
    const url = buildWhatsAppShareUrl("Bonjour devis");
    expect(url).toBe("https://wa.me/?text=Bonjour%20devis");
  });
});

describe("order ready WhatsApp", () => {
  it("prépare un message de commande prête", () => {
    const message = buildOrderReadyWhatsAppMessage(
      { number: "DEV-2025-0010" },
      { companyName: "AC Creation" },
      { name: "Paul" }
    );
    expect(message).toContain("Bonjour Paul");
    expect(message).toContain("DEV-2025-0010");
    expect(message).toContain("prête");
  });

  it("utilise le numéro client dans l'URL wa.me", () => {
    const url = buildWhatsAppUrlWithPhone(
      "+352 621 123 456",
      "Commande prête"
    );
    expect(url).toBe("https://wa.me/352621123456?text=Commande%20pr%C3%AAte");
    expect(normalizePhoneForWhatsApp("00352 621 123")).toBe("352621123");
  });
});

describe("getQuoteIdFromLocation", () => {
  it("lit l'id depuis location.search", () => {
    expect(
      getQuoteIdFromLocation({ search: "?id=quote-123" })
    ).toBe("quote-123");
  });
});
