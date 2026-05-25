export const QUOTE_ATTACHMENT_MAX_BASE64_BYTES = 500 * 1024;

export function isBase64DataUrl(value) {
  return /^data:[^;]+;base64,/i.test(String(value || "").trim());
}

export function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || "").trim());
}

export function getBase64ByteSize(dataUrl) {
  if (!isBase64DataUrl(dataUrl)) return 0;
  const base64 = String(dataUrl).split(",")[1] || "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

export function isLargeBase64Attachment(
  value,
  maxBytes = QUOTE_ATTACHMENT_MAX_BASE64_BYTES
) {
  return isBase64DataUrl(value) && getBase64ByteSize(value) > maxBytes;
}

export function isPreviewableAttachment(attachment) {
  const mime = String(attachment?.mimeType || "").toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(attachment?.name || "").toLowerCase();
  return /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(name);
}

export function sanitizeQuoteAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return attachment;

  const url = String(attachment.url || "").trim();
  if (!url) return { ...attachment, url: "" };

  if (isHttpUrl(url)) return { ...attachment, url };

  if (isBase64DataUrl(url) && isLargeBase64Attachment(url)) {
    return { ...attachment, url: "" };
  }

  return { ...attachment, url };
}

export function sanitizeQuoteAttachmentsForPersistence(attachments = []) {
  return (attachments || [])
    .map(sanitizeQuoteAttachment)
    .filter((attachment) => attachment?.url || attachment?.storagePath);
}

export function sanitizeQuoteForPersistence(quote) {
  if (!quote || typeof quote !== "object") return quote;

  const attachments = sanitizeQuoteAttachmentsForPersistence(quote.attachments);
  const currentAttachments = quote.attachments || [];

  if (
    attachments.length === currentAttachments.length &&
    attachments.every((entry, index) => entry.url === currentAttachments[index]?.url)
  ) {
    return quote;
  }

  return {
    ...quote,
    attachments,
  };
}

export function sanitizeQuotesForPersistence(quotes = []) {
  return (quotes || []).map((quote) => sanitizeQuoteForPersistence(quote));
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Fichier impossible à lire."));
    reader.readAsDataURL(file);
  });
}
