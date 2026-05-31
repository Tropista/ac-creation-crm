import { describe, it, expect } from "vitest";
import { getInvoicesDueForReminder, getDueReminderStep } from "./autoReminderEngine.js";

const today = new Date("2026-06-01");

const baseInvoice = {
  id: "inv1",
  number: "FAC-2026-0001",
  date: "01/04/2026",
  dueDate: "01/05/2026", // échéance 1er mai
  status: "Non payée",
  totalTTC: 100,
  clientId: "c1",
  reminderCount: 0,
};

const client = { id: "c1", name: "Test Client", email: "client@test.lu" };
const schedule = [7, 14, 30];

describe("getDueReminderStep", () => {
  it("retourne null si la facture est payée", () => {
    expect(getDueReminderStep({ ...baseInvoice, status: "Payée" }, schedule, today)).toBeNull();
  });

  it("retourne null si pas encore échu", () => {
    const future = { ...baseInvoice, dueDate: "10/06/2026" };
    expect(getDueReminderStep(future, schedule, today)).toBeNull();
  });

  it("retourne null si pas encore le seuil J+7", () => {
    // 2 jours après échéance — pas encore 7 jours
    const ref = new Date("2026-05-03");
    expect(getDueReminderStep(baseInvoice, schedule, ref)).toBeNull();
  });

  it("retourne relance n°1 à J+7", () => {
    const ref = new Date("2026-05-08"); // 7 jours après le 1er mai
    const step = getDueReminderStep(baseInvoice, schedule, ref);
    expect(step).not.toBeNull();
    expect(step.reminderNumber).toBe(1);
    expect(step.daysOverdue).toBe(7);
  });

  it("retourne relance n°2 à J+14 si déjà 1 relance", () => {
    const inv = { ...baseInvoice, reminderCount: 1 };
    const ref = new Date("2026-05-15"); // 14 jours après
    const step = getDueReminderStep(inv, schedule, ref);
    expect(step?.reminderNumber).toBe(2);
  });

  it("retourne null si toutes les relances ont été envoyées", () => {
    const inv = { ...baseInvoice, reminderCount: 3 };
    expect(getDueReminderStep(inv, schedule, today)).toBeNull();
  });

  it("retourne null si annulée", () => {
    expect(getDueReminderStep({ ...baseInvoice, status: "Annulée" }, schedule, today)).toBeNull();
  });
});

describe("getInvoicesDueForReminder", () => {
  it("retourne les factures éligibles", () => {
    const settings = { autoReminderEnabled: true };
    const results = getInvoicesDueForReminder([baseInvoice], [client], settings, today);
    expect(results).toHaveLength(1);
    expect(results[0].invoice.number).toBe("FAC-2026-0001");
    expect(results[0].reminderNumber).toBe(1);
  });

  it("exclut les factures sans email client", () => {
    const noEmail = { ...client, email: "" };
    const results = getInvoicesDueForReminder([baseInvoice], [noEmail], {}, today);
    expect(results).toHaveLength(0);
  });

  it("retourne vide si relances désactivées", () => {
    const results = getInvoicesDueForReminder([baseInvoice], [client], { autoReminderEnabled: false }, today);
    expect(results).toHaveLength(0);
  });

  it("trie par jours de retard décroissant", () => {
    const inv2 = { ...baseInvoice, id: "inv2", number: "FAC-0002", dueDate: "01/04/2026" }; // plus en retard
    const results = getInvoicesDueForReminder([baseInvoice, inv2], [client, { ...client, id: "c1" }], {}, today);
    expect(results[0].daysOverdue).toBeGreaterThanOrEqual(results[results.length - 1].daysOverdue);
  });
});
