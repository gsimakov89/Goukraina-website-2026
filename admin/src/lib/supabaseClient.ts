import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { apiUrl } from "./api";

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient | null {
  return client;
}

export async function initSupabase(): Promise<SupabaseClient> {
  const r = await fetch(apiUrl("/api/supabase-public-config"));
  const cfg = (await r.json()) as { configured?: boolean; url?: string; anonKey?: string };
  if (!cfg.configured || !cfg.url || !cfg.anonKey) {
    throw new Error("Supabase public config missing. Set SUPABASE_URL and SUPABASE_ANON_KEY on the server.");
  }
  client = createClient(cfg.url, cfg.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      storageKey: "goukraina-admin-auth",
    },
  });
  return client;
}
