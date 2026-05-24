import { getSupabase, hasSupabaseAuthSession, isSupabaseConfigured } from "../supabase.js";
import { compressProductImageFile } from "../utils/productImages.js";

export const PRODUCT_IMAGES_BUCKET = "ac-creation-products";

export function formatProductImageUploadError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || error || "").toLowerCase();

  if (
    code === "42501" ||
    message.includes("row-level security") ||
    message.includes("security policy")
  ) {
    return (
      "Import refusé (sécurité Supabase Storage). Connecte-toi avec un compte Actif " +
      "dans Utilisateurs, puis exécute la migration Storage dans le SQL Editor Supabase " +
      "(voir docs/SUPABASE.md, section Images produits)."
    );
  }

  if (message.includes("bucket") && (message.includes("not found") || message.includes("introuvable"))) {
    return (
      "Bucket « ac-creation-products » absent. Exécutez la migration Storage " +
      "(supabase/migrations/20260524120000_product_images_storage.sql ou docs/SUPABASE.md)."
    );
  }

  const raw = String(error?.message || error || "").trim();
  return raw || "Erreur pendant l'import de l'image.";
}

function buildStoragePath(productId) {
  const prefix = productId ? String(productId) : "draft";
  const stamp = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `${prefix}/${stamp}-${random}.jpg`;
}

export function getProductImagePublicUrl(supabase, storagePath) {
  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(storagePath);
  return data?.publicUrl || "";
}

export async function uploadProductImageBlob(blob, { productId } = {}) {
  const supabase = await getSupabase();
  const storagePath = buildStoragePath(productId);

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(formatProductImageUploadError(error));
  }

  const publicUrl = getProductImagePublicUrl(supabase, storagePath);
  if (!publicUrl) {
    throw new Error("URL publique introuvable après l'upload.");
  }

  return publicUrl;
}

export async function canUploadProductImages() {
  if (!isSupabaseConfigured) return false;
  try {
    return await hasSupabaseAuthSession();
  } catch {
    return false;
  }
}

export async function uploadProductImageFile(file, { productId } = {}) {
  const blob = await compressProductImageFile(file);
  return uploadProductImageBlob(blob, { productId });
}
