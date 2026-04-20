/**
 * Read the OpenAI API key from either Supabase site_settings (admin-configured)
 * or the OPENAI_API_KEY env var (fallback). Env wins over DB if both present.
 */
import { getSupabaseService } from "./admin_auth.mjs";

let cached = null;
let cachedAt = 0;
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

export function getOpenAIModel() {
  return (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
}
