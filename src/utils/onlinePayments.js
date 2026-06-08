import { getInvoiceRemaining } from "./invoices";

export const ONLINE_PAYMENT_PROVIDERS = ["manual", "stripe", "mollie", "payconiq"];

export function normalizePaymentProvider(value) {
  return ONLINE_PAYMENT_PROVIDERS.includes(value) ? value : "manual";
}

function encode(value) {
  return encodeURIComponent(String(value ?? ""));
}

export function buildInvoicePaymentVariables(invoice = {}, client = {}) {
  const remaining = getInvoiceRemaining(invoice);
  const amount = remaining > 0 ? remaining : Number(invoice.totalTTC || 0);
  const roundedAmount = Math.round(amount * 100) / 100;

  return {
    id: invoice.id || "",
    number: invoice.number || "",
    amount: roundedAmount.toFixed(2),
    amountCents: String(Math.round(roundedAmount * 100)),
    clientId: invoice.clientId || "",
    clientName: client.name || invoice.clientName || "",
    clientEmail: client.email || "",
    dueDate: invoice.dueDate || "",
  };
}

export function interpolatePaymentUrlTemplate(template = "", invoice = {}, client = {}) {
  const source = String(template || "").trim();
  if (!source) return "";

  const variables = buildInvoicePaymentVariables(invoice, client);
  return source.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? encode(variables[key])
      : match
  );
}

export function getInvoicePaymentLink(invoice = {}, settings = {}, client = {}) {
  const direct = String(invoice.paymentLink || invoice.onlinePaymentUrl || "").trim();
  if (direct) return direct;
  if (settings.onlinePaymentEnabled === false) return "";

  return interpolatePaymentUrlTemplate(settings.onlinePaymentUrlTemplate, invoice, client);
}

export function applyInvoicePaymentLink(invoice = {}, settings = {}, client = {}) {
  const paymentLink = getInvoicePaymentLink(invoice, settings, client);
  return paymentLink ? { ...invoice, paymentLink } : invoice;
}

