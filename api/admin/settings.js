/**
 * GET  /api/admin/settings          — fetch all settings (auth) or public keys (no auth)
 * GET  /api/admin/settings?key=X    — fetch one key (auth)
 * PUT  /api/admin/settings          — upsert { key, value } or array thereof (auth)
 *
 * Public keys (no auth): newsletter_popup
 */
import { getSupabaseService, requireAdmin } from "../_lib/admin_auth.mjs";

const TABLE = "site_settings";
const PUBLIC_KEYS = new Set(["newsletter_popup"]);

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

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    const key = (req.query?.key || "").trim();
    // Allow unauthenticated reads for public keys
    if (key && PUBLIC_KEYS.has(key)) {
      try {
        const sb = getSupabaseService();
        const { data, error } = await sb.from(TABLE).select("key, value").eq("key", key).maybeSingle();
        if (error) throw error;
        return res.status(200).json(data ? { key: data.key, value: data.value } : { key, value: null });
      } catch (e) {
        return res.status(500).json({ error: e.message || String(e) });
      }
    }

    if (!(await requireAdmin(req, res))) return;
    try {
      const sb = getSupabaseService();
      if (key) {
        const { data, error } = await sb.from(TABLE).select("key, value").eq("key", key).maybeSingle();
        if (error) throw error;
        return res.status(200).json(data ? { key: data.key, value: data.value } : { key, value: null });
      }
      const { data, error } = await sb.from(TABLE).select("key, value").order("key");
      if (error) throw error;
      const out = {};
      for (const row of data || []) out[row.key] = row.value;
      return res.status(200).json(out);
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "PUT") {
    if (!(await requireAdmin(req, res))) return;
    let body;
    try { body = await readJsonBody(req); }
    catch { return res.status(400).json({ error: "Invalid JSON" }); }

    const items = Array.isArray(body) ? body : [body];
    if (!items.length) return res.status(400).json({ error: "Empty body" });

    try {
      const sb = getSupabaseService();
      const rows = items.map((item) => ({
        key: String(item.key || ""),
        value: item.value !== undefined ? item.value : null,
        updated_at: new Date().toISOString(),
      })).filter((r) => r.key);

      if (!rows.length) return res.status(400).json({ error: "No valid key/value pairs" });
      const { error } = await sb.from(TABLE).upsert(rows, { onConflict: "key" });
      if (error) throw error;
      return res.status(200).json({ ok: true, updated: rows.length });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
