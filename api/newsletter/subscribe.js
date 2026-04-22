/**
 * POST /api/newsletter/subscribe — validate email, dedupe, create Givebutter contact (public endpoint)
 * body: { email: string, name?: string, source?: string }
 *
 * Requires GIVEBUTTER_API_KEY in Vercel env. Optional extra tags from site_settings.newsletter_popup.contact_tags
 * (comma-separated, public-safe).
 */
import { getSupabaseService } from "../_lib/admin_auth.mjs";
import { getGivebutterApiKey } from "../_lib/ai_keys.mjs";
import {
  createGivebutterContact,
  givebutterLooksLikeDuplicate,
  isValidEmail,
  normalizeEmail,
} from "../_lib/newsletter_givebutter.mjs";

const RATE_LIMIT = new Map();

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
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

function parseExtraTagsFromSettings(value) {
  if (!value || typeof value !== "object") return [];
  const raw = String(value.contact_tags ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
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

  const ip = getClientIp(req);
  const now = Date.now();
  const entry = RATE_LIMIT.get(ip) || { count: 0, window: now };
  if (now - entry.window > 60000) {
    entry.count = 0;
    entry.window = now;
  }
  entry.count++;
  RATE_LIMIT.set(ip, entry);
  if (entry.count > 3) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid request" });
  }

  const email = normalizeEmail(body.email);
  const name = String(body.name || "").trim().slice(0, 100);
  const source = String(body.source || "website_popup").trim().slice(0, 50);

  if (!email || !isValidEmail(email)) {
    return res.status(400).json({ error: "Valid email address required." });
  }

  const apiKey = (await getGivebutterApiKey()).trim();
  if (!apiKey) {
    console.warn("newsletter/subscribe: Givebutter API key not configured (Admin → Integrations or GIVEBUTTER_API_KEY)");
    return res.status(200).json({ ok: true, message: "Subscribed successfully! Thank you." });
  }

  let extraTags = [];
  try {
    const sb = getSupabaseService();
    const { data } = await sb.from("site_settings").select("value").eq("key", "newsletter_popup").maybeSingle();
    extraTags = parseExtraTagsFromSettings(data?.value);

    const { error: insErr } = await sb.from("newsletter_signups").insert({ email, source });

    if (insErr?.code === "23505") {
      return res.status(200).json({
        ok: true,
        duplicate: true,
        message: "You're already on our list. Thank you!",
      });
    }
    if (insErr) {
      console.error("newsletter_signups insert:", insErr.message);
      return res.status(500).json({ error: "Could not save signup. Please try again." });
    }

    const displayName = name || email.split("@")[0];
    const gb = await createGivebutterContact(apiKey, { email, name: displayName, source, extraTags });

    if (gb.ok || givebutterLooksLikeDuplicate(gb)) {
      return res.status(200).json({
        ok: true,
        message: "Subscribed successfully! Thank you for joining us.",
      });
    }

    await sb.from("newsletter_signups").delete().eq("email", email);
    console.error("Givebutter contact error:", gb.status, (gb.text || "").slice(0, 300));
    return res.status(502).json({ ok: false, error: "Could not complete signup. Please try again in a moment." });
  } catch (e) {
    console.error("newsletter/subscribe:", e.message);
    return res.status(500).json({ ok: false, error: "Something went wrong. Please try again." });
  }
}
