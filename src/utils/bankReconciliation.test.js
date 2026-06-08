import { describe, expect, it } from "vitest";
import {
  buildPaidInvoiceUpdate,
  buildUnpaidInvoiceRevert,
  extractInvoiceNumbers,
  findInvoiceByReference,
  getAutoReconciliationCandidates,
  getInvoiceOpenAmount,
  getReconcilableInvoices,
  getTransactionReconciliationState,
  invoiceNumbersMatch,
  normalizeInvoiceNumber,
  scoreInvoiceMatch,
  suggestInvoiceMatches,
} from "./bankReconciliation.js";

const data = {
  clients: [{ id: "c1", name: "Dupont SARL" }],
};

const invoices = [
  {
    id: "inv-1",
    number: "FAC-2025-0010",
    clientId: "c1",
    date: "01/06/2025",
    totalTTC: 1200,
    status: "En attente",
  },
  {
    id: "inv-2",
    number: "FAC-2025-0011",
    clientId: "c1",
    date: "15/06/2025",
    totalTTC: 500,
    status: "Payée",
  },
  {
    id: "inv-3",
    number: "FAC-2025-0012",
    clientId: "c1",
    date: "20/06/2025",
    totalTTC: 800,
    status: "Annulée",
  },
];

describe("normalizeInvoiceNumber / extractInvoiceNumbers", () => {
  it("normalise les références facture", () => {
    expect(normalizeInvoiceNumber(" fac 2025 0010 ")).toBe("FAC-2025-0010");
    expect(normalizeInvoiceNumber("FAC--2025--0010")).toBe("FAC-2025-0010");
  });

  it("extrait les numéros depuis le libellé bancaire", () => {
    expect(
      extractInvoiceNumbers("Virement Client FAC 2025 0010 - Dupont")
    ).toEqual(["FAC-2025-0010"]);
    expect(extractInvoiceNumbers("")).toEqual([]);
  });
});

describe("invoiceNumbersMatch", () => {
  it("accepte une correspondance exacte ou par suffixe", () => {
    expect(invoiceNumbersMatch("FAC-2025-0010", "FAC-2025-0010")).toBe(true);
    expect(invoiceNumbersMatch("FAC-2025-0010", "0010")).toBe(true);
    expect(invoiceNumbersMatch("FAC-2025-0010", "FAC-2025-0099")).toBe(false);
    expect(invoiceNumbersMatch("", "FAC-2025-0010")).toBe(false);
  });
});

describe("findInvoiceByReference", () => {
  it("retrouve une facture par numéro normalisé", () => {
    expect(findInvoiceByReference(invoices, "FAC 2025 0010")?.id).toBe("inv-1");
    expect(findInvoiceByReference(invoices, "9999")).toBeNull();
  });
});

describe("scoreInvoiceMatch", () => {
  it("score élevé pour numéro + montant exact + client + date proche", () => {
    const transaction = {
      description: "Virement Dupont FAC-2025-0010",
      amount: -1200,
      transaction_date: "03/06/2025",
    };

    const result = scoreInvoiceMatch(transaction, invoices[0], "Dupont SARL");

    expect(result.score).toBeGreaterThanOrEqual(100);
    expect(result.reasons).toEqual(
      expect.arrayContaining(["Numéro facture", "Montant exact", "Client", "Date proche"])
    );
  });

  it("score partiel pour montant proche sans numéro", () => {
    const transaction = {
      description: "Paiement client",
      amount: -1180,
      transaction_date: "01/01/2020",
    };

    const result = scoreInvoiceMatch(transaction, invoices[0], "");

    expect(result.score).toBe(20);
    expect(result.reasons).toEqual(["Montant proche"]);
  });
});

describe("getInvoiceOpenAmount", () => {
  it("utilise le reste à payer quand il existe", () => {
    expect(getInvoiceOpenAmount({ totalTTC: 1200, paidAmount: 500, remaining: 700 })).toBe(700);
    expect(getInvoiceOpenAmount({ totalTTC: 1200, paidAmount: 500 })).toBe(700);
  });
});

describe("suggestInvoiceMatches", () => {
  it("propose les factures non annulées triées par score", () => {
    const transaction = {
      description: "FAC-2025-0010 Dupont",
      amount: -1200,
      transaction_date: "02/06/2025",
    };

    const suggestions = suggestInvoiceMatches(transaction, invoices, data, {
      limit: 2,
    });

    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].invoice.id).toBe("inv-1");
    expect(suggestions[0].score).toBeGreaterThan(
      suggestions.find((entry) => entry.invoice.id === "inv-2")?.score ?? 0
    );
  });

  it("ignore les factures annulées", () => {
    const transaction = {
      description: "FAC-2025-0012",
      amount: -800,
      transaction_date: "21/06/2025",
    };

    const suggestions = suggestInvoiceMatches(transaction, invoices, data);

    expect(suggestions.some((entry) => entry.invoice.id === "inv-3")).toBe(false);
  });
});

describe("getReconcilableInvoices", () => {
  it("retourne uniquement les factures ouvertes triées par numéro", () => {
    const open = getReconcilableInvoices(invoices);

    expect(open.map((invoice) => invoice.id)).toEqual(["inv-1"]);
  });
});

describe("getAutoReconciliationCandidates", () => {
  it("retient uniquement les correspondances fortes et uniques", () => {
    const candidates = getAutoReconciliationCandidates(
      [
        {
          id: "tx-1",
          description: "Virement Dupont FAC-2025-0010",
          amount: 1200,
          transaction_date: "03/06/2025",
        },
        {
          id: "tx-2",
          description: "Paiement client vague",
          amount: 500,
          transaction_date: "03/06/2025",
        },
      ],
      invoices,
      data
    );

    expect(candidates).toHaveLength(1);
    expect(candidates[0].transaction.id).toBe("tx-1");
    expect(candidates[0].invoice.id).toBe("inv-1");
  });
});

describe("buildPaidInvoiceUpdate / buildUnpaidInvoiceRevert", () => {
  it("marque une facture payée avec la transaction bancaire", () => {
    const transaction = { id: "tx-42" };
    const updated = buildPaidInvoiceUpdate(invoices[0], transaction);

    expect(updated.status).toBe("Payée");
    expect(updated.paidAmount).toBe(1200);
    expect(updated.remaining).toBe(0);
    expect(updated.bankTransactionId).toBe("tx-42");
    expect(updated.bankReconciledAt).toBeTruthy();
  });

  it("annule le rapprochement si la transaction disparaît", () => {
    const paid = buildPaidInvoiceUpdate(invoices[0], { id: "tx-42" });
    const reverted = buildUnpaidInvoiceRevert(paid);

    expect(reverted.status).toBe("Non payée");
    expect(reverted.paidAmount).toBe(0);
    expect(reverted.remaining).toBe(1200);
    expect(reverted.bankTransactionId).toBeNull();
    expect(reverted.bankReconciledAt).toBeNull();
  });
});

describe("getTransactionReconciliationState", () => {
  it("détecte pending, matched et orphan", () => {
    expect(getTransactionReconciliationState({}, invoices).status).toBe("pending");

    expect(
      getTransactionReconciliationState(
        { matched: true, matched_invoice: "FAC-2025-0010" },
        invoices
      )
    ).toMatchObject({ status: "matched", invoice: { id: "inv-1" } });

    expect(
      getTransactionReconciliationState(
        { matched: true, matched_invoice: "FAC-2099-9999" },
        invoices
      )
    ).toMatchObject({ status: "orphan", invoice: null });
  });
});
