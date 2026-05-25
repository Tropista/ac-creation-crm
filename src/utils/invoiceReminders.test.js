import { afterEach, describe, expect, it } from "vitest";
import { isInvoiceOverdue } from "./invoices.js";
import {
  buildInvoiceReminderEmail,
  computeDueDate,
  DEFAULT_REMINDER_TEMPLATES,
  getNextReminderNumber,
  getReminderTemplate,
  MAX_PAYMENT_DAYS,
  MIN_PAYMENT_DAYS,
  normalizePaymentDays,
  openInvoiceReminderMailto,
} from "./invoiceReminders.js";

describe("normalizePaymentDays", () => {
  it("retourne 30 par défaut pour les valeurs invalides", () => {
    expect(normalizePaymentDays(undefined)).toBe(30);
    expect(normalizePaymentDays("")).toBe(30);
    expect(normalizePaymentDays(0)).toBe(30);
    expect(normalizePaymentDays(-5)).toBe(30);
  });

  it("borne la valeur entre 1 et 365 jours", () => {
    expect(normalizePaymentDays(45)).toBe(45);
    expect(normalizePaymentDays(400)).toBe(MAX_PAYMENT_DAYS);
    expect(normalizePaymentDays(MIN_PAYMENT_DAYS)).toBe(MIN_PAYMENT_DAYS);
  });
});

describe("computeDueDate", () => {
  it("ajoute les jours de paiement à la date d'émission", () => {
    expect(computeDueDate("15/03/2025", 30)).toBe("14/04/2025");
    expect(computeDueDate("01/01/2025", 45)).toBe("15/02/2025");
  });

  it("utilise 30 jours par défaut", () => {
    expect(computeDueDate("10/05/2025")).toBe("09/06/2025");
  });
});

describe("getNextReminderNumber", () => {
  it("incrémente le compteur de relances", () => {
    expect(getNextReminderNumber({ reminderCount: 0 })).toBe(1);
    expect(getNextReminderNumber({ reminderCount: 2 })).toBe(3);
    expect(getNextReminderNumber({})).toBe(1);
  });
});

describe("getReminderTemplate", () => {
  it("sélectionne le modèle selon le numéro de relance", () => {
    expect(getReminderTemplate({}, 1).label).toBe(
      DEFAULT_REMINDER_TEMPLATES[1].label
    );
    expect(getReminderTemplate({}, 2).intro).toContain("précédent rappel");
    expect(getReminderTemplate({}, 5).label).toBe(
      DEFAULT_REMINDER_TEMPLATES[3].label
    );
  });

  it("accepte des modèles personnalisés depuis les paramètres", () => {
    const template = getReminderTemplate(
      {
        invoiceReminderTemplates: {
          1: { intro: "Message personnalisé AC Creation." },
        },
      },
      1
    );
    expect(template.intro).toBe("Message personnalisé AC Creation.");
  });
});

describe("buildInvoiceReminderEmail", () => {
  const invoice = {
    number: "FAC-2025-0012",
    date: "01/05/2025",
    dueDate: "31/05/2025",
    totalTTC: 1234.5,
    status: "Non payée",
  };

  const client = { name: "Atelier Dupont", email: "contact@dupont.fr" };

  it("construit un objet avec sujet et corps de relance n°1", () => {
    const { subject, body, reminderNumber } = buildInvoiceReminderEmail(
      invoice,
      client,
      {
        companyName: "AC Creation",
        companyEmail: "hello@accreation.fr",
        paymentTerms: "Paiement sous 30 jours.",
        bankInfo: "IBAN FR76 1234 5678",
      }
    );

    expect(reminderNumber).toBe(1);
    expect(subject).toBe(
      "Relance n°1 — Facture FAC-2025-0012 — AC Creation"
    );
    expect(body).toContain("Bonjour Atelier Dupont");
    expect(body).toContain("Facture : FAC-2025-0012");
    expect(body).toContain("Échéance : 31/05/2025");
    expect(body).toMatch(/1[\s\u202f]234,50 €/);
    expect(body).toContain("Paiement sous 30 jours.");
    expect(body).toContain("IBAN FR76 1234 5678");
    expect(body).toContain("hello@accreation.fr");
  });

  it("adapte le ton pour la relance n°2", () => {
    const { body, reminderNumber } = buildInvoiceReminderEmail(
      { ...invoice, reminderCount: 1 },
      client,
      { companyName: "AC Creation" },
      { reminderNumber: 2 }
    );

    expect(reminderNumber).toBe(2);
    expect(body).toContain("précédent rappel");
  });

  it("omets l'échéance si absente et sans date d'émission", () => {
    const { body } = buildInvoiceReminderEmail(
      { ...invoice, dueDate: "", date: "" },
      client
    );

    expect(body).not.toContain("Échéance :");
  });

  it("calcule l'échéance depuis paymentDays si dueDate absente", () => {
    const { body } = buildInvoiceReminderEmail(
      { ...invoice, dueDate: "" },
      client,
      { paymentDays: 30 }
    );

    expect(body).toContain("Échéance : 31/05/2025");
  });

  it("ajoute une note personnalisée depuis les paramètres", () => {
    const { body } = buildInvoiceReminderEmail(invoice, client, {
      invoiceReminderNote: "Merci de mentionner le numéro de facture.",
    });

    expect(body).toContain("Merci de mentionner le numéro de facture.");
  });
});

describe("openInvoiceReminderMailto", () => {
  afterEach(() => {
    delete global.window;
  });

  it("refuse l'ouverture sans email client", () => {
    const result = openInvoiceReminderMailto(
      { number: "FAC-1", date: "01/01/2025", totalTTC: 100, status: "Non payée" },
      { name: "Sans mail" }
    );

    expect(result).toEqual({ ok: false, reason: "no_email" });
  });

  it("ouvre un mailto encodé avec sujet et corps", () => {
    global.window = { location: { href: "" } };

    const invoice = {
      number: "FAC-2025-0099",
      date: "02/06/2025",
      dueDate: "02/07/2025",
      totalTTC: 500,
      status: "Non payée",
      reminderCount: 1,
    };
    const client = { name: "Client Test", email: "client@test.fr" };

    const result = openInvoiceReminderMailto(invoice, client, {
      companyName: "AC Creation",
    });

    expect(result).toEqual({ ok: true, reminderNumber: 2 });
    expect(global.window.location.href).toMatch(/^mailto:client%40test.fr/);
    expect(global.window.location.href).toContain(
      encodeURIComponent("Relance n°2 — Facture FAC-2025-0099 — AC Creation")
    );
    expect(global.window.location.href).toContain(encodeURIComponent("Client Test"));
  });
});

describe("relance des factures en retard", () => {
  const ref = new Date("2025-06-15");

  it("identifie les factures éligibles à une relance", () => {
    const invoices = [
      { id: 1, status: "Payée", dueDate: "01/01/2020", totalTTC: 100, number: "FAC-1" },
      { id: 2, status: "En attente", dueDate: "01/06/2025", totalTTC: 200, number: "FAC-2" },
      { id: 3, status: "En attente", dueDate: "01/07/2025", totalTTC: 150, number: "FAC-3" },
    ];

    const toRemind = invoices.filter(
      (invoice) =>
        isInvoiceOverdue(invoice, ref) &&
        buildInvoiceReminderEmail(invoice, { name: "Client" }).subject.includes(
          invoice.number
        )
    );

    expect(toRemind.map((invoice) => invoice.id)).toEqual([2]);
  });
});
