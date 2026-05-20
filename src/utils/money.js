export function money(value) {
  return Number(
    value || 0
  ).toLocaleString(
    "fr-LU",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  ) + " €";
}