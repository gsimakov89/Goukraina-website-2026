/**
 * GET  /api/admin/author      — get default author profile (auth)
 * PUT  /api/admin/author      — upsert author profile (auth)
 */
import { getSupabaseService, requireAdmin } from "../_lib/admin_auth.mjs";

const TABLE = "author_profiles";

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
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    try {
      const sb = getSupabaseService();
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .eq("is_default", true)
        .maybeSingle();
      if (error) throw error;
      return res.status(200).json(data || {});
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "PUT") {
    let body;
    try { body = await readJsonBody(req); }
    catch { return res.status(400).json({ error: "Invalid JSON" }); }

    try {
      const sb = getSupabaseService();
      const { data: existing } = await sb
        .from(TABLE)
        .select("id")
        .eq("is_default", true)
        .maybeSingle();

      const row = {
        name: String(body.name || "").trim(),
        role: String(body.role || "").trim(),
        bio: String(body.bio || "").trim(),
        avatar_url: String(body.avatar_url || "").trim(),
        initials: String(body.initials || "").trim().slice(0, 4),
        email: String(body.email || "").trim(),
        twitter: String(body.twitter || "").trim(),
        linkedin: String(body.linkedin || "").trim(),
        website: String(body.website || "").trim(),
        is_default: true,
      };

      let result;
      if (existing?.id) {
        result = await sb.from(TABLE).update(row).eq("id", existing.id).select("*").single();
      } else {
        result = await sb.from(TABLE).insert(row).select("*").single();
      }
      if (result.error) throw result.error;
      return res.status(200).json({ ok: true, data: result.data });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}
