import { uid } from "../utils/documents.js";

function normalizedTaxRate(value) {
  return value === "" || value === "default" || value == null
    ? ""
    : Number(value);
}

export class CustomerApplicationService {
  search(state, term = "") {
    const query = String(term).trim().toLocaleLowerCase("fr");
    if (!query) return state.clients || [];
    return (state.clients || []).filter((customer) =>
      [
        customer.name,
        customer.email,
        customer.phone,
        customer.company,
        customer.vat,
        customer.city,
        customer.country,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("fr")
        .includes(query),
    );
  }

  save(state, input, { customerId = "", idempotencyKey = "" } = {}) {
    const payload = {
      ...input,
      taxRateOverride: normalizedTaxRate(input.taxRateOverride),
    };
    const existing = (state.clients || []).find(
      (customer) =>
        String(customer.id) === String(customerId) ||
        (idempotencyKey && customer.idempotencyKey === idempotencyKey),
    );
    if (existing) {
      const customer = { ...existing, ...payload };
      return {
        ...state,
        clients: (state.clients || []).map((entry) =>
          entry.id === existing.id ? customer : entry,
        ),
        customer,
        created: false,
      };
    }
    const customer = {
      id: customerId || uid(),
      createdAt: new Date().toISOString(),
      ...(idempotencyKey ? { idempotencyKey } : {}),
      ...payload,
    };
    return {
      ...state,
      clients: [...(state.clients || []), customer],
      customer,
      created: true,
    };
  }

  remove(state, customerId) {
    return {
      ...state,
      clients: (state.clients || []).filter(
        (customer) => String(customer.id) !== String(customerId),
      ),
    };
  }
}

export const customerApplicationService = new CustomerApplicationService();
