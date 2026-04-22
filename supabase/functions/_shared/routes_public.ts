import { getSupabaseService } from "./admin_auth.ts";
import { json, readJsonBody } from "./http.ts";

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

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
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

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 100);
  const source = String(body.source || "website_popup").trim().slice(0, 50);

  if (!email || !isValidEmail(email)) {
    return json({ error: "Valid email address required." }, 400);
  }

  let ghlUrl = "";
  try {
    const sb = getSupabaseService();
    const { data } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "newsletter_popup")
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      ghlUrl = String((data.value as Record<string, unknown>).ghl_webhook_url || "").trim();
    }
  } catch {
    ghlUrl = (Deno.env.get("GHL_WEBHOOK_URL") || "").trim();
  }

  if (!ghlUrl) {
    console.warn("newsletter/subscribe: GHL webhook URL not configured");
    return json({ ok: true, message: "Subscribed successfully! Thank you." });
  }

  try {
    const payload = {
      email,
      name: name || email.split("@")[0],
      source,
      tags: ["website-newsletter", "go-ukraina"],
      timestamp: new Date().toISOString(),
    };

    const r = await fetch(ghlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!r.ok) {
      const text = await r.text();
      console.error("GHL webhook error:", r.status, text.slice(0, 200));
      return json({ ok: true, message: "Subscribed successfully! Thank you." });
    }

    return json({ ok: true, message: "Subscribed successfully! Thank you for joining us." });
  } catch (e) {
    console.error("newsletter/subscribe fetch error:", (e as Error).message);
    return json({ ok: true, message: "Subscribed successfully! Thank you." });
  }
}
