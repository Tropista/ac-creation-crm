export const LUXEMBOURG_VAT_RATES = [0, 3, 8, 14, 17];

export const VAT_RATE_CUSTOM = "__custom__";

export function roundMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

export function parseExpenseNumber(value) {
  if (value === "" || value == null) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export function computeVatFromHtAndRate(amountHT, vatRate) {
  const ht = parseExpenseNumber(amountHT);
  const rate = parseExpenseNumber(vatRate);
  if (ht == null || rate == null) return null;

  const vatAmount = roundMoney((ht * rate) / 100);
  const totalTTC = roundMoney(ht + vatAmount);
  return { vatAmount, totalTTC };
}

export function computeTotalFromHtAndVat(amountHT, vatAmount) {
  const ht = parseExpenseNumber(amountHT);
  const vat = parseExpenseNumber(vatAmount);
  if (ht == null || vat == null) return null;
  return roundMoney(ht + vat);
}

export function isPresetVatRate(vatRate, presets = LUXEMBOURG_VAT_RATES) {
  if (vatRate === "" || vatRate == null) return false;
  return presets.some((rate) => String(rate) === String(vatRate));
}

export function resolveVatRateSelectValue(
  vatRate,
  { customMode = false, presets = LUXEMBOURG_VAT_RATES } = {}
) {
  if (customMode) return VAT_RATE_CUSTOM;
  if (vatRate === "" || vatRate == null) return "";
  if (isPresetVatRate(vatRate, presets)) return String(vatRate);
  return VAT_RATE_CUSTOM;
}

export function formatExpenseAmountField(value) {
  if (value === "" || value == null) return "";
  return String(value);
}
