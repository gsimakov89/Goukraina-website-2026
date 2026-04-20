/**
 * POST /api/admin/import-local-posts — scan public/blog/<slug>/index.html files
 * and upsert them into Supabase blog_posts. Idempotent: existing rows are updated.
 *
 * Body: { overwrite?: boolean }  // default false — skip posts whose slugs already exist
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSupabaseService, requireAdmin } from "../_lib/admin_auth.mjs";

const TABLE = "blog_posts";

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => { d += c; });
    req.on("end", () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function meta(html, re) {
  const m = html.match(re);
  return m ? m[1] : "";
}

function decodeEntities(str) {
  return String(str || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function extractTags(html) {
  const row = html.match(/<p[^>]*class="[^"]*blog-tags[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  if (!row) return [];
  const tags = [];
  const re = /<span[^>]*class="tag"[^>]*>([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(row[1]))) tags.push(decodeEntities(m[1].trim()));
  return tags;
}

function extractReadMinutes(html) {
  const m = html.match(/(\d+)\s*min read/i);
  return m ? parseInt(m[1], 10) : 1;
}

function extractArticleBody(html) {
  // Grab <div class="article-body ...">...</div> — track nested divs
  const startRe = /<div[^>]*class="[^"]*article-body[^"]*"[^>]*>/;
  const start = html.match(startRe);
  if (!start) return "";
  const startIdx = start.index + start[0].length;
  let depth = 1;
  let i = startIdx;
  const tagRe = /<\/?div\b[^>]*>/g;
  tagRe.lastIndex = startIdx;
  let m;
  while ((m = tagRe.exec(html))) {
    if (m[0].startsWith("</")) {
      depth--;
      if (depth === 0) { i = m.index; break; }
    } else {
      depth++;
    }
  }
  let body = html.slice(startIdx, i);
  // Remove the in-article donate mission aside; admin content should be clean.
  body = body.replace(/<aside class="blog-mission-card"[\s\S]*?<\/aside>/g, "").trim();
  return body;
}

async function parseHtmlFile(slug, filePath) {
  const html = await fs.readFile(filePath, "utf8");
  const title = decodeEntities(meta(html, /<h1[^>]*itemprop="headline"[^>]*>([\s\S]*?)<\/h1>/) || meta(html, /<title>([\s\S]*?)<\/title>/)).replace(/\s*\|\s*Go Ukraina\s*$/, "").trim();
  const meta_title = decodeEntities(meta(html, /<title>([\s\S]*?)<\/title>/)).trim();
  const meta_description = decodeEntities(meta(html, /<meta name="description" content="([^"]+)"/));
  const published = meta(html, /<meta property="article:published_time" content="([^"]+)"/);
  const og_image = meta(html, /<meta property="og:image" content="([^"]+)"/);
  const og_image_alt = decodeEntities(meta(html, /<meta property="og:image:alt" content="([^"]+)"/));
  const cover = og_image;
  const tags = extractTags(html);
  const read = extractReadMinutes(html);
  const body_html = extractArticleBody(html);
  const date = (published || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
  const date_label = date ? new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
  const excerpt = meta_description;

  return {
    slug,
    title,
    desc: meta_description,
    date,
    date_label,
    read,
    tags,
    excerpt,
    cover,
    body_html,
    status: "published",
    seo: { meta_title, meta_description, og_image, og_image_alt },
    updated_at: new Date().toISOString(),
    slug_manual: true,
  };
}

function resolveBlogDir() {
  // __dirname equivalent in ESM
  const here = path.dirname(fileURLToPath(import.meta.url));
  // api/admin/ -> repo root -> public/blog
  return path.resolve(here, "..", "..", "public", "blog");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  let body;
  try { body = await readBody(req); }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }
  const overwrite = !!body.overwrite;

  let blogDir;
  try { blogDir = resolveBlogDir(); }
  catch { return res.status(500).json({ error: "Could not resolve blog directory" }); }

  let entries;
  try {
    entries = await fs.readdir(blogDir, { withFileTypes: true });
  } catch (e) {
    return res.status(500).json({ error: `Cannot read blog directory: ${e.message}` });
  }

  const slugs = entries.filter((e) => e.isDirectory()).map((e) => e.name);

  let sb;
  try { sb = getSupabaseService(); }
  catch (e) { return res.status(500).json({ error: e.message || "Supabase not configured" }); }

  let existingSlugs = new Set();
  try {
    const { data } = await sb.from(TABLE).select("slug");
    existingSlugs = new Set((data || []).map((r) => r.slug));
  } catch { /* ignore; treat as empty */ }

  const results = [];
  for (const slug of slugs) {
    const filePath = path.join(blogDir, slug, "index.html");
    try {
      await fs.access(filePath);
    } catch {
      results.push({ slug, skipped: true, reason: "no index.html" });
      continue;
    }

    if (existingSlugs.has(slug) && !overwrite) {
      results.push({ slug, skipped: true, reason: "already exists" });
      continue;
    }

    try {
      const row = await parseHtmlFile(slug, filePath);
      const { error } = await sb.from(TABLE).upsert(row, { onConflict: "slug" });
      if (error) throw error;
      results.push({ slug, ok: true, title: row.title, action: existingSlugs.has(slug) ? "updated" : "created" });
    } catch (e) {
      results.push({ slug, ok: false, error: e.message || String(e) });
    }
  }

  const created = results.filter((r) => r.action === "created").length;
  const updated = results.filter((r) => r.action === "updated").length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => r.ok === false).length;

  return res.status(200).json({
    ok: true,
    summary: { total: slugs.length, created, updated, skipped, failed },
    results,
  });
}
