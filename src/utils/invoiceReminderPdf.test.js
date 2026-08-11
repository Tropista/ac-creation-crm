import { describe, expect, it } from "vitest";
import {
  appendInvoiceReminderHistory,
  buildInvoiceReminderPdfData,
  canGenerateInvoiceReminder,
  getReminderFileName,
} from "./invoiceReminderPdf";

const invoice = {
  number: "FAC-2026-0020",
  date: "01/07/2026",
  dueDate: "31/07/2026",
  status: "Partiellement payée",
  totalTTC: 1000,
  paidAmount: 400,
};

describe("invoice reminder PDF data", () => {
  it("uses the remaining balance after a partial payment", () => {
    const result = buildInvoiceReminderPdfData(
      invoice,
      {},
      new Date("2026-08-10T12:00:00"),
    );
    expect(result).toMatchObject({
      initialAmount: 1000,
      paidAmount: 400,
      remainingAmount: 600,
      daysOverdue: 10,
      level: "reminder_1",
    });
    expect(result.fileName).toBe("RAPPEL-1-FAC-2026-0020.pdf");
  });

  it("supports the second and final reminder names", () => {
    expect(getReminderFileName({ ...invoice, reminderCount: 1 })).toBe(
      "RAPPEL-2-FAC-2026-0020.pdf",
    );
    expect(getReminderFileName({ ...invoice, reminderCount: 2 })).toBe(
      "RAPPEL-FINAL-FAC-2026-0020.pdf",
    );
  });

  it("excludes paid and cancelled invoices", () => {
    expect(canGenerateInvoiceReminder({ ...invoice, status: "Payée" })).toBe(
      false,
    );
    expect(canGenerateInvoiceReminder({ ...invoice, status: "Annulée" })).toBe(
      false,
    );
    expect(canGenerateInvoiceReminder(invoice)).toBe(true);
  });

  it("records PDF history without changing the email reminder counter", () => {
    const reminder = buildInvoiceReminderPdfData(
      invoice,
      {},
      new Date("2026-08-10T12:00:00Z"),
    );
    const updated = appendInvoiceReminderHistory(
      invoice,
      reminder,
      "PDF",
      "Alice",
      new Date("2026-08-10T12:00:00Z"),
    );
    expect(updated.reminderCount).toBeUndefined();
    expect(updated.reminderHistory[0]).toMatchObject({
      level: "reminder_1",
      type: "PDF",
      user: "Alice",
      remainingAmount: 600,
    });
  });
});
