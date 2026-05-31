import { getSupabase, hasSupabaseAuthSession, isSupabaseConfigured } from "../supabase.js";

const BUCKET = "ac-creation-attachments";

function sanitizeName(name) {
  return String(name || "fichier")
    .replace(/[^\w.\-() ]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
}

function buildPath(clientId, fileName) {
  const stamp  = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  return `clients/${clientId}/${stamp}-${random}-${sanitizeName(fileName)}`;
}

export async function uploadClientFile(file, { clientId }) {
  if (!clientId) throw new Error("clientId requis.");

  const supabase    = await getSupabase();
  const storagePath = buildPath(clientId, file.name);
  const contentType = file.type || "application/octet-stream";

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, { contentType, cacheControl: "3600", upsert: false });

  if (error) {
    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("row-level security") || msg.includes("42501")) {
      throw new Error("Permission refusée. Connecte-toi avec un compte actif.");
    }
    if (msg.includes("bucket") && msg.includes("not found")) {
      throw new Error("Bucket « ac-creation-attachments » absent dans Supabase Storage.");
    }
    throw new Error(error.message || "Erreur lors de l'upload.");
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
  return { url: data?.publicUrl || "", storagePath };
}

export async function deleteClientFile(storagePath) {
  if (!storagePath) return;
  const supabase = await getSupabase();
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

export async function canUploadClientFiles() {
  if (!isSupabaseConfigured) return false;
  try { return await hasSupabaseAuthSession(); }
  catch { return false; }
}
