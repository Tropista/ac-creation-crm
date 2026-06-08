import { describe, expect, it } from "vitest";
import {
  buildInvoicePaymentVariables,
  getInvoicePaymentLink,
  interpolatePaymentUrlTemplate,
  normalizePaymentProvider,
} from "./onlinePayments";

describe("onlinePayments", () => {
  it("normalise le fournisseur de paiement", () => {
    expect(normalizePaymentProvider("stripe")).toBe("stripe");
    expect(normalizePaymentProvider("unknown")).toBe("manual");
  });

  it("prépare les variables de lien avec le reste à payer", () => {
    const vars = buildInvoicePaymentVariables(
      { id: "i1", number: "FAC-1", totalTTC: 120, paidAmount: 20 },
      { name: "Client Test", email: "client@example.com" }
    );

    expect(vars.amount).toBe("100.00");
    expect(vars.amountCents).toBe("10000");
    expect(vars.clientEmail).toBe("client@example.com");
  });

  it("remplace les variables encodées dans le modèle d'URL", () => {
    const url = interpolatePaymentUrlTemplate(
      "https://pay.example.com/{number}?amount={amountCents}&client={clientName}",
      { number: "FAC 1", totalTTC: 42 },
      { name: "AC Client" }
    );

    expect(url).toBe("https://pay.example.com/FAC%201?amount=4200&client=AC%20Client");
  });

  it("préfère le lien direct de la facture", () => {
    expect(
      getInvoicePaymentLink(
        { paymentLink: "https://pay.example.com/direct", totalTTC: 10 },
        { onlinePaymentUrlTemplate: "https://pay.example.com/{number}" }
      )
    ).toBe("https://pay.example.com/direct");
  });
});

