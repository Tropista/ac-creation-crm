import { CustomerApplicationService } from "../../src/application/CustomerApplicationService.js";
import { InvoiceApplicationService } from "../../src/application/InvoiceApplicationService.js";
import { OrderApplicationService } from "../../src/application/OrderApplicationService.js";
import { PaymentApplicationService } from "../../src/application/PaymentApplicationService.js";
import { ProductionApplicationService } from "../../src/application/ProductionApplicationService.js";
import { CRMEventApplicationService } from "../../src/application/CRMEventApplicationService.js";
import { WorkshopApplicationService } from "../../src/application/WorkshopApplicationService.js";
import { SITE_REQUEST_STATUS } from "../../src/application/SiteRequestApplicationService.js";

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

function orderToQuote(payload, customerId) {
  const totals = payload.totals || {};
  return {
    id: payload.id,
    number: payload.number,
    clientId: customerId,
    date: payload.createdAt,
    status: "Accepté",
    description: `Commande e-commerce ${payload.number || payload.id}`,
    lines: (payload.items || []).map((item) => ({
      id: item.id,
      description: item.name,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unitPrice || 0),
      total: Number(item.total || 0),
      productId: item.productId,
      technique: item.snapshot?.productionProfile?.technique || "",
      snapshot: item.snapshot,
    })),
    totalHT: Number(totals.subtotal || 0),
    totalTVA: Number(totals.vat || 0),
    totalTTC: Number(totals.total || 0),
    shipping: Number(totals.shipping || 0),
    discount: Number(totals.discount || 0),
    currency: totals.currency || "EUR",
    billingAddress: payload.billingAddress,
    shippingAddress: payload.shippingAddress,
    ecommerce: {
      source: "ecommerce",
      externalOrderId: payload.id,
      siteOrderNumber: payload.number,
      receivedAt: payload.createdAt || new Date().toISOString(),
      paymentStatus: payload.payment?.status || "pending",
      reviewStatus: SITE_REQUEST_STATUS.NEW,
      openedAt: null,
      openedBy: null,
      approvedAt: null,
      approvedBy: null,
      sentToWorkshopAt: null,
      sentToWorkshopBy: null,
      sourceOrderId: payload.id,
      snapshot: payload.snapshot,
      preview: payload.preview || payload.snapshot?.preview || null,
      assets: payload.assets || [],
      fonts: payload.fonts || [],
      resources: payload.resources || [],
      production: payload.production || [],
      productionJobs: payload.productionJobs || [],
      resourceValidation: payload.resourceValidation || {
        complete: false,
        errors: ["Validation binaire non recue"],
      },
      history: [
        {
          id: `${payload.id}:received`,
          at: payload.createdAt || new Date().toISOString(),
          actor: "site-integration",
          action: "received",
          comment: "Commande e-commerce recue pour controle",
          previousStatus: null,
          nextStatus: SITE_REQUEST_STATUS.NEW,
          correlationId: payload.id,
          externalOrderId: payload.id,
        },
      ],
    },
  };
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
      const rawCustomer = payload.customer || {};
      const customerPayload = {
        ...rawCustomer,
        name:
          rawCustomer.name ||
          [rawCustomer.firstName, rawCustomer.lastName]
            .filter(Boolean)
            .join(" "),
        city:
          payload.billingAddress?.city || payload.shippingAddress?.city || "",
        country:
          payload.billingAddress?.countryCode ||
          payload.shippingAddress?.countryCode ||
          "",
      };
      const customerId = customerPayload.id || payload.customerId;
      const quote = orderToQuote(payload, customerId);
      let nextState = orderService.apply(state, {
        id: payload.id || event.id,
        customer: customerPayload,
        quote,
        convertQuoteId: quote.id,
      });
      const invoice = findInvoice(nextState, {
        invoiceNumber: nextState.invoices?.find(
          (entry) => String(entry.convertedFrom) === String(quote.number),
        )?.number,
      });
      if (payload.payment?.status === "paid") {
        nextState = payments.record(nextState, invoice, {
          amount: Number(payload.payment.amount || quote.totalTTC),
          method: payload.payment.provider || "E-commerce",
          reference: payload.payment.providerReference || "",
          date: payload.payment.paidAt,
          idempotencyKey: `site-payment:${payload.payment.id || payload.payment.providerReference || payload.id}`,
        });
      }
      return {
        ...nextState,
        integrationResult: {
          customerId,
          orderId: quote.id,
          invoiceId: invoice?.id,
          reviewStatus: "received_for_review",
        },
      };
    },
    "order.updated": (state, payload) => {
      const quote = findQuote(state, payload);
      if (!quote) throw new Error("CRM_ORDER_NOT_FOUND");
      return workshop.patchQuote(state, quote.id, payload.quote || payload);
    },
    "payment.completed": (state, payload, event) => {
      if (payload.items && payload.customer) {
        return handlers["order.created"](state, payload, event);
      }
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
      if (payload.items && payload.customer) {
        return handlers["order.created"](state, payload, {
          id: payload.id,
        });
      }
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
  event = repository.ingestEventResources
    ? await repository.ingestEventResources(event)
    : event;
  const previousState = repository.read();
  const service = createIntegrationApplication(repository, logger);
  const result = await service.handle(event);
  await repository.persist(previousState, result.state);
  return result;
}
