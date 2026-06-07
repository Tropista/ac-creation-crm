// Règles de validation partagées pour les formulaires (Clients, Fournisseurs, Produits…).
// Objectif : centraliser les messages d'erreur et les contrôles répétés (champ requis,
// nombre positif…) plutôt que de les dupliquer dans chaque composant.

export function isRequired(value) {
  return String(value ?? "").trim() !== "";
}

export function isValidEmail(value) {
  const email = String(value ?? "").trim();
  return email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Les formulaires acceptent la virgule comme séparateur décimal (saisie FR).
export function parseLocaleNumber(value) {
  return Number(String(value ?? "").trim().replace(",", "."));
}

export function isNonNegativeNumber(value) {
  const number = parseLocaleNumber(value);
  return Number.isFinite(number) && number >= 0;
}

export function isPositiveNumber(value) {
  const number = parseLocaleNumber(value);
  return Number.isFinite(number) && number > 0;
}

// Renvoie le premier message d'erreur trouvé (rules: { champ: [{ test, message }] }), ou null.
export function validateFields(values, rules) {
  for (const [field, checks] of Object.entries(rules)) {
    for (const { test, message } of checks) {
      if (!test(values[field], values)) return message;
    }
  }
  return null;
}
