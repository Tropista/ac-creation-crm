import {
  recordInvoicePayment,
  upsertHistoricalInvoicePayment,
} from "../utils/payments.js";

export class PaymentApplicationService {
  record(state, invoice, payment) {
    const idempotencyKey = payment.idempotencyKey || "";
    const existing = idempotencyKey
      ? (state.payments || []).find(
          (entry) => entry.idempotencyKey === idempotencyKey,
        )
      : null;
    if (existing)
      return { ...state, payment: existing, invoice, skipped: true };
    const nextState = recordInvoicePayment(state, invoice, payment);
    if (!idempotencyKey) return nextState;
    const storedPayment = { ...nextState.payment, idempotencyKey };
    return {
      ...nextState,
      payments: nextState.payments.map((entry) =>
        entry.id === storedPayment.id ? storedPayment : entry,
      ),
      payment: storedPayment,
    };
  }

  upsertHistorical(state, invoice, payment) {
    return upsertHistoricalInvoicePayment(state, invoice, payment);
  }
}

export const paymentApplicationService = new PaymentApplicationService();
