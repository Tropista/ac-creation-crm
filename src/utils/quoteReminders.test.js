import { afterEach, describe, expect, it } from "vitest";
import {
  buildQuoteReminderEmail,
  DEFAULT_QUOTE_REMINDER_TEMPLATES,
  openQuoteReminderMailto,
} from "./quoteReminders.js";

describe("buildQuoteReminderEmail", () => {
  const quote = {
    number: "DEV-2025-0100",
    date: "01/05/2025",
    sentAt: "2025-05-01T10:00:00.000Z",
    totalTTC: 420,
    status: "Envoyé",
  };
  const client = { name: "Client Mug", email: "client@test.fr" };

  it("construit une relance devis avec date d'envoi", () => {
    const { subject, body, reminderNumber } = buildQuoteReminderEmail(
      quote,
      client,
      { companyName: "AC Creation" }
    );

    expect(reminderNumber).toBe(1);
    expect(subject).toContain("DEV-2025-0100");
    expect(body).toContain("Envoyé le");
    expect(body).toContain(DEFAULT_QUOTE_REMINDER_TEMPLATES[1].intro.slice(0, 20));
  });
});

describe("openQuoteReminderMailto", () => {
  afterEach(() => {
    delete global.window;
  });

  it("refuse sans email client", () => {
    expect(
      openQuoteReminderMailto({ number: "DEV-1" }, { name: "Sans mail" })
    ).toEqual({ ok: false, reason: "no_email" });
  });

  it("ouvre un mailto encodé", () => {
    global.window = { location: { href: "" } };
    const result = openQuoteReminderMailto(
      { number: "DEV-1", sentAt: "2025-05-01", totalTTC: 100, status: "Envoyé" },
      { name: "Test", email: "test@ac.fr" },
      { companyName: "AC Creation" }
    );
    expect(result.ok).toBe(true);
    expect(global.window.location.href).toMatch(/^mailto:test%40ac.fr/);
  });
});
