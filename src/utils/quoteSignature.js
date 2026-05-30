export const SIGNATURE_MODES = ["drawn", "typed"];

export function normalizeQuoteSignature(quote = {}) {
  const signature = quote.signature || {};
  return {
    mode: SIGNATURE_MODES.includes(signature.mode) ? signature.mode : "",
    dataUrl: signature.dataUrl || "",
    typedName: signature.typedName || "",
    clientEmail: signature.clientEmail || quote.clientEmail || "",
    acceptedAt: signature.acceptedAt || quote.acceptedAt || "",
    acceptedVia: signature.acceptedVia || quote.acceptedVia || "",
    proof: signature.proof || "",
    autoAccepted: Boolean(signature.autoAccepted || quote.autoAccepted),
  };
}

export function isQuoteSigned(quote = {}) {
  const signature = normalizeQuoteSignature(quote);
  if (String(quote.status || "").trim() === "Accepté") return true;
  return Boolean(
    signature.acceptedAt &&
      (signature.dataUrl || signature.typedName || signature.autoAccepted)
  );
}

export function buildSignatureProof(quote, { mode, dataUrl, typedName, clientEmail } = {}) {
  const timestamp = new Date().toISOString();
  const payload = {
    quoteId: quote.id,
    quoteNumber: quote.number,
    clientEmail: clientEmail || quote.clientEmail || "",
    mode,
    typedName: typedName || "",
    acceptedAt: timestamp,
    hash: simpleHash(`${quote.id}:${timestamp}:${typedName || dataUrl?.slice(0, 32) || ""}`),
  };

  return {
    proof: JSON.stringify(payload),
    acceptedAt: timestamp,
  };
}

function simpleHash(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return `sig-${Math.abs(hash).toString(36)}`;
}

export function acceptQuoteWithSignature(
  quote,
  { mode, dataUrl = "", typedName = "", clientEmail = "", autoAccepted = false } = {}
) {
  const { proof, acceptedAt } = buildSignatureProof(quote, {
    mode,
    dataUrl,
    typedName,
    clientEmail,
  });

  return {
    ...quote,
    status: "Accepté",
    acceptedAt,
    acceptedVia: autoAccepted ? "auto" : mode === "drawn" ? "signature-drawn" : "signature-typed",
    autoAccepted,
    clientEmail: clientEmail || quote.clientEmail,
    signature: {
      mode,
      dataUrl,
      typedName,
      clientEmail: clientEmail || quote.clientEmail || "",
      acceptedAt,
      acceptedVia: autoAccepted ? "auto" : mode,
      proof,
      autoAccepted,
    },
  };
}

export function getSignatureDisplayLabel(quote = {}) {
  const signature = normalizeQuoteSignature(quote);
  if (!isQuoteSigned(quote)) return "";
  if (signature.autoAccepted) return "Acceptation automatique";
  if (signature.mode === "drawn") return "Signature manuscrite";
  if (signature.mode === "typed") return `Signé : ${signature.typedName}`;
  return "Accepté";
}
