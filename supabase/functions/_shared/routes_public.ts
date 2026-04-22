import { getSupabaseService } from "./admin_auth.ts";
import { json, readJsonBody } from "./http.ts";
import { getGivebutterApiKey } from "./openai_key.ts";
import {
  createGivebutterContact,
  givebutterLooksLikeDuplicate,
  isValidEmail,
  normalizeEmail,
} from "./newsletter_givebutter.ts";

const SUPABASE_PROJECT_URL_DEFAULT = "https://lrbrvkhddhuebmyazgcf.supabase.co";

const SETUP_HINT =
  "Set SUPABASE_URL and SUPABASE_ANON_KEY on this Edge Function (site-api) secrets, or use same-origin /api on Vercel without VITE_SUPABASE_FUNCTIONS_URL.";

export async function handleSupabasePublicConfig(_req: Request): Promise<Response> {
  const url = (Deno.env.get("SUPABASE_URL") || "").trim() || SUPABASE_PROJECT_URL_DEFAULT;
  const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") || "").trim();
  const fromSb = Boolean((Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim());
  const configured = Boolean(url && anonKey);
  return json({
    configured,
    url,
    anonKey: configured ? anonKey : "",
    blogPostsSource: fromSb ? "supabase" : "json",
    ...(configured ? {} : { setupHint: SETUP_HINT }),
  });
}

const RATE: Map<string, { count: number; window: number }> = new Map();

function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function parseExtraTagsFromSettings(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const raw = String((value as Record<string, unknown>).contact_tags ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function handleNewsletterSubscribe(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const entry = RATE.get(ip) || { count: 0, window: now };
  if (now - entry.window > 60000) {
    entry.count = 0;
    entry.window = now;
  }
  entry.count++;
  RATE.set(ip, entry);
  if (entry.count > 3) {
    return json({ error: "Too many requests. Please try again later." }, 429);
  }

  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req)) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const email = normalizeEmail(String(body.email || ""));
  const name = String(body.name || "").trim().slice(0, 100);
  const source = String(body.source || "website_popup").trim().slice(0, 50);

  if (!email || !isValidEmail(email)) {
    return json({ error: "Valid email address required." }, 400);
  }

  const apiKey = (await getGivebutterApiKey()).trim();
  if (!apiKey) {
    console.warn("newsletter/subscribe: Givebutter API key not configured (Admin → Integrations or GIVEBUTTER_API_KEY)");
    return json({ ok: true, message: "Subscribed successfully! Thank you." });
  }

  try {
    const sb = getSupabaseService();
    const { data: settingsRow } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "newsletter_popup")
      .maybeSingle();
    const extraTags = parseExtraTagsFromSettings(settingsRow?.value);

    const { error: insErr } = await sb.from("newsletter_signups").insert({ email, source });

    if (insErr?.code === "23505") {
      return json({
        ok: true,
        duplicate: true,
        message: "You're already on our list. Thank you!",
      });
    }
    if (insErr) {
      console.error("newsletter_signups insert:", insErr.message);
      return json({ error: "Could not save signup. Please try again." }, 500);
    }

    const displayName = name || email.split("@")[0];
    const gb = await createGivebutterContact(apiKey, { email, name: displayName, source, extraTags });

    if (gb.ok || givebutterLooksLikeDuplicate(gb)) {
      return json({ ok: true, message: "Subscribed successfully! Thank you for joining us." });
    }

    await sb.from("newsletter_signups").delete().eq("email", email);
    console.error("Givebutter contact error:", gb.status, (gb.text || "").slice(0, 300));
    return json({ ok: false, error: "Could not complete signup. Please try again in a moment." }, 502);
  } catch (e) {
    console.error("newsletter/subscribe:", (e as Error).message);
    return json({ ok: false, error: "Something went wrong. Please try again." }, 500);
  }
}
