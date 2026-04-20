import { getSupabaseService, requireAdmin } from "./admin_auth.ts";
import { getMergedAnalyticsConfig, SITE_ORIGIN } from "./analytics_config.ts";
import { getGoogleAccessToken } from "./google_oauth.ts";
import { json, mergeCors, readJsonBody } from "./http.ts";
import { getOpenAIKey } from "./openai_key.ts";

const TABLE_SETTINGS = "site_settings";
const PUBLIC_KEYS = new Set(["newsletter_popup"]);

// --- settings ---

export async function handleAdminSettings(req: Request, u: URL): Promise<Response> {
  const cors = mergeCors;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  if (req.method === "GET") {
    const key = (u.searchParams.get("key") || "").trim();
    if (key && PUBLIC_KEYS.has(key)) {
      try {
        const sb = getSupabaseService();
        const { data, error } = await sb.from(TABLE_SETTINGS).select("key, value").eq("key", key).maybeSingle();
        if (error) throw error;
        return cors(json(data ? { key: data.key, value: data.value } : { key, value: null }));
      } catch (e) {
        return cors(json({ error: (e as Error).message || String(e) }, 500));
      }
    }

    const gate = await requireAdmin(req);
    if (gate) return cors(gate);
    try {
      const sb = getSupabaseService();
      if (key) {
        const { data, error } = await sb.from(TABLE_SETTINGS).select("key, value").eq("key", key).maybeSingle();
        if (error) throw error;
        return cors(json(data ? { key: data.key, value: data.value } : { key, value: null }));
      }
      const { data, error } = await sb.from(TABLE_SETTINGS).select("key, value").order("key");
      if (error) throw error;
      const out: Record<string, unknown> = {};
      for (const row of data || []) out[row.key] = row.value;
      return cors(json(out));
    } catch (e) {
      return cors(json({ error: (e as Error).message || String(e) }, 500));
    }
  }

  if (req.method === "PUT") {
    const gate = await requireAdmin(req);
    if (gate) return cors(gate);
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      return cors(json({ error: "Invalid JSON" }, 400));
    }

    const items = Array.isArray(body) ? body : [body];
    if (!items.length) return cors(json({ error: "Empty body" }, 400));

    try {
      const sb = getSupabaseService();
      const rows = (items as { key?: string; value?: unknown }[])
        .map((item) => ({
          key: String(item.key || ""),
          value: item.value !== undefined ? item.value : null,
          updated_at: new Date().toISOString(),
        }))
        .filter((r) => r.key);

      if (!rows.length) return cors(json({ error: "No valid key/value pairs" }, 400));
      const { error } = await sb.from(TABLE_SETTINGS).upsert(rows, { onConflict: "key" });
      if (error) throw error;
      return cors(json({ ok: true, updated: rows.length }));
    } catch (e) {
      return cors(json({ error: (e as Error).message || String(e) }, 500));
    }
  }

  return cors(json({ error: "Method not allowed" }, 405));
}

// --- nav ---

const TABLE_NAV = "nav_items";

function mapNavItem(row: Record<string, unknown>) {
  return {
    id: row.id,
    label: row.label || "",
    href: row.href || "",
    target: row.target || "",
    sort_order: row.sort_order ?? 0,
    parent_id: row.parent_id || null,
    is_active: !!row.is_active,
    nav_group: row.nav_group || "desktop",
  };
}

