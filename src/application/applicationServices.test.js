import { describe, expect, it, vi } from "vitest";
import { CustomerApplicationService } from "./CustomerApplicationService";
import { InvoiceApplicationService } from "./InvoiceApplicationService";
import { PaymentApplicationService } from "./PaymentApplicationService";
import { WorkshopApplicationService } from "./WorkshopApplicationService";
import { ProductionApplicationService } from "./ProductionApplicationService";
import { CRMEventApplicationService } from "./CRMEventApplicationService";
import { OrderApplicationService } from "./OrderApplicationService";
import { createCrmStateRepository } from "../repositories/crmStateRepository";

const baseState = () => ({
  clients: [],
  quotes: [],
  invoices: [],
  payments: [],
  products: [],
  deliveryNotes: [],
  settings: { paymentDays: 30 },
});

describe("Application Services CRM", () => {
  it("crée un client de façon idempotente", () => {
    const service = new CustomerApplicationService();
    const first = service.save(
      baseState(),
      { name: "AC Client", taxRateOverride: "17" },
      { idempotencyKey: "customer:site:1" },
    );
    const second = service.save(
      first,
      { name: "AC Client actualisé", taxRateOverride: "17" },
      { idempotencyKey: "customer:site:1" },
    );
    expect(second.clients).toHaveLength(1);
    expect(second.customer.name).toBe("AC Client actualisé");
    expect(second.created).toBe(false);
  });

  it("convertit une seule fois un devis en facture", () => {
    const service = new InvoiceApplicationService();
    const quote = {
      id: "quote-1",
      number: "DEV-2026-0001",
      status: "Accepté",
      totalTTC: 117,
      lines: [],
    };
    const first = service.convertQuote(
      { ...baseState(), quotes: [quote] },
      quote,
    );
    const second = service.convertQuote(first, quote);
    expect(second.invoices).toHaveLength(1);
    expect(second.created).toBe(false);
    expect(second.invoice.convertedFrom).toBe(quote.number);
  });

  it("enregistre un paiement idempotent", () => {
    const service = new PaymentApplicationService();
    const invoice = {
      id: "invoice-1",
      number: "FAC-2026-0001",
      clientId: "client-1",
      totalTTC: 100,
      remaining: 100,
      status: "Non payée",
    };
    const state = { ...baseState(), invoices: [invoice] };
    const first = service.record(state, invoice, {
      amount: 20,
      method: "Virement",
      idempotencyKey: "payment:site:1",
    });
    const second = service.record(first, first.invoice, {
      amount: 20,
      method: "Virement",
      idempotencyKey: "payment:site:1",
    });
    expect(second.payments).toHaveLength(1);
    expect(second.skipped).toBe(true);
  });

  it("centralise le passage atelier et production", () => {
    const workshop = new WorkshopApplicationService();
    const production = new ProductionApplicationService();
    const quote = {
      id: "quote-1",
      number: "DEV-2026-0001",
      status: "Accepté",
      lines: [],
    };
    const state = { ...baseState(), quotes: [quote] };
    const changed = workshop.changeStatus(state, quote, "En production");
    expect(changed.quotes[0].status).toBe("En production");
    const advanced = production.advance(changed, changed.quotes[0]);
    expect(advanced.advanced).toBe(true);
  });

  it("annule toute transaction applicative en cas d'erreur", async () => {
    const initial = baseState();
    const repository = createCrmStateRepository(initial);
    const service = new OrderApplicationService({
      repository,
      steps: [
        (state) => ({ ...state, clients: [{ id: "temporary" }] }),
        () => {
          throw new Error("PRODUCTION_FAILED");
        },
      ],
    });
    await expect(
      service.create({ id: "order-1", idempotencyKey: "order:1" }),
    ).rejects.toThrow("PRODUCTION_FAILED");
    expect(repository.read()).toBe(initial);
  });

  it("traite un événement CRM une seule fois et journalise le résultat", async () => {
    const repository = createCrmStateRepository(baseState());
    const logger = vi.fn();
    const service = new CRMEventApplicationService({
      repository,
      logger,
      handlers: {
        "customer.created": (state, customer) => ({
          ...state,
          clients: [...state.clients, customer],
        }),
      },
    });
    const event = {
      id: "event-1",
      type: "customer.created",
      payload: { id: "customer-1" },
    };
    const first = await service.handle(event);
    const second = await service.handle(event);
    expect(first.processed).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(repository.read().clients).toHaveLength(1);
    expect(logger).toHaveBeenCalledOnce();
  });
});
