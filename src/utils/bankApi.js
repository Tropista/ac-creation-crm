const DEFAULT_BANK_API_URL = "http://localhost:3001";

export function getBankApiUrl() {
  return import.meta.env.VITE_BANK_API_URL || DEFAULT_BANK_API_URL;
}

export async function fetchBankStatus() {
  const response = await fetch(`${getBankApiUrl()}/api/bank/status`);
  if (!response.ok) {
    throw new Error("API banque indisponible");
  }
  return response.json();
}

export async function fetchBankLinkUrl() {
  const response = await fetch(`${getBankApiUrl()}/api/bank/link`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Impossible d'obtenir le lien Tink");
  }
  return payload;
}

export async function disconnectBank() {
  const response = await fetch(`${getBankApiUrl()}/api/bank/disconnect`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Déconnexion impossible");
  }
  return response.json();
}

export async function fetchTinkTransactions(limit = 50) {
  const response = await fetch(
    `${getBankApiUrl()}/api/bank/transactions?limit=${limit}`
  );
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Synchronisation Tink impossible");
  }
  return payload.transactions || [];
}
