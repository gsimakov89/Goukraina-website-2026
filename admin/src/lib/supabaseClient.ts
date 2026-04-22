import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { apiUrl } from "./api";

let client: SupabaseClient | null = null;

export function getClient(): SupabaseClient | null {
  return client;
}

type PublicCfg = {
  configured?: boolean;
  url?: string;
  anonKey?: string;
  setupHint?: string;
  error?: string;
};

export async function initSupabase(): Promise<SupabaseClient> {
  const url = apiUrl("/api/supabase-public-config");
  const r = await fetch(url);
  const raw = await r.text();
  let cfg: PublicCfg;
  try {
    cfg = raw ? (JSON.parse(raw) as PublicCfg) : {};
  } catch {
    throw new Error(
      `Supabase config response was not JSON (${r.status}). Check that /api/supabase-public-config is deployed and reachable.`,
    );
  }
  if (!r.ok) {
    throw new Error(cfg.error || `Supabase config HTTP ${r.status}. ${raw.slice(0, 240)}`);
  }
  if (!cfg.configured || !cfg.url || !cfg.anonKey) {
    throw new Error(
      cfg.setupHint ||
        "Supabase is not configured for this deploy: set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel → Environment Variables, then redeploy. If you build the admin with VITE_SUPABASE_FUNCTIONS_URL, set the same variables on the Supabase Edge Function (site-api) secrets.",
    );
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
