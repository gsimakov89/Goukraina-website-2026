import { getSupabaseService } from "./admin_auth.ts";

let cached: string | null = null;
let cachedAt = 0;
let gbCached: string | null = null;
let gbCachedAt = 0;
const TTL_MS = 30_000;

export async function getOpenAIKey(): Promise<string> {
  const envKey = (Deno.env.get("OPENAI_API_KEY") || "").trim();
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
    const key = val && typeof val === "object"
      ? String((val as Record<string, unknown>).openai_api_key || "").trim()
      : "";
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

export async function getGivebutterApiKey(): Promise<string> {
  const envKey = (Deno.env.get("GIVEBUTTER_API_KEY") || "").trim();
  if (envKey) return envKey;

  if (gbCached && Date.now() - gbCachedAt < TTL_MS) return gbCached;

  try {
    const sb = getSupabaseService();
    const { data } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "api_keys")
      .maybeSingle();
    const val = data?.value;
    const key = val && typeof val === "object"
      ? String((val as Record<string, unknown>).givebutter_api_key || "").trim()
      : "";
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

export function getOpenAIModel(): string {
  return (Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini").trim();
}
