import { requireAdmin } from "./admin_auth.ts";
import { json, readJsonBody } from "./http.ts";
import { getOpenAIKey, getOpenAIModel } from "./openai_key.ts";

export async function handleAiEnrich(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const gate = await requireAdmin(req);
  if (gate) return gate;

  const key = await getOpenAIKey();
  if (!key) {
    return json({
      error: "OpenAI key not configured. Add it in Admin → Settings → API Keys, or set OPENAI_API_KEY.",
    }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req)) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const model = getOpenAIModel();
  const title = String(body.title || "").trim();
  if (!title) return json({ error: "title required" }, 400);

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
    let j: { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    try {
      j = JSON.parse(raw);
    } catch {
      return json({ error: "OpenAI invalid response", detail: raw.slice(0, 200) }, 502);
    }
    if (!r.ok) {
      return json({ error: j.error?.message || raw.slice(0, 300) }, 502);
    }
    const content = j.choices?.[0]?.message?.content;
    if (!content) return json({ error: "Empty OpenAI content" }, 502);
    const data = JSON.parse(content) as Record<string, unknown>;
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
    return json(out);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
}

function stripHtml(html: string) {
  return String(html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateReadTime(html: string) {
  const words = stripHtml(html).split(/\s+/).length;
  return Math.max(1, Math.ceil(words / 200));
}

export async function handleAiSeoReview(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const gate = await requireAdmin(req);
  if (gate) return gate;

  const key = await getOpenAIKey();
  if (!key) {
    return json({
      error: "OpenAI key not configured. Add it in Admin → Settings → API Keys, or set OPENAI_API_KEY.",
    }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req)) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const title = String(body.title || "").trim();
  if (!title) return json({ error: "title required" }, 400);

  const seo = body.seo && typeof body.seo === "object" ? body.seo as Record<string, unknown> : {};
  const bodyText = stripHtml(String(body.body_html || "")).slice(0, 6000);
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  const tags = Array.isArray(body.tags) ? body.tags : [];
  const readTime = estimateReadTime(String(body.body_html || ""));

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

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";

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
    let json0: { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    try {
      json0 = JSON.parse(raw);
    } catch {
      return json({ error: "OpenAI invalid response" }, 502);
    }
    if (!r.ok) return json({ error: json0.error?.message || raw.slice(0, 300) }, 502);

    const content = json0.choices?.[0]?.message?.content;
    if (!content) return json({ error: "Empty AI response" }, 502);
    const review = JSON.parse(content) as Record<string, unknown>;
    review.word_count = wordCount;
    review.read_minutes = readTime;
    return json(review);
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
}

const SYSTEM_PROMPT = `You are a compassionate, expert content writer for Go Ukraina — a Los Angeles-based 501(c)(3) nonprofit delivering clean water (ReH2O program), emergency power generators, and human rights advocacy for war-affected Ukraine.

Writing style:
- Authoritative but deeply human; readers care about Ukraine
- Factual and specific — use numbers, locations, names when provided
- Active voice; avoid passive bureaucratic language
- SEO-aware: naturally incorporate relevant keywords without stuffing
- Accessible to general audience (no jargon)
- Each section should have a clear H2 heading
- Paragraph length: 3-4 sentences max

HTML output format:
- Use <h2> for main sections, <h3> for sub-sections
- Use <p> for paragraphs
- Use <ul><li> for lists
- Use <blockquote> for pull quotes
- Never use markdown — pure HTML only
- Never include <html>, <head>, <body> wrapper tags`;

const ACTION_PROMPTS: Record<string, (ctx: string, prompt: string) => string> = {
  outline: (ctx, prompt) =>
    `Create a detailed blog post outline for Go Ukraina. Topic/prompt: "${prompt || ctx}"\n\nReturn an HTML outline with H2 section headings and bullet points (<ul><li>) for sub-points under each section. Include 5-8 major sections. Add a brief note under each section about what content to include. End with a strong call-to-action section about donating or sharing.`,

  draft: (ctx, prompt) =>
    `Write a complete, SEO-optimized blog post for Go Ukraina.\n\nTopic/prompt: "${prompt || ctx}"\nExisting outline or notes: "${ctx}"\n\nRequirements:\n- 600-900 words\n- 5-7 sections with H2 headings\n- Opening paragraph that hooks the reader with a human story or striking fact\n- Closing paragraph with clear CTA to donate at goukraina.org/donate\n- Naturally mention Ukraine, clean water/power/advocacy as appropriate\n\nReturn full HTML article body (no wrapper tags).`,

  expand: (ctx, prompt) =>
    `Expand and enrich this section of a Go Ukraina blog post. Make it more compelling, specific, and SEO-rich.\n\nUser instruction: "${prompt}"\n\nExisting content to expand:\n${ctx}\n\nReturn the improved HTML version of this section only.`,

  improve: (ctx, prompt) =>
    `Improve the writing quality, clarity, and SEO of this Go Ukraina blog content.\n\nUser instruction: "${prompt || "Improve clarity, engagement, and SEO without changing the meaning"}"\n\nContent to improve:\n${ctx}\n\nReturn the improved HTML. Keep the same structure but strengthen the language, fix passive voice, add specificity, and improve readability.`,

  intro: (ctx, prompt) =>
    `Write a powerful opening paragraph (intro) for a Go Ukraina blog post.\n\nTopic: "${prompt || ctx}"\n\nRequirements:\n- 3-4 sentences max\n- Start with a human moment, striking fact, or urgent situation\n- Draw the reader in immediately\n- Naturally lead into the article content\n\nReturn a single <p> tag with the intro.`,

  conclusion: (ctx, prompt) =>
    `Write a compelling conclusion section for a Go Ukraina blog post.\n\nArticle context: "${ctx}"\nUser instruction: "${prompt || "Write a strong conclusion"}"\n\nRequirements:\n- H2 heading: "How You Can Help" or similar\n- 2-3 paragraphs\n- Summarize impact\n- Clear donation CTA linking to goukraina.org/donate\n- Urgency without being manipulative\n\nReturn HTML with <h2> and <p> tags.`,
};

export async function handleAiBlogAssist(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const gate = await requireAdmin(req);
  if (gate) return gate;

  const key = await getOpenAIKey();
  if (!key) {
    return json({
      error: "OpenAI key not configured. Add it in Admin → Settings → API Keys, or set OPENAI_API_KEY.",
    }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req)) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const action = String(body.action || "draft").trim();
  const context = String(body.context || "").trim().slice(0, 8000);
  const prompt = String(body.prompt || "").trim();
  const tone = String(body.tone || "professional").trim();

  const promptFn = ACTION_PROMPTS[action];
  if (!promptFn) {
    return json({ error: `Unknown action: ${action}. Use: ${Object.keys(ACTION_PROMPTS).join(", ")}` }, 400);
  }

  const userPrompt = promptFn(context, prompt);

  try {
    const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o";
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.6,
        max_tokens: 2000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT + (tone !== "professional" ? `\n\nTone: ${tone}` : "") },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    const raw = await r.text();
    let j: { choices?: { message?: { content?: string } }[]; error?: { message?: string }; usage?: { total_tokens?: number } };
    try {
      j = JSON.parse(raw);
    } catch {
      return json({ error: "OpenAI invalid response", detail: raw.slice(0, 200) }, 502);
    }
    if (!r.ok) return json({ error: j.error?.message || raw.slice(0, 300) }, 502);

    const content = j.choices?.[0]?.message?.content || "";
    return json({ content: content.trim(), action, tokens_used: j.usage?.total_tokens || 0 });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
}

export async function handleAiAltImage(req: Request): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const gate = await requireAdmin(req);
  if (gate) return gate;

  const key = await getOpenAIKey();
  if (!key) {
    return json({
      error: "OpenAI key not configured. Add it in Admin → Settings → API Keys, or set OPENAI_API_KEY.",
    }, 503);
  }

  let body: Record<string, unknown>;
  try {
    body = (await readJsonBody(req)) as Record<string, unknown>;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const title = String(body.title || "").trim();
  const imageHint = String(body.image_hint || "").trim();
  if (!title) return json({ error: "title required" }, 400);

  const plain = String(body.body_html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  const model = getOpenAIModel();

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: 'Reply JSON only: {"alt":"..."} — WCAG 2.x alt under 120 chars for screen readers.',
          },
          {
            role: "user",
            content: `title: ${title}\nimage: ${imageHint}\nbody_excerpt: ${plain.slice(0, 2000)}`,
          },
        ],
      }),
    });
    const raw = await r.text();
    const j = JSON.parse(raw);
    if (!r.ok) {
      return json({ error: j.error?.message || raw.slice(0, 300) }, 502);
    }
    const content = j.choices?.[0]?.message?.content;
    if (!content) return json({ error: "Empty response" }, 502);
    const data = JSON.parse(content);
    const alt = String(data.alt || "").trim().slice(0, 200);
    return json({ og_image_alt: alt });
  } catch (e) {
    return json({ error: (e as Error).message || String(e) }, 500);
  }
}
