import { describe, it, expect } from "vitest";
import {
  parseDocumentDate,
  isPaidInvoice,
  isCancelledInvoice,
  isInvoiceOverdue,
  sortOverdueInvoices,
} from "./invoices.js";

describe("parseDocumentDate", () => {
  it("parse une date au format français JJ/MM/AAAA", () => {
    const parsed = parseDocumentDate("15/03/2025");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getFullYear()).toBe(2025);
    expect(parsed.getMonth()).toBe(2);
    expect(parsed.getDate()).toBe(15);
  });

  it("retourne null pour une chaîne vide ou invalide", () => {
    expect(parseDocumentDate("")).toBeNull();
    expect(parseDocumentDate(null)).toBeNull();
    expect(parseDocumentDate("pas-une-date")).toBeNull();
    expect(parseDocumentDate("32/13/2025")).toBeNull();
  });

  it("accepte un format ISO en repli", () => {
    const parsed = parseDocumentDate("2025-06-01");
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed.getFullYear()).toBe(2025);
  });
});

describe("isPaidInvoice", () => {
  it("détecte les statuts contenant payée, payé ou réglé", () => {
    expect(isPaidInvoice({ status: "Payée" })).toBe(true);
    expect(isPaidInvoice({ status: "payee" })).toBe(true);
    expect(isPaidInvoice({ status: "Réglée" })).toBe(true);
    expect(isPaidInvoice({ status: "Non payée" })).toBe(true);
    expect(isPaidInvoice({ status: "En attente" })).toBe(false);
  });

  it("considère payée une facture dont le reste est nul ou quasi nul", () => {
    expect(isPaidInvoice({ remaining: 0 })).toBe(true);
    expect(isPaidInvoice({ remaining: 0.005 })).toBe(true);
    expect(isPaidInvoice({ remaining: 50 })).toBe(false);
  });

  it("considère payée une facture dont le montant payé couvre le TTC", () => {
    expect(
      isPaidInvoice({ totalTTC: 100, paidAmount: 100, status: "En cours" })
    ).toBe(true);
    expect(
      isPaidInvoice({ totalTTC: 100, paidAmount: 99.995, status: "En cours" })
    ).toBe(true);
    expect(
      isPaidInvoice({ totalTTC: 100, paidAmount: 50, status: "En cours" })
    ).toBe(false);
  });
});

describe("isCancelledInvoice", () => {
  it("détecte les statuts annulés", () => {
    expect(isCancelledInvoice({ status: "Annulée" })).toBe(true);
    expect(isCancelledInvoice({ status: "annule" })).toBe(true);
    expect(isCancelledInvoice({ status: "Non payée" })).toBe(false);
  });
});

describe("isInvoiceOverdue", () => {
  const ref = new Date("2025-06-15");

  it("retourne false pour une facture payée, annulée ou absente", () => {
    expect(isInvoiceOverdue({ status: "Payée", dueDate: "01/01/2020" }, ref)).toBe(
      false
    );
    expect(isInvoiceOverdue({ status: "Annulée", dueDate: "01/01/2020" }, ref)).toBe(
      false
    );
    expect(isInvoiceOverdue(null, ref)).toBe(false);
  });

  it("retourne true si le statut mentionne un retard", () => {
    expect(
      isInvoiceOverdue({ status: "En retard", dueDate: "01/07/2025" }, ref)
    ).toBe(true);
  });

  it("compare la date d'échéance au début de la journée de référence", () => {
    const unpaid = { status: "En attente" };
    expect(isInvoiceOverdue({ ...unpaid, dueDate: "14/06/2025" }, ref)).toBe(
      true
    );
    expect(isInvoiceOverdue({ ...unpaid, dueDate: "15/06/2025" }, ref)).toBe(
      false
    );
    expect(isInvoiceOverdue({ ...unpaid, dueDate: "16/06/2025" }, ref)).toBe(
      false
    );
  });

  it("retourne false sans date d'échéance valide", () => {
    expect(isInvoiceOverdue({ status: "En attente" }, ref)).toBe(false);
    expect(isInvoiceOverdue({ status: "En attente", dueDate: "" }, ref)).toBe(
      false
    );
  });
});

describe("sortOverdueInvoices", () => {
  it("trie par échéance croissante puis par montant TTC décroissant", () => {
    const invoices = [
      { id: "a", dueDate: "20/06/2025", totalTTC: 200 },
      { id: "b", dueDate: "10/06/2025", totalTTC: 50 },
      { id: "c", dueDate: "10/06/2025", totalTTC: 300 },
      { id: "d", dueDate: "01/06/2025", totalTTC: 100 },
    ];

    const sorted = sortOverdueInvoices(invoices);

    expect(sorted.map((i) => i.id)).toEqual(["d", "c", "b", "a"]);
  });

  it("gère une liste vide ou undefined", () => {
    expect(sortOverdueInvoices([])).toEqual([]);
    expect(sortOverdueInvoices(undefined)).toEqual([]);
  });
});

describe("filtrage des factures en retard", () => {
  const ref = new Date("2025-06-15");
  const invoices = [
    { id: 1, status: "Payée", dueDate: "01/01/2020", totalTTC: 100 },
    { id: 2, status: "En attente", dueDate: "01/06/2025", totalTTC: 200 },
    { id: 3, status: "En attente", dueDate: "01/07/2025", totalTTC: 150 },
    { id: 4, status: "En retard", dueDate: "01/08/2025", totalTTC: 80 },
  ];

  it("filtre les factures en retard comme dans le tableau de bord", () => {
    const overdue = invoices.filter((inv) => isInvoiceOverdue(inv, ref));
    expect(overdue.map((i) => i.id)).toEqual([2, 4]);
  });
});
