const env = import.meta.env ?? {};
const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

let clientPromise = null;
let clientInstance = null;

export async function getSupabase() {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase non configuré");
  }

  if (clientInstance) {
    return clientInstance;
  }

  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js")
      .then(({ createClient }) => {
        clientInstance = createClient(supabaseUrl, supabaseKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        return clientInstance;
      })
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }

  return clientPromise;
}

export async function getSupabaseAuthSession() {
  const supabase = await getSupabase();
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return session;
}

export async function hasSupabaseAuthSession() {
  try {
    const session = await getSupabaseAuthSession();
    return Boolean(session?.user);
  } catch {
    return false;
  }
}
