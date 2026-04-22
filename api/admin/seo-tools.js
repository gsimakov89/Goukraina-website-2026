/**
 * POST /api/admin/seo-tools
 * body: { action: 'sitemap' | 'robots' | 'rss' | 'llms' | 'analyze' }
 * Returns preview content + optionally triggers rebuild.
 * auth required.
 */
import { getSupabaseService, requireAdmin } from "../_lib/admin_auth.mjs";

const SITE_ORIGIN = "https://www.goukraina.org";
const POSTS_TABLE = (process.env.SUPABASE_POSTS_TABLE || "blog_posts").trim() || "blog_posts";

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

async function getPublishedPosts(sb) {
  const { data, error } = await sb
    .from(POSTS_TABLE)
    .select("slug, title, date, date_label, excerpt, updated_at, tags, cover, seo")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("date", { ascending: false });
  if (error) throw error;
  return data || [];
}

function generateSitemap(posts) {
  const staticPages = [
    { loc: "/", priority: "1.0", changefreq: "weekly" },
    { loc: "/about/", priority: "0.8", changefreq: "monthly" },
    { loc: "/donate/", priority: "0.9", changefreq: "monthly" },
    { loc: "/impact/", priority: "0.8", changefreq: "monthly" },
    { loc: "/blog/", priority: "0.8", changefreq: "daily" },
    { loc: "/contact/", priority: "0.7", changefreq: "monthly" },
    { loc: "/initiatives/reh2o/", priority: "0.8", changefreq: "monthly" },
    { loc: "/initiatives/power-generators/", priority: "0.7", changefreq: "monthly" },
    { loc: "/initiatives/advocacy/", priority: "0.7", changefreq: "monthly" },
    { loc: "/initiatives/ukraine-dreamzzz/", priority: "0.7", changefreq: "monthly" },
  ];

  const now = new Date().toISOString().slice(0, 10);
  const rows = [
    ...staticPages.map(
      (p) =>
        `  <url>\n    <loc>${SITE_ORIGIN}${p.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
    ),
    ...posts.map((p) => {
      const mod = p.updated_at ? p.updated_at.slice(0, 10) : (p.date || now);
      return `  <url>\n    <loc>${SITE_ORIGIN}/blog/${p.slug}/</loc>\n    <lastmod>${mod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>`;
    }),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n${rows.join("\n")}\n</urlset>`;
}

function generateRobots() {
  return `User-agent: *
Allow: /

# Crawl budget hints
Disallow: /admin
Disallow: /api/

# Explicit AI crawler permissions (SEO/LLM discovery)
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: YouBot
Allow: /

Sitemap: ${SITE_ORIGIN}/sitemap.xml
`;
}

function generateRSS(posts) {
  const items = posts
    .slice(0, 20)
    .map((p) => {
      const desc = p.excerpt || (p.seo && p.seo.meta_description) || "";
      const link = `${SITE_ORIGIN}/blog/${p.slug}/`;
      const pub = p.date ? new Date(p.date + "T12:00:00Z").toUTCString() : new Date().toUTCString();
      const cover = p.cover ? `${SITE_ORIGIN}/assets/img/${p.cover}` : "";
      const tags = Array.isArray(p.tags) ? p.tags.map((t) => `<category>${t}</category>`).join("") : "";
      return `  <item>
    <title><![CDATA[${p.title}]]></title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <description><![CDATA[${desc}]]></description>
    <pubDate>${pub}</pubDate>${cover ? `\n    <enclosure url="${cover}" type="image/jpeg" length="0" />` : ""}
    ${tags}
  </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Go Ukraina Field Reports</title>
    <link>${SITE_ORIGIN}/blog/</link>
    <description>Field reports and updates from Go Ukraina — Ukraine humanitarian aid, clean water, and advocacy.</description>
    <language>en-us</language>
    <atom:link href="${SITE_ORIGIN}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>${SITE_ORIGIN}/assets/img/logo.png</url>
      <title>Go Ukraina</title>
      <link>${SITE_ORIGIN}</link>
    </image>
${items}
  </channel>
</rss>`;
}

function generateLLMs(posts) {
  const postList = posts
    .slice(0, 10)
    .map((p) => `- [${p.title}](${SITE_ORIGIN}/blog/${p.slug}/) — ${p.excerpt || p.date || ""}`)
    .join("\n");

  return `# Go Ukraina

> Go Ukraina is a Los Angeles-based 501(c)(3) nonprofit delivering clean water, emergency power, and advocacy for war-affected Ukraine.

## What we do

- **ReH2O Clean Water**: Solar-powered water purification stations for communities without safe water access.
- **Emergency Power**: Generators and solar panels for hospitals, shelters, and critical infrastructure.
- **Advocacy**: Human rights advocacy for Ukrainian POWs and war-affected civilians.
- **Ukraine Dreamzzz**: Youth education and cultural preservation programs.

## Key pages

- Homepage: ${SITE_ORIGIN}/
- About: ${SITE_ORIGIN}/about/
- ReH2O Program: ${SITE_ORIGIN}/initiatives/reh2o/
- Power Generators: ${SITE_ORIGIN}/initiatives/power-generators/
- Advocacy: ${SITE_ORIGIN}/initiatives/advocacy/
- Impact & Transparency: ${SITE_ORIGIN}/impact/
- Blog / Field Reports: ${SITE_ORIGIN}/blog/
- Donate: ${SITE_ORIGIN}/donate/
- Contact: ${SITE_ORIGIN}/contact/

## Recent field reports

${postList}

## Facts

- EIN: 88-2011390
- Status: 501(c)(3) public charity
- Location: Los Angeles, California, USA
- Founded to support Ukraine during the ongoing conflict
- All programs have direct Ukrainian partner oversight

## Contact

- Email: info@goukraina.com
- Website: ${SITE_ORIGIN}
- Sitemap: ${SITE_ORIGIN}/sitemap.xml
- RSS: ${SITE_ORIGIN}/blog/rss.xml
`;
}

async function analyzeWithAI(posts, key) {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const postSummary = posts.slice(0, 5).map((p) => ({
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt || "",
    tags: p.tags || [],
    has_cover: !!p.cover,
    meta_description: p.seo?.meta_description || "",
    meta_title: p.seo?.meta_title || "",
  }));

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an expert SEO analyst for a nonprofit website (Go Ukraina — Ukraine humanitarian aid). Analyze the provided site data and return JSON with:
{
  "score": number 0-100,
  "grade": "A"|"B"|"C"|"D"|"F",
  "summary": "string — 2-3 sentence overall assessment",
  "issues": [{"severity":"critical"|"warning"|"info","title":"string","description":"string","fix":"string"}],
  "wins": ["string"],
  "priority_actions": ["string — specific, actionable, numbered"]
}`,
        },
        {
          role: "user",
          content: JSON.stringify({
            site: "goukraina.org",
            mission: "Ukraine humanitarian nonprofit — clean water, power, advocacy",
            posts: postSummary,
            has_sitemap: true,
            has_robots: true,
            has_llms_txt: true,
            has_rss: false,
            has_schema_jsonld: true,
          }),
        },
      ],
    }),
  });

  const raw = await r.text();
  const json = JSON.parse(raw);
  if (!r.ok) throw new Error(json.error?.message || raw.slice(0, 200));
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty AI response");
  return JSON.parse(content);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }

  const action = String(body.action || "").trim();
  if (!action) return res.status(400).json({ error: "action required" });

  try {
    const sb = getSupabaseService();
    const posts = await getPublishedPosts(sb);

    if (action === "sitemap") {
      return res.status(200).json({ content: generateSitemap(posts), filename: "sitemap.xml", contentType: "application/xml" });
    }
    if (action === "robots") {
      return res.status(200).json({ content: generateRobots(), filename: "robots.txt", contentType: "text/plain" });
    }
    if (action === "rss") {
      return res.status(200).json({ content: generateRSS(posts), filename: "rss.xml", contentType: "application/rss+xml" });
    }
    if (action === "llms") {
      return res.status(200).json({ content: generateLLMs(posts), filename: "llms.txt", contentType: "text/plain" });
    }
    if (action === "analyze") {
      const key = (process.env.OPENAI_API_KEY || "").trim();
      if (!key) return res.status(503).json({ error: "OPENAI_API_KEY not set" });
      const analysis = await analyzeWithAI(posts, key);
      return res.status(200).json(analysis);
    }
    if (action === "rebuild") {
      const hookUrl = (process.env.VERCEL_DEPLOY_HOOK_URL || "").trim();
      if (!hookUrl) return res.status(503).json({ error: "VERCEL_DEPLOY_HOOK_URL not set" });
      const r2 = await fetch(hookUrl, { method: "POST" });
      const ok = r2.ok;
      return res.status(ok ? 200 : 502).json({ ok, status: r2.status });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
