/**
 * GET  /api/admin/nav          — list all nav items (auth)
 * PUT  /api/admin/nav          — full replacement of nav items (auth)
 * POST /api/admin/nav          — add a single nav item (auth)
 */
import { getSupabaseService, requireAdmin } from "../_lib/admin_auth.mjs";

const TABLE = "nav_items";

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

function mapItem(row) {
  return {
    id: row.id,
    label: row.label || "",
    href: row.href || "",
    target: row.target || "",
    sort_order: row.sort_order ?? 0,
    parent_id: row.parent_id || null,
    is_active: !!row.is_active,
    nav_group: row.nav_group || "desktop",
    icon_key: row.icon_key || "",
  };
}

export default async function handler(req, res) {
  if (!(await requireAdmin(req, res))) return;

  if (req.method === "GET") {
    try {
      const sb = getSupabaseService();
      const { data, error } = await sb
        .from(TABLE)
        .select("*")
        .order("nav_group")
        .order("sort_order");
      if (error) throw error;
      return res.status(200).json((data || []).map(mapItem));
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "PUT") {
    // Full replacement: delete all and reinsert
    let body;
    try { body = await readJsonBody(req); }
    catch { return res.status(400).json({ error: "Invalid JSON" }); }

    const items = Array.isArray(body) ? body : body.items;
    if (!Array.isArray(items)) return res.status(400).json({ error: "Expected array of nav items" });

    try {
      const sb = getSupabaseService();
      await sb.from(TABLE).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (items.length) {
        const rows = items.map((item, i) => ({
          id: item.id || undefined,
          label: String(item.label || "").trim(),
          href: String(item.href || "").trim(),
          target: String(item.target || "").trim(),
          sort_order: Number(item.sort_order ?? i * 10),
          parent_id: item.parent_id || null,
          is_active: item.is_active !== false,
          nav_group: String(item.nav_group || "desktop").trim(),
          icon_key: String(item.icon_key || "").trim().slice(0, 64),
        })).filter((r) => r.label && r.href);

        const { error } = await sb.from(TABLE).insert(rows);
        if (error) throw error;
      }
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "POST") {
    let body;
    try { body = await readJsonBody(req); }
    catch { return res.status(400).json({ error: "Invalid JSON" }); }

    if (!body.label || !body.href) return res.status(400).json({ error: "label and href required" });

    try {
      const sb = getSupabaseService();
      const row = {
        label: String(body.label).trim(),
        href: String(body.href).trim(),
        target: String(body.target || "").trim(),
        sort_order: Number(body.sort_order ?? 999),
        parent_id: body.parent_id || null,
        is_active: body.is_active !== false,
        nav_group: String(body.nav_group || "desktop").trim(),
        icon_key: String(body.icon_key || "").trim().slice(0, 64),
      };
      const { data, error } = await sb.from(TABLE).insert(row).select("*").single();
      if (error) throw error;
      return res.status(201).json(mapItem(data));
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  res.setHeader("Allow", "GET, PUT, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
