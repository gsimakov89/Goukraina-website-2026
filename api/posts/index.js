/**
 * GET /api/posts — list all posts (auth)
 * POST /api/posts — create post or draft (auth)
 *
 * Storage: Supabase `blog_posts` only (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY).
 */
import { slugify, todayISODate } from "../_lib/posts_utils.mjs";
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

function draftJson(slug, title) {
  const date = todayISODate();
  const d = new Date(`${date}T12:00:00Z`);
  const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return {
    slug,
    title,
    desc: title,
    date,
    date_label: dateLabel,
    read: 1,
    tags: [],
    excerpt: "",
    cover: "",
    body_html: "<p></p>",
    status: "draft",
    seo: { meta_title: "", meta_description: "", og_image: "", og_image_alt: "" },
    updated_at: "",
    slug_manual: false,
  };
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

export default async function handler(req, res) {
  if (!supabasePostsEnabled()) {
    return res.status(503).json({
      error: "Blog API requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    });
  }
  return supabaseHandler(req, res);
}

async function supabaseHandler(req, res) {
  const table = postsTable();
  if (req.method === "GET") {
    if (!(await requireAdmin(req, res))) return;
    try {
      const supabase = getSupabaseService();
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .neq("status", "deleted")
        .order("date", { ascending: false });
      if (error) throw error;
      const out = (data || []).map(mapRow);
      return res.status(200).json(out);
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  if (req.method === "POST") {
    if (!(await requireAdmin(req, res))) return;
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ error: "Invalid JSON body" });
    }
    try {
      const supabase = getSupabaseService();
      const { data: rows } = await supabase.from(table).select("slug");
      const existing = new Set((rows || []).map((r) => r.slug));

      const titleOnly = body.title && typeof body.title === "string" && !body.slug;
      if (titleOnly) {
        const slug = slugify(body.title, existing);
        const post = draftJson(slug, body.title.trim());
        const row = rowFromPostBody(post);
        const { data, error } = await supabase.from(table).insert(row).select("*").single();
        if (error) throw error;
        return res.status(201).json(mapRow(data));
      }

      if (!body.slug || !body.title) {
        return res.status(400).json({ error: "slug and title are required" });
      }
      const slug = String(body.slug).trim();
      if (existing.has(slug)) {
        return res.status(409).json({ error: "Slug already exists; use PUT to update." });
      }
      const row = rowFromPostBody(body);
      const { data, error } = await supabase.from(table).insert(row).select("*").single();
      if (error) throw error;
      return res.status(201).json(mapRow(data));
    } catch (e) {
      return res.status(500).json({ error: e.message || String(e) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