export async function handleAdminNav(req: Request): Promise<Response> {
  const gate = await requireAdmin(req);
  if (gate) return gate;

  if (req.method === "GET") {
    try {
      const sb = getSupabaseService();
      const { data, error } = await sb
        .from(TABLE_NAV)
        .select("*")
        .order("nav_group")
        .order("sort_order");
      if (error) throw error;
      return json((data || []).map((r) => mapNavItem(r as Record<string, unknown>)));
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  if (req.method === "PUT") {
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const items = Array.isArray(body) ? body : body.items;
    if (!Array.isArray(items)) return json({ error: "Expected array of nav items" }, 400);

    try {
      const sb = getSupabaseService();
      await sb.from(TABLE_NAV).delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (items.length) {
        const rows = (items as Record<string, unknown>[])
          .map((item, i) => ({
            id: item.id || undefined,
            label: String(item.label || "").trim(),
            href: String(item.href || "").trim(),
            target: String(item.target || "").trim(),
            sort_order: Number(item.sort_order ?? i * 10),
            parent_id: item.parent_id || null,
            is_active: item.is_active !== false,
            nav_group: String(item.nav_group || "desktop").trim(),
          }))
          .filter((r) => r.label && r.href);

        const { error } = await sb.from(TABLE_NAV).insert(rows);
        if (error) throw error;
      }
      return json({ ok: true });
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    if (!body.label || !body.href) return json({ error: "label and href required" }, 400);

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
      };
      const { data, error } = await sb.from(TABLE_NAV).insert(row).select("*").single();
      if (error) throw error;
      return json(mapNavItem(data as Record<string, unknown>), 201);
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}

// --- author ---

const TABLE_AUTHOR = "author_profiles";

export async function handleAdminAuthor(req: Request): Promise<Response> {
  const gate = await requireAdmin(req);
  if (gate) return gate;

  if (req.method === "GET") {
    try {
      const sb = getSupabaseService();
      const { data, error } = await sb
        .from(TABLE_AUTHOR)
        .select("*")
        .eq("is_default", true)
        .maybeSingle();
      if (error) throw error;
      return json(data || {});
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  if (req.method === "PUT") {
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    try {
      const sb = getSupabaseService();
      const { data: existing } = await sb
        .from(TABLE_AUTHOR)
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
        result = await sb.from(TABLE_AUTHOR).update(row).eq("id", existing.id).select("*").single();
      } else {
        result = await sb.from(TABLE_AUTHOR).insert(row).select("*").single();
      }
      if (result.error) throw result.error;
      return json({ ok: true, data: result.data });
    } catch (e) {
      return json({ error: (e as Error).message || String(e) }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}

// --- analytics config ---

const KEY_ANALYTICS = "analytics";

function parseServiceAccount(raw: string): unknown | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  try {
    const o = JSON.parse(raw);
    return typeof o === "object" && o !== null ? o : null;
  } catch {
    return null;
  }
}

export async function handleAnalyticsConfig(req: Request): Promise<Response> {
  const cors = mergeCors;

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  const gate = await requireAdmin(req);
  if (gate) return cors(gate);

  if (req.method === "GET") {
    try {
      const m = await getMergedAnalyticsConfig();
      const raw = m.ga4_service_account_json || "";
      const hasSa = Boolean(raw.trim()) && parseServiceAccount(raw) !== null;
      return cors(
        json({
          ga4_property_id: m.ga4_property_id || "",
          gsc_site_url: m.gsc_site_url || `${SITE_ORIGIN}/`,
          service_account_configured: hasSa,
        }),
      );
    } catch (e) {
      return cors(json({ error: (e as Error).message || String(e) }, 500));
    }
  }

  if (req.method === "PUT") {
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return cors(json({ error: "Invalid JSON" }, 400));
    }

    try {
      const sb = getSupabaseService();
      const { data: row } = await sb.from("site_settings").select("value").eq("key", KEY_ANALYTICS).maybeSingle();
      const current = row?.value && typeof row.value === "object" ? { ...(row.value as object) } : {};

      if ("ga4_property_id" in body) {
        (current as Record<string, unknown>).ga4_property_id = String(body.ga4_property_id || "").trim();
      }
      if ("gsc_site_url" in body) {
        const u0 = String(body.gsc_site_url || "").trim();
        (current as Record<string, unknown>).gsc_site_url = u0 || `${SITE_ORIGIN}/`;
      }
      if ("ga4_service_account_json" in body) {
        const raw = String(body.ga4_service_account_json || "").trim();
        if (raw) {
          try {
            JSON.parse(raw);
          } catch {
            return cors(json({ error: "Google service account JSON must be valid JSON." }, 400));
          }
          (current as Record<string, unknown>).ga4_service_account_json = raw;
        } else {
          delete (current as Record<string, unknown>).ga4_service_account_json;
        }
      }

      const { error } = await sb.from("site_settings").upsert(
        {
          key: KEY_ANALYTICS,
          value: current,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) throw error;
      return cors(json({ ok: true }));
    } catch (e) {
      return cors(json({ error: (e as Error).message || String(e) }, 500));
    }
  }

  return cors(json({ error: "Method not allowed" }, 405));
}

// --- analytics (GA4 / GSC) ---

async function getTopPages(): Promise<Record<string, unknown>> {
  const cfg = await getMergedAnalyticsConfig();
  const propertyId = (cfg.ga4_property_id || "").trim();
  if (!propertyId) {
    return {
      configured: false,
      message: "Add your GA4 property ID and service account below (stored in Supabase).",
    };
  }

  const token = await getGoogleAccessToken([
    "https://www.googleapis.com/auth/analytics.readonly",
  ]);
  if (!token) {
    return {
      configured: false,
      message: "Service account JSON is missing or invalid. Paste a valid Google Cloud service account key.",
    };
  }

  const property = propertyId.startsWith("properties/") ? propertyId : `properties/${propertyId}`;

  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/${property}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "28daysAgo", endDate: "today" }],
      dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
      metrics: [{ name: "screenPageViews" }, { name: "activeUsers" }, { name: "averageSessionDuration" }],
      orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
      limit: 20,
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data.error?.message || "GA4 query failed");

  const rows = (data.rows || []).map((row: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }) => ({
    path: row.dimensionValues?.[0]?.value || "",
    title: row.dimensionValues?.[1]?.value || "",
    views: parseInt(row.metricValues?.[0]?.value || "0", 10),
    users: parseInt(row.metricValues?.[1]?.value || "0", 10),
    avg_duration_seconds: Math.round(parseFloat(row.metricValues?.[2]?.value || "0")),
  }));

  return { configured: true, rows, total_views: rows.reduce((s: number, x: { views: number }) => s + x.views, 0) };
}

async function submitSitemap(): Promise<Record<string, unknown>> {
  const cfg = await getMergedAnalyticsConfig();
  const siteUrl = (cfg.gsc_site_url || `${SITE_ORIGIN}/`).trim();
  const sitemapUrl = `${SITE_ORIGIN}/sitemap.xml`;

  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`;
  const results: Record<string, unknown>[] = [];

  try {
    const pr = await fetch(pingUrl, { method: "GET" });
    results.push({ method: "ping", ok: pr.ok, status: pr.status });
  } catch (e) {
    results.push({ method: "ping", ok: false, error: (e as Error).message });
  }

  try {
    const token = await getGoogleAccessToken([
      "https://www.googleapis.com/auth/webmasters",
    ]);
    if (token) {
      const encodedSite = encodeURIComponent(siteUrl);
      const encodedSitemap = encodeURIComponent(sitemapUrl);
      const gr = await fetch(
        `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/sitemaps/${encodedSitemap}`,
        { method: "PUT", headers: { Authorization: `Bearer ${token}` } },
      );
      results.push({ method: "search_console", ok: gr.ok, status: gr.status });
    } else {
      results.push({
        method: "search_console",
        ok: false,
        skipped: "Service account not configured (Supabase site_settings.analytics or env)",
      });
    }
  } catch (e) {
    results.push({ method: "search_console", ok: false, error: (e as Error).message });
  }

  return { ok: results.some((x) => x.ok), sitemap: sitemapUrl, results };
}

export async function handleAdminAnalytics(req: Request, u: URL): Promise<Response> {
  const gate = await requireAdmin(req);
  if (gate) return gate;

  if (req.method === "GET") {
    const action = (u.searchParams.get("action") || "").trim();
    if (action === "top_pages") {
      try {
        const result = await getTopPages();
        return json(result);
      } catch (e) {
        return json({ error: (e as Error).message || String(e) }, 500);
      }
    }
    return json({ error: "Unknown GET action" }, 400);
  }

  if (req.method === "POST") {
    let body: Record<string, unknown>;
    try {
      body = (await readJsonBody(req)) as Record<string, unknown>;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const action = String(body.action || "").trim();

    if (action === "submit_sitemap") {
      try {
        const result = await submitSitemap();
        return json(result);
      } catch (e) {
        return json({ error: (e as Error).message || String(e) }, 500);
      }
    }

    return json({ error: "Unknown POST action" }, 400);
  }

  return json({ error: "Method not allowed" }, 405);
}

// --- SEO tools ---

const POSTS_TABLE_SEO = () => (Deno.env.get("SUPABASE_POSTS_TABLE") || "blog_posts").trim() || "blog_posts";

async function getPublishedPosts(sb: ReturnType<typeof getSupabaseService>) {
  const { data, error } = await sb
    .from(POSTS_TABLE_SEO())
    .select("slug, title, date, date_label, excerpt, updated_at, tags, cover, seo")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("date", { ascending: false });
  if (error) throw error;
  return data || [];
}

function generateSitemap(posts: Record<string, unknown>[]) {
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
        `  <url>\n    <loc>${SITE_ORIGIN}${p.loc}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`,
    ),
    ...posts.map((p) => {
      const mod = p.updated_at ? String(p.updated_at).slice(0, 10) : (p.date || now);
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

function generateRSS(posts: Record<string, unknown>[]) {
  const items = posts
    .slice(0, 20)
    .map((p) => {
      const seo = p.seo as Record<string, unknown> | undefined;
      const desc = p.excerpt || (seo?.meta_description) || "";
      const link = `${SITE_ORIGIN}/blog/${p.slug}/`;
      const pub = p.date ? new Date(String(p.date) + "T12:00:00Z").toUTCString() : new Date().toUTCString();
      const cover = p.cover ? `${SITE_ORIGIN}/images/${p.cover}` : "";
      const tags = Array.isArray(p.tags) ? (p.tags as string[]).map((t) => `<category>${t}</category>`).join("") : "";
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
      <url>${SITE_ORIGIN}/images/logo.png</url>
      <title>Go Ukraina</title>
      <link>${SITE_ORIGIN}</link>
    </image>
${items}
  </channel>
</rss>`;
}

function generateLLMs(posts: Record<string, unknown>[]) {
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

async function analyzeWithAI(posts: Record<string, unknown>[], key: string) {
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  const postSummary = posts.slice(0, 5).map((p) => {
    const seo = p.seo as Record<string, unknown> | undefined;
    return {
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt || "",
      tags: p.tags || [],
      has_cover: !!p.cover,
      meta_description: seo?.meta_description || "",
      meta_title: seo?.meta_title || "",
    };
  });

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

export async function handleSeoTools(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const gate = await requireAdmin(req);
  if (gate) return gate;

  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req)) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = String(body.action || "").trim();
  if (!action) return json({ error: "action required" }, 400);

  try {
    const sb = getSupabaseService();
    const posts = await getPublishedPosts(sb);

    if (action === "sitemap") {
      return json({ content: generateSitemap(posts), filename: "sitemap.xml", contentType: "application/xml" });
    }
    if (action === "robots") {
      return json({ content: generateRobots(), filename: "robots.txt", contentType: "text/plain" });
    }
    if (action === "rss") {
      return json({ content: generateRSS(posts), filename: "rss.xml", contentType: "application/rss+xml" });
    }
    if (action === "llms") {
      return json({ content: generateLLMs(posts), filename: "llms.txt", contentType: "text/plain" });
    }
    if (action === "analyze") {
      const key = (await getOpenAIKey());
      if (!key) return json({ error: "OPENAI_API_KEY not set" }, 503);
      const analysis = await analyzeWithAI(posts, key);
      return json(analysis);
    }
    if (action === "rebuild") {
      const hookUrl = (Deno.env.get("VERCEL_DEPLOY_HOOK_URL") || "").trim();
      if (!hookUrl) return json({ error: "VERCEL_DEPLOY_HOOK_URL not set" }, 503);
      const r2 = await fetch(hookUrl, { method: "POST" });
      const ok = r2.ok;
      return json({ ok, status: r2.status }, ok ? 200 : 502);
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
}

export async function handleRebuildSite(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const gate = await requireAdmin(req);
  if (gate) return gate;

  const hook = Deno.env.get("VERCEL_DEPLOY_HOOK_URL");
  if (!hook) {
    return json({
      ok: true,
      skipped: true,
      message:
        "No VERCEL_DEPLOY_HOOK_URL. Add a Deploy Hook in Vercel → Project → Settings → Git → Deploy Hooks, then set the URL in env. Until then, push a commit or redeploy manually so tracking changes reach the built HTML.",
    });
  }
  try {
    const r = await fetch(hook, { method: "POST" });
    const text = await r.text().catch(() => "");
    return json({
      ok: r.ok,
      status: r.status,
      message: r.ok
        ? "Deployment started. Tracking and scripts appear in HTML after this build finishes (usually 1–3 minutes)."
        : `Deploy hook returned ${r.status}. ${text.slice(0, 200)}`,
    });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
}

export async function handleRedeploy(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  const gate = await requireAdmin(req);
  if (gate) return gate;

  const hook = Deno.env.get("VERCEL_DEPLOY_HOOK_URL");
  if (!hook) {
    return json({
      ok: true,
      skipped: true,
      message:
        "No VERCEL_DEPLOY_HOOK_URL set. Saving posts still triggers a deploy when GitHub notifies Vercel (typical setup).",
    });
  }
  try {
    const r = await fetch(hook, { method: "POST" });
    return json({ ok: r.ok, status: r.status });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message || String(e) }, 500);
  }
}

export async function handleImportLocalPosts(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  return json(
    {
      error:
        "Import from local public/blog HTML is only available via the FastAPI dev server or Vercel serverless. Run pipeline locally or use the previous API route.",
    },
    501,
  );
}