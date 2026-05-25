import { describe, expect, it } from "vitest";
import {
  buildQuoteShareUrl,
  buildQuoteWhatsAppMessage,
  buildWhatsAppShareUrl,
  getQuoteIdFromLocation,
} from "./quoteShare.js";

describe("buildQuoteShareUrl", () => {
  it("génère une URL /devis?id= pour le web", () => {
    expect(
      buildQuoteShareUrl({ id: "q-42", number: "DEV-2025-0001" }, {
        origin: "https://crm.ac-creation.lu",
      })
    ).toBe("https://crm.ac-creation.lu/devis?id=q-42");
  });

  it("encode la référence du devis", () => {
    expect(
      buildQuoteShareUrl({ id: "a b", number: "DEV-1" }, {
        origin: "https://example.com",
      })
    ).toBe("https://example.com/devis?id=a%20b");
  });
});

describe("buildQuoteWhatsAppMessage", () => {
  it("prépare un message professionnel en français", () => {
    const message = buildQuoteWhatsAppMessage(
      { number: "DEV-2025-0042", totalTTC: 150 },
      { companyName: "AC Creation" },
      { name: "Marie Martin" }
    );

    expect(message).toContain("Bonjour Marie Martin");
    expect(message).toContain("DEV-2025-0042");
    expect(message).toContain("AC Creation");
    expect(message).toContain("/devis?id=");
  });
});

describe("buildWhatsAppShareUrl", () => {
  it("encode le texte pour wa.me", () => {
    const url = buildWhatsAppShareUrl("Bonjour devis");
    expect(url).toBe("https://wa.me/?text=Bonjour%20devis");
  });
});

describe("getQuoteIdFromLocation", () => {
  it("lit l'id depuis location.search", () => {
    expect(
      getQuoteIdFromLocation({ search: "?id=quote-123" })
    ).toBe("quote-123");
  });
});
