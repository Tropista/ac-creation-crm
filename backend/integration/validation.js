export const SUPPORTED_EVENT_TYPES = new Set([
  "customer.created",
  "customer.updated",
  "order.created",
  "order.updated",
  "payment.completed",
  "payment.failed",
  "production.created",
  "production.updated",
]);

function invalid(code, details = {}) {
  throw Object.assign(new Error(code), { status: 400, details });
}

export function validateEventEnvelope(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("CRM_EVENT_BODY_INVALID");
  }
  if (value.version !== "1.0") invalid("CRM_EVENT_VERSION_UNSUPPORTED");
  if (!value.id || typeof value.id !== "string")
    invalid("CRM_EVENT_ID_REQUIRED");
  if (!SUPPORTED_EVENT_TYPES.has(value.type))
    invalid("CRM_EVENT_TYPE_UNSUPPORTED");
  if (!value.occurredAt || Number.isNaN(Date.parse(value.occurredAt))) {
    invalid("CRM_EVENT_OCCURRED_AT_INVALID");
  }
  if (
    !value.payload ||
    typeof value.payload !== "object" ||
    Array.isArray(value.payload)
  ) {
    invalid("CRM_EVENT_PAYLOAD_INVALID");
  }
  return value;
}

export function validateAck(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    invalid("CRM_ACK_BODY_INVALID");
  }
  if (value.version !== "1.0") invalid("CRM_ACK_VERSION_UNSUPPORTED");
  if (!value.eventId || typeof value.eventId !== "string") {
    invalid("CRM_ACK_EVENT_ID_REQUIRED");
  }
  if (!value.receivedAt || Number.isNaN(Date.parse(value.receivedAt))) {
    invalid("CRM_ACK_RECEIVED_AT_INVALID");
  }
  return value;
}
