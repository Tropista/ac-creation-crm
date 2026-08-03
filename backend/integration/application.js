import { CustomerApplicationService } from "../../src/application/CustomerApplicationService.js";
import { InvoiceApplicationService } from "../../src/application/InvoiceApplicationService.js";
import { OrderApplicationService } from "../../src/application/OrderApplicationService.js";
import { PaymentApplicationService } from "../../src/application/PaymentApplicationService.js";
import { ProductionApplicationService } from "../../src/application/ProductionApplicationService.js";
import { CRMEventApplicationService } from "../../src/application/CRMEventApplicationService.js";
import { WorkshopApplicationService } from "../../src/application/WorkshopApplicationService.js";

function findInvoice(state, payload) {
  return (state.invoices || []).find(
    (invoice) =>
      String(invoice.id) === String(payload.invoiceId) ||
      String(invoice.number) === String(payload.invoiceNumber),
  );
}

function findQuote(state, payload) {
  return (state.quotes || []).find(
    (quote) =>
      String(quote.id) === String(payload.quoteId || payload.id) ||
      String(quote.number) === String(payload.quoteNumber),
  );
}

export function createIntegrationApplication(repository, logger = null) {
  const customers = new CustomerApplicationService();
  const invoices = new InvoiceApplicationService();
  const payments = new PaymentApplicationService();
  const workshop = new WorkshopApplicationService();
  const production = new ProductionApplicationService();
  const orderService = new OrderApplicationService({
    repository,
    logger,
    steps: [
      (state, command) =>
        command.customer
          ? customers.save(state, command.customer, {
              customerId: command.customer.id,
              idempotencyKey: `order-customer:${command.id}`,
            })
          : state,
      (state, command) => {
        if (!command.quote) return state;
        const existing = findQuote(state, command.quote);
        return existing
          ? workshop.patchQuote(state, existing.id, command.quote)
          : { ...state, quotes: [...(state.quotes || []), command.quote] };
      },
      (state, command) => {
        if (!command.convertQuoteId) return state;
        const quote = findQuote(state, { quoteId: command.convertQuoteId });
        if (!quote) throw new Error("CRM_ORDER_QUOTE_NOT_FOUND");
        return invoices.convertQuote(state, quote);
      },
    ],
  });

  const handlers = {
    "customer.created": (state, payload, event) =>
      customers.save(state, payload, {
        customerId: payload.id,
        idempotencyKey: `event:${event.id}`,
      }),
    "customer.updated": (state, payload) =>
      customers.save(state, payload, { customerId: payload.id }),
    "order.created": (state, payload, event) => {
      const command = {
        ...payload,
        id: payload.id || event.id,
        idempotencyKey: event.id,
      };
      return orderService.apply(state, command);
    },
    "order.updated": (state, payload) => {
      const quote = findQuote(state, payload);
      if (!quote) throw new Error("CRM_ORDER_NOT_FOUND");
      return workshop.patchQuote(state, quote.id, payload.quote || payload);
    },
    "payment.completed": (state, payload, event) => {
      const invoice = findInvoice(state, payload);
      if (!invoice) throw new Error("CRM_PAYMENT_INVOICE_NOT_FOUND");
      return payments.record(state, invoice, {
        ...payload,
        idempotencyKey: event.id,
      });
    },
    "payment.failed": (state, payload) => {
      const invoice = findInvoice(state, payload);
      if (!invoice) throw new Error("CRM_PAYMENT_INVOICE_NOT_FOUND");
      return {
        ...state,
        invoices: state.invoices.map((entry) =>
          entry.id === invoice.id
            ? { ...entry, paymentFailure: payload.reason || "failed" }
            : entry,
        ),
      };
    },
    "production.created": (state, payload) => {
      const quote = findQuote(state, payload);
      if (!quote) throw new Error("CRM_PRODUCTION_QUOTE_NOT_FOUND");
      return production.advance(state, quote, { user: "site-integration" });
    },
    "production.updated": (state, payload) => {
      const quote = findQuote(state, payload);
      if (!quote) throw new Error("CRM_PRODUCTION_QUOTE_NOT_FOUND");
      return workshop.changeStatus(state, quote, payload.status, {
        user: "site-integration",
      });
    },
  };

  return new CRMEventApplicationService({ repository, handlers, logger });
}

export async function processIntegrationEvent(
  repository,
  event,
  logger = null,
) {
  await repository.initialize();
  const previousState = repository.read();
  const service = createIntegrationApplication(repository, logger);
  const result = await service.handle(event);
  await repository.persist(previousState, result.state);
  return result;
}
