import crypto from "node:crypto";

export const DEFAULT_SIGNATURE_TTL_MS = 5 * 60 * 1000;

export function signaturePayload(timestamp, nonce, rawBody = "") {
  return `${timestamp}.${nonce}.${rawBody}`;
}

export function createSignature(secret, timestamp, nonce, rawBody = "") {
  return crypto
    .createHmac("sha256", secret)
    .update(signaturePayload(timestamp, nonce, rawBody))
    .digest("hex");
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left), "utf8");
  const rightBuffer = Buffer.from(String(right), "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifyHmacRequest(
  { keyId, timestamp, nonce, signature, rawBody },
  { keys, ttlMs = DEFAULT_SIGNATURE_TTL_MS, now = Date.now() },
) {
  if (!keyId || !timestamp || !nonce || !signature) {
    throw Object.assign(new Error("CRM_AUTH_HEADERS_REQUIRED"), {
      status: 401,
    });
  }
  const secret = keys[keyId];
  if (!secret) {
    throw Object.assign(new Error("CRM_AUTH_KEY_UNKNOWN"), { status: 401 });
  }
  const requestTime = Number(timestamp);
  if (!Number.isFinite(requestTime) || Math.abs(now - requestTime) > ttlMs) {
    throw Object.assign(new Error("CRM_AUTH_TIMESTAMP_EXPIRED"), {
      status: 401,
    });
  }
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(nonce)) {
    throw Object.assign(new Error("CRM_AUTH_NONCE_INVALID"), { status: 401 });
  }
  const expected = createSignature(secret, timestamp, nonce, rawBody);
  if (!safeEqual(expected, signature.toLowerCase())) {
    throw Object.assign(new Error("CRM_AUTH_SIGNATURE_INVALID"), {
      status: 401,
    });
  }
  return { keyId, timestamp: requestTime, nonce };
}
