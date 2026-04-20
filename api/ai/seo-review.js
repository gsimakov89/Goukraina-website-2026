/**
 * POST /api/ai/seo-review — comprehensive AI SEO analysis for a blog post (auth)
 * body: { slug, title, body_html, excerpt, seo, tags, cover, date }
 * Returns: { score, fields: [{field, current, suggested, score, advice, severity}], summary }
 */
import { requireAdmin } from "../_lib/admin_auth.mjs";

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

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateReadTime(html) {
  const words = stripHtml(html).split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  const { getOpenAIKey } = await import("../_lib/ai_keys.mjs");
  const key = await getOpenAIKey();
  if (!key) return res.status(503).json({ error: "OpenAI key not configured. Add it in Admin → Settings → API Keys, or set OPENAI_API_KEY." });

  let body;
  try { body = await readJsonBody(req); }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }

  const title = String(body.title || "").trim();
  if (!title) return res.status(400).json({ error: "title required" });

  const seo = body.seo && typeof body.seo === "object" ? body.seo : {};
  const bodyText = stripHtml(body.body_html || "").slice(0, 6000);
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const readTime = estimateReadTime(body.body_html || "");

  const postData = {
    title,
    slug: String(body.slug || ""),
    excerpt: String(body.excerpt || ""),
    meta_title: String(seo.meta_title || ""),
    meta_description: String(seo.meta_description || ""),
    og_image: String(seo.og_image || body.cover || ""),
    og_image_alt: String(seo.og_image_alt || ""),
    tags,
    cover: String(body.cover || ""),
    word_count: wordCount,
    read_minutes: readTime,
    body_excerpt: bodyText.slice(0, 2000),
  };

  const model = process.env.OPENAI_MODEL || "gpt-4o";

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an expert SEO analyst for Go Ukraina, a Ukraine humanitarian nonprofit. Analyze the blog post data and return a comprehensive SEO review as JSON.

Return exactly this structure:
{
  "score": <number 0-100>,
  "grade": <"A"|"B"|"C"|"D"|"F">,
  "summary": <"string — 2-3 sentences about overall SEO health">,
  "fields": [
    {
      "field": <"title"|"slug"|"meta_title"|"meta_description"|"excerpt"|"og_image"|"og_image_alt"|"tags"|"body_length"|"read_time">,
      "label": <"Human-readable field name">,
      "current": <"current value as string">,
      "suggested": <"suggested improved value or empty string if no change needed">,
      "score": <number 0-100>,
      "advice": <"specific actionable advice — what to do and why">,
      "severity": <"good"|"warning"|"critical">
    }
  ]
}

Rules per field:
- title: 50-60 chars ideal; should include primary keyword; action/benefit oriented
- slug: lowercase, hyphenated, 3-6 words; matches title keywords; no stop words
- meta_title: 45-62 chars; can differ from title; includes "Go Ukraina" or site name at end
- meta_description: 140-165 chars; includes CTA; naturally includes keywords; summarizes article
- excerpt: 1-2 sentences; standalone readable; used in listings and social
- og_image: should be set (1200×630 ideal); critical for social sharing
- og_image_alt: under 120 chars; describes image visually; WCAG compliant
- tags: 3-5 relevant, specific tags; no generic tags like "Ukraine" alone
- body_length: 400+ words good, 600-1200 ideal for SEO; flag if < 300
- read_time: should be auto-calculated; flag inconsistencies`,
          },
          {
            role: "user",
            content: JSON.stringify(postData),
          },
        ],
      }),
    });

    const raw = await r.text();
    let json;
    try { json = JSON.parse(raw); }
    catch { return res.status(502).json({ error: "OpenAI invalid response" }); }
    if (!r.ok) return res.status(502).json({ error: json.error?.message || raw.slice(0, 300) });

    const content = json.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "Empty AI response" });
    const review = JSON.parse(content);
    review.word_count = wordCount;
    review.read_minutes = readTime;
    return res.status(200).json(review);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
