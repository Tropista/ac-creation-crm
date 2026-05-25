import { getSupabase, hasSupabaseAuthSession, isSupabaseConfigured } from "../supabase.js";
import {
  fileToDataUrl,
  isLargeBase64Attachment,
} from "../utils/quoteAttachments.js";

export const QUOTE_ATTACHMENTS_BUCKET = "ac-creation-attachments";

export function isQuoteAttachmentBucketMissingError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("bucket") &&
    (message.includes("not found") ||
      message.includes("introuvable") ||
      message.includes("absent"))
  );
}

export function formatQuoteAttachmentUploadError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "").toLowerCase();

  if (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("security policy")
  ) {
    return (
      "Import refusé (sécurité Supabase Storage). Connecte-toi avec un compte Actif " +
      "dans Utilisateurs, puis exécute la migration Storage pièces jointes " +
      "(voir docs/SUPABASE.md, section Pièces jointes devis)."
    );
  }

  if (isQuoteAttachmentBucketMissingError(error)) {
    return (
      "Bucket « ac-creation-attachments » absent. Exécutez la migration Storage " +
      "(supabase/migrations/20260525120000_quote_attachments_storage.sql ou docs/SUPABASE.md)."
    );
  }

  const raw = String(error?.message || error || "").trim();
  return raw || "Erreur pendant l'import du fichier.";
}

function sanitizeFileName(name) {
  return String(name || "fichier")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function buildStoragePath(quoteId, fileName) {
  const prefix = quoteId ? String(quoteId) : "draft";
  const stamp = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `${prefix}/${stamp}-${random}-${sanitizeFileName(fileName)}`;
}

export function getQuoteAttachmentPublicUrl(supabase, storagePath) {
  const { data } = supabase.storage.from(QUOTE_ATTACHMENTS_BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || "";
}

export async function uploadQuoteAttachmentFile(file, { quoteId } = {}) {
  const supabase = await getSupabase();
  const storagePath = buildStoragePath(quoteId, file?.name);
  const contentType = file?.type || "application/octet-stream";

  const { error } = await supabase.storage
    .from(QUOTE_ATTACHMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(formatQuoteAttachmentUploadError(error));
  }

  const publicUrl = getQuoteAttachmentPublicUrl(supabase, storagePath);
  if (!publicUrl) {
    throw new Error("URL publique introuvable après l'upload.");
  }

  return { url: publicUrl, storagePath };
}

export async function canUploadQuoteAttachments() {
  if (!isSupabaseConfigured) return false;
  try {
    return await hasSupabaseAuthSession();
  } catch {
    return false;
  }
}

export async function uploadQuoteAttachmentFileWithLocalFallback(file, { quoteId } = {}) {
  if (await canUploadQuoteAttachments()) {
    try {
      const uploaded = await uploadQuoteAttachmentFile(file, { quoteId });
      return { ...uploaded, source: "storage" };
    } catch (error) {
      if (!isQuoteAttachmentBucketMissingError(error)) {
        throw error;
      }
    }
  }

  const url = await fileToDataUrl(file);
  if (isLargeBase64Attachment(url)) {
    throw new Error(
      "Fichier trop lourd pour l'enregistrement local. Connecte-toi et configure le bucket Storage " +
        "« ac-creation-attachments » (voir docs/SUPABASE.md)."
    );
  }

  return { url, storagePath: "", source: "local" };
}
