import { describe, expect, it } from "vitest";
import { createCrmStateRepository } from "../../src/repositories/crmStateRepository";
import { createIntegrationApplication } from "./application";

const initialState = () => ({
  clients: [],
  quotes: [],
  invoices: [],
  payments: [],
  products: [],
  deliveryNotes: [],
  settings: { paymentDays: 30 },
});

describe("CRM ecommerce integration application", () => {
  it("creates a paid site request without sending it to workshop", async () => {
    const repository = createCrmStateRepository(initialState());
    const service = createIntegrationApplication(repository);
    const result = await service.handle({
      id: "event-order-1",
      type: "order.created",
      payload: {
        id: "order-1",
        number: "AC-2026-0001",
        createdAt: "2026-08-04T10:00:00.000Z",
        customer: {
          id: "customer-1",
          email: "client@example.com",
          firstName: "Ada",
          lastName: "Lovelace",
        },
        items: [
          {
            id: "item-1",
            productId: "mug-11oz",
            name: "Mug",
            quantity: 1,
            unitPrice: 20,
            total: 20,
            snapshot: { productionProfile: { technique: "sublimation" } },
          },
        ],
        payment: {
          id: "payment-1",
          status: "paid",
          amount: 23.4,
          provider: "stripe",
          providerReference: "pi_test",
        },
        totals: { subtotal: 20, vat: 3.4, total: 23.4, currency: "EUR" },
        assets: [{ storage_path: "orders/order-1/preview.png" }],
        fonts: [{ storage_path: "orders/order-1/font.woff2" }],
        production: [{ technique: "sublimation" }],
      },
    });
    expect(result.state.clients).toHaveLength(1);
    expect(result.state.quotes).toHaveLength(1);
    expect(result.state.invoices).toHaveLength(1);
    expect(result.state.payments).toHaveLength(1);
    expect(result.state.quotes[0].status).toBe("Accepté");
    expect(result.state.quotes[0].ecommerce).toMatchObject({
      source: "ecommerce",
      reviewStatus: "new",
      paymentStatus: "paid",
    });
    expect(result.state.integrationResult).toMatchObject({
      customerId: "customer-1",
      orderId: "order-1",
      reviewStatus: "received_for_review",
    });
  });
});
