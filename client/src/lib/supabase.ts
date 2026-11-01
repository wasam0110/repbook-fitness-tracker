import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PROGRESS_PHOTO_BUCKET = "progress-photos";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

const client: SupabaseClient | null = supabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null;

export function getSupabaseClient(): SupabaseClient {
  if (!client) {
    throw new Error("RepBook is not connected to Supabase yet. Add the Supabase URL and publishable anon key to the deployment environment.");
  }
  return client;
}
