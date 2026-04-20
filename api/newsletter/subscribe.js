/**
 * POST /api/newsletter/subscribe — forward subscriber to GoHighLevel (public endpoint)
 * body: { email: string, name?: string, source?: string }
 * Reads GHL webhook URL from site_settings.newsletter_popup.ghl_webhook_url
 */
import { getSupabaseService } from "../_lib/admin_auth.mjs";

const RATE_LIMIT = new Map(); // simple in-memory rate limit (resets per cold start)

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function getClientIp(req) {
  return (
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Simple rate limit: 3 attempts per IP per minute
  const ip = getClientIp(req);
  const now = Date.now();
  const entry = RATE_LIMIT.get(ip) || { count: 0, window: now };
  if (now - entry.window > 60000) { entry.count = 0; entry.window = now; }
  entry.count++;
  RATE_LIMIT.set(ip, entry);
  if (entry.count > 3) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(400).json({ error: "Invalid request" }); }

  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim().slice(0, 100);
  const source = String(body.source || "website_popup").trim().slice(0, 50);

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "Valid email address required." });
  }

  // Fetch GHL webhook URL from settings
  let ghlUrl = "";
  try {
    const sb = getSupabaseService();
    const { data } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "newsletter_popup")
      .maybeSingle();
    if (data?.value && typeof data.value === "object") {
      ghlUrl = String(data.value.ghl_webhook_url || "").trim();
    }
  } catch {
    // Fallback to env var
    ghlUrl = (process.env.GHL_WEBHOOK_URL || "").trim();
  }

  if (!ghlUrl) {
    // Don't expose the missing config — just silently succeed (allows testing without GHL)
    console.warn("newsletter/subscribe: GHL webhook URL not configured");
    return res.status(200).json({ ok: true, message: "Subscribed successfully! Thank you." });
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
      // Don't expose GHL errors to the user
      return res.status(200).json({ ok: true, message: "Subscribed successfully! Thank you." });
    }

    return res.status(200).json({ ok: true, message: "Subscribed successfully! Thank you for joining us." });
  } catch (e) {
    console.error("newsletter/subscribe fetch error:", e.message);
    return res.status(200).json({ ok: true, message: "Subscribed successfully! Thank you." });
  }
}
