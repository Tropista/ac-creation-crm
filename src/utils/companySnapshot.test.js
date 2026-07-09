import { describe, expect, it } from "vitest";
import {
  buildCompanySnapshot,
  ensureDocumentCompanySnapshot,
  getDocumentCompanySnapshot,
} from "./companySnapshot.js";

const oldSettings = {
  companyName: "Ancienne Societe",
  companyAddress: "1 rue Ancienne",
  companyPhone: "+352 111",
  companyEmail: "old@example.com",
  vatNumber: "LUOLD",
  logoUrl: "https://example.com/old-logo.png",
  paymentTerms: "Paiement ancien",
  bankInfo: "Nom de la banque : Old Bank\nBIC : OLDLULL\nIBAN : LU00 OLD",
};

const newSettings = {
  companyName: "AC Creation SARL-S",
  companyAddress: "2 rue Nouvelle",
  companyPhone: "+352 222",
  companyEmail: "new@example.com",
  vatNumber: "LUNEW",
  logoUrl: "https://example.com/new-logo.png",
  paymentTerms: "Paiement nouveau",
  bankInfo: "Nom de la banque : New Bank\nBIC : NEWLULL\nIBAN : LU00 NEW",
};

describe("companySnapshot", () => {
  it("une facture creee avant changement conserve les anciennes informations", () => {
    const invoice = {
      id: "inv-old",
      companySnapshot: buildCompanySnapshot(oldSettings, { capturedAt: "2026-01-01T00:00:00.000Z" }),
    };

    expect(getDocumentCompanySnapshot(invoice, newSettings).companyName).toBe("Ancienne Societe");
    expect(getDocumentCompanySnapshot(invoice, newSettings).vatNumber).toBe("LUOLD");
  });

  it("une facture creee apres changement utilise les nouvelles informations", () => {
    const invoice = ensureDocumentCompanySnapshot({ id: "inv-new" }, newSettings);

    expect(invoice.companySnapshot.companyName).toBe("AC Creation SARL-S");
    expect(invoice.companySnapshot.vatNumber).toBe("LUNEW");
  });

  it("n'ecrase jamais un snapshot existant", () => {
    const invoice = {
      id: "inv-existing",
      companySnapshot: buildCompanySnapshot(oldSettings, { capturedAt: "2026-01-01T00:00:00.000Z" }),
    };

    const result = ensureDocumentCompanySnapshot(invoice, newSettings);

    expect(result.companySnapshot.companyName).toBe("Ancienne Societe");
    expect(result.companySnapshot.capturedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("extrait IBAN, BIC et banque depuis les infos bancaires existantes", () => {
    const snapshot = buildCompanySnapshot(oldSettings, { capturedAt: "2026-01-01T00:00:00.000Z" });

    expect(snapshot.bank).toBe("Old Bank");
    expect(snapshot.bic).toBe("OLDLULL");
    expect(snapshot.iban).toBe("LU00 OLD");
  });
});
