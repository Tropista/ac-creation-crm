export const QUOTE_ATTACHMENT_MAX_BASE64_BYTES = 500 * 1024;

export function isBlobUrl(value) {
  return /^blob:/i.test(String(value || "").trim());
}

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

  if (isBlobUrl(url)) return { ...attachment, url };

  if (isBase64DataUrl(url) && isLargeBase64Attachment(url)) {
    return { ...attachment, url: "" };
  }

  return { ...attachment, url };
}

export function sanitizeQuoteAttachmentsForPersistence(attachments = []) {
  return (attachments || [])
    .map(sanitizeQuoteAttachment)
    .filter(
      (attachment) =>
        attachment?.url || attachment?.storagePath || attachment?.localBlobId
    );
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

export function getAttachmentSyncStatus(attachment) {
  if (!attachment) return "missing";
  const url = String(attachment.url || "").trim();
  const storagePath = String(attachment.storagePath || "").trim();
  const localBlobId = String(attachment.localBlobId || "").trim();

  if (url && /^https?:\/\//i.test(url)) {
    return storagePath ? "cloud" : "cloud";
  }
  if (isBlobUrl(url)) return localBlobId ? "local-idb" : "local";
  if (isBase64DataUrl(url)) return "local";
  if (localBlobId) return "local-idb";
  if (storagePath) return "pending";
  if (!url && !storagePath) return "missing";
  return "local";
}

export function getAttachmentSyncLabel(status) {
  if (status === "cloud") return "Synchronisé (cloud)";
  if (status === "local-idb") return "Local (fichier volumineux)";
  if (status === "local") return "Local uniquement";
  if (status === "pending") return "Cloud — rechargement…";
  return "Indisponible sur cet appareil";
}

export function hydrateQuoteAttachment(attachment) {
  if (!attachment || typeof attachment !== "object") return attachment;
  const url = String(attachment.url || "").trim();
  if (url && (isHttpUrl(url) || isBase64DataUrl(url) || isBlobUrl(url))) {
    return { ...attachment, syncStatus: getAttachmentSyncStatus(attachment) };
  }

  const storagePath = String(attachment.storagePath || "").trim();
  if (storagePath) {
    const publicUrl = buildQuoteAttachmentPublicUrlFromPath(storagePath);
    return {
      ...attachment,
      url: publicUrl || "",
      syncStatus: publicUrl ? "cloud" : "pending",
    };
  }

  if (attachment.localBlobId) {
    return { ...attachment, syncStatus: getAttachmentSyncStatus(attachment) };
  }

  return { ...attachment, syncStatus: getAttachmentSyncStatus(attachment) };
}

export async function hydrateQuoteAttachmentsAsync(attachments = []) {
  const { readLocalQuoteAttachmentBlob } = await import("./quoteAttachmentLocalStore.js");

  return Promise.all(
    (attachments || []).map(async (attachment) => {
      const hydrated = hydrateQuoteAttachment(attachment);
      const localBlobId = String(hydrated?.localBlobId || "").trim();
      const url = String(hydrated?.url || "").trim();

      if (localBlobId && (!url || !isBlobUrl(url))) {
        try {
          const blob = await readLocalQuoteAttachmentBlob(localBlobId);
          if (blob) {
            return {
              ...hydrated,
              url: URL.createObjectURL(blob),
              syncStatus: "local-idb",
            };
          }
        } catch {
          // fallback to pending/missing below
        }
      }

      return hydrated;
    })
  );
}

export function hydrateQuoteAttachments(attachments = []) {
  return (attachments || []).map(hydrateQuoteAttachment);
}

export function countUnavailableAttachments(attachments = []) {
  return hydrateQuoteAttachments(attachments).filter(
    (entry) => !entry.url && entry.storagePath
  ).length;
}

function buildQuoteAttachmentPublicUrlFromPath(storagePath) {
  const env = import.meta.env ?? {};
  const base = env.VITE_SUPABASE_URL;
  if (!base || !storagePath) return "";
  return `${base}/storage/v1/object/public/ac-creation-attachments/${storagePath}`;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Fichier impossible à lire."));
    reader.readAsDataURL(file);
  });
}
