/**
 * POST /api/ai/enrich — OpenAI JSON enrichment (auth)
 */
import { requireAdmin } from "../_lib/admin_auth.mjs";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  const { getOpenAIKey } = await import("../_lib/ai_keys.mjs");
  const key = await getOpenAIKey();
  if (!key) {
    return res.status(503).json({ error: "OpenAI key not configured. Add it in Admin → Settings → API Keys, or set OPENAI_API_KEY." });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const title = String(body.title || "").trim();
  if (!title) return res.status(400).json({ error: "title required" });

  const slugManual = !!body.slug_manual;
  const userPayload = {
    title,
    article_plain_text_excerpt: String(body.body_html || "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000),
    existing_excerpt: String(body.excerpt || ""),
    current_slug: String(body.slug || ""),
    slug_manual: slugManual,
    existing_tags: Array.isArray(body.tags) ? body.tags : [],
    share_image_url_or_path: String(body.share_image_hint || ""),
  };

  const schema =
    'JSON keys: "excerpt", "meta_description" (140-165 chars), "meta_title" (optional), "tags" (array), "suggested_slug" (kebab-case, empty if slug_manual), "og_image_alt".';

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You assist Go Ukraina (humanitarian aid in Ukraine). Reply JSON only. WCAG: og_image_alt under 120 chars.",
          },
          {
            role: "user",
            content: `${JSON.stringify(userPayload)}\n\n${schema}`,
          },
        ],
      }),
    });
    const raw = await r.text();
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      return res.status(502).json({ error: "OpenAI invalid response", detail: raw.slice(0, 200) });
    }
    if (!r.ok) {
      return res.status(502).json({ error: json.error?.message || raw.slice(0, 300) });
    }
    const content = json.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "Empty OpenAI content" });
    const data = JSON.parse(content);
    let suggested = String(data.suggested_slug || "")
      .trim()
      .toLowerCase()
      .slice(0, 120)
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "");
    if (slugManual) suggested = "";
    const out = {
      excerpt: String(data.excerpt || "").trim(),
      meta_description: String(data.meta_description || "").trim(),
      meta_title: String(data.meta_title || "").trim(),
      tags: (Array.isArray(data.tags) ? data.tags : []).map((t) => String(t).trim()).filter(Boolean).slice(0, 8),
      suggested_slug: suggested,
      og_image_alt: String(data.og_image_alt || "").trim().slice(0, 200),
    };
    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
