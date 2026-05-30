import { describe, expect, it } from "vitest";
import { acceptQuoteWithSignature, isQuoteSigned } from "./quoteSignature.js";

describe("quoteSignature", () => {
  it("accepte un devis avec signature tapée", () => {
    const quote = { id: "q1", number: "DEV-1", status: "Envoyé" };
    const signed = acceptQuoteWithSignature(quote, {
      mode: "typed",
      typedName: "Jean Dupont",
      clientEmail: "jean@example.com",
    });
    expect(signed.status).toBe("Accepté");
    expect(isQuoteSigned(signed)).toBe(true);
    expect(signed.signature.typedName).toBe("Jean Dupont");
  });
});
