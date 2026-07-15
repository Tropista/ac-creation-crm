export const EU_COUNTRY_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR",
  "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

export const COUNTRY_OPTIONS = [
  { code: "", name: "Pays non renseigne" },
  { code: "LU", name: "Luxembourg" },
  { code: "FR", name: "France" },
  { code: "BE", name: "Belgique" },
  { code: "DE", name: "Allemagne" },
  { code: "NL", name: "Pays-Bas" },
  { code: "PT", name: "Portugal" },
  { code: "ES", name: "Espagne" },
  { code: "IT", name: "Italie" },
  { code: "AT", name: "Autriche" },
  { code: "PL", name: "Pologne" },
  { code: "CZ", name: "Tchequie" },
  { code: "IE", name: "Irlande" },
  { code: "DK", name: "Danemark" },
  { code: "SE", name: "Suede" },
  { code: "FI", name: "Finlande" },
  { code: "US", name: "Etats-Unis" },
  { code: "GB", name: "Royaume-Uni" },
  { code: "CH", name: "Suisse" },
  { code: "CN", name: "Chine" },
];

export function normalizeCountryCode(countryCode) {
  const code = String(countryCode || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

export function isEuCountry(countryCode) {
  const code = normalizeCountryCode(countryCode);
  return code ? EU_COUNTRY_CODES.includes(code) : false;
}

export function getCountryName(countryCode) {
  const code = normalizeCountryCode(countryCode);
  return COUNTRY_OPTIONS.find((country) => country.code === code)?.name || "";
}

export function getVatOriginFromCountry(countryCode) {
  const code = normalizeCountryCode(countryCode);
  if (!code) return null;
  if (code === "LU") return "LU";
  if (isEuCountry(code)) return "EU";
  return "NON_EU";
}
