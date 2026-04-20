/**
 * GET/PUT/DELETE /api/posts/:slug — Supabase `blog_posts` only.
 */
import { getSupabaseService, requireAdmin, supabasePostsEnabled } from "../_lib/admin_auth.mjs";

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

function postsTable() {
  return (process.env.SUPABASE_POSTS_TABLE || "blog_posts").trim() || "blog_posts";
}

function mapRow(row) {
  if (!row) return null;
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const seo = row.seo && typeof row.seo === "object" ? row.seo : {};
  let date = row.date;
  if (date && typeof date === "string") date = date.slice(0, 10);
  else if (date instanceof Date) date = date.toISOString().slice(0, 10);
  let updated_at = row.updated_at || "";
  if (updated_at instanceof Date) updated_at = updated_at.toISOString();
  return {
    slug: row.slug,
    title: row.title,
    desc: row.desc || "",
    date,
    date_label: row.date_label || "",
    read: row.read ?? 1,
    tags,
    excerpt: row.excerpt || "",
    cover: row.cover || "",
    body_html: row.body_html || "",
    status: row.status || "draft",
    seo: {
      meta_title: seo.meta_title || "",
      meta_description: seo.meta_description || "",
      og_image: seo.og_image || "",
      og_image_alt: seo.og_image_alt || "",
    },
    updated_at: updated_at || "",
    slug_manual: !!row.slug_manual,
  };
}

function rowFromPostBody(body) {
  const seo = body.seo && typeof body.seo === "object" ? body.seo : {};
  return {
    slug: body.slug,
    title: body.title,
    desc: body.desc || "",
    date: String(body.date).slice(0, 10),
    date_label: body.date_label || "",
    read: body.read ?? 1,
    tags: Array.isArray(body.tags) ? body.tags : [],
    excerpt: body.excerpt || "",
    cover: body.cover || "",
    body_html: body.body_html || "",
    status: body.status || "draft",
    seo: {
      meta_title: seo.meta_title || "",
      meta_description: seo.meta_description || "",
      og_image: seo.og_image || "",
      og_image_alt: seo.og_image_alt || "",
    },
    updated_at: body.updated_at || new Date().toISOString(),
    slug_manual: !!body.slug_manual,
  };
}

async function supabaseHandler(req, res) {
  const raw = req.query.slug;
  const slug = Array.isArray(raw) ? raw[0] : raw;
  if (!slug || typeof slug !== "string") {
    return res.status(400).json({ error: "Missing slug" });
  }
  const table = postsTable();

  if (req.method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    try {
      const supabase = getSupabaseService();
      const { data, error } = await supabase.from(table).select("*").eq("slug", slug).maybeSingle();
      if (error) throw error;
      if (!data) return res.status(404).json({ error: "Not found" });
      if (data.status === "deleted") return res.status(404).json({ error: "Not found" });
      return res.status(200).json(mapRow(data));
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "PUT") {
    if (!(await requireAdmin(req, res))) return;
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    if (String(body.slug || "") !== slug) {
      return res.status(400).json({ error: "Body slug must match URL" });
    }
    try {
      const supabase = getSupabaseService();
      const row = rowFromPostBody(body);
      const { data, error } = await supabase.from(table).update(row).eq("slug", slug).select("*").single();
      if (error) throw error;
      return res.status(200).json({ ok: true, slug: data?.slug || slug });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "DELETE") {
    if (!(await requireAdmin(req, res))) return;
    try {
      const supabase = getSupabaseService();
      const { error } = await supabase
        .from(table)
        .update({ status: "deleted", deleted_at: new Date().toISOString() })
        .eq("slug", slug);
      if (error) throw error;
      return res.status(200).json({ ok: true, soft_deleted: true });
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  res.setHeader("Allow", "GET, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}

export default async function handler(req, res) {
  if (!supabasePostsEnabled()) {
    return res.status(503).json({
      error: "Blog API requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }
  return supabaseHandler(req, res);
}
