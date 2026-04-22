/**
 * Read API keys from Supabase site_settings (`api_keys` row, admin-configured)
 * or environment variables. Env wins over DB if both present.
 */
import { getSupabaseService } from "./admin_auth.mjs";

let cached = null;
let cachedAt = 0;
let gbCached = null;
let gbCachedAt = 0;
const TTL_MS = 30_000;

export async function getOpenAIKey() {
  const envKey = (process.env.OPENAI_API_KEY || "").trim();
  if (envKey) return envKey;

  if (cached && Date.now() - cachedAt < TTL_MS) return cached;

  try {
    const sb = getSupabaseService();
    const { data } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "api_keys")
      .maybeSingle();
    const val = data?.value;
    const key = val && typeof val === "object" ? String(val.openai_api_key || "").trim() : "";
    if (key) {
      cached = key;
      cachedAt = Date.now();
      return key;
    }
  } catch {
    /* fall through */
  }
  return "";
}

/** Givebutter Contacts API (newsletter popup). Env GIVEBUTTER_API_KEY overrides DB. */
export async function getGivebutterApiKey() {
  const envKey = (process.env.GIVEBUTTER_API_KEY || "").trim();
  if (envKey) return envKey;

  if (gbCached && Date.now() - gbCachedAt < TTL_MS) return gbCached;

  try {
    const sb = getSupabaseService();
    const { data } = await sb.from("site_settings").select("value").eq("key", "api_keys").maybeSingle();
    const val = data?.value;
    const key = val && typeof val === "object" ? String(val.givebutter_api_key || "").trim() : "";
    if (key) {
      gbCached = key;
      gbCachedAt = Date.now();
      return key;
    }
  } catch {
    /* fall through */
  }
  return "";
}

export function getOpenAIModel() {
  return (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
}
