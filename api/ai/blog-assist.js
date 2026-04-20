/**
 * POST /api/ai/blog-assist — AI blog writing assistant (auth)
 * body: {
 *   action: 'outline' | 'draft' | 'expand' | 'improve' | 'intro' | 'conclusion',
 *   context: string,   // existing content or topic
 *   prompt: string,    // user instruction
 *   tone: string,      // optional: 'professional' | 'personal' | 'urgent'
 * }
 * Returns: { content: string (HTML) }
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

const ACTION_PROMPTS = {
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

  const action = String(body.action || "draft").trim();
  const context = String(body.context || "").trim().slice(0, 8000);
  const prompt = String(body.prompt || "").trim();
  const tone = String(body.tone || "professional").trim();

  const promptFn = ACTION_PROMPTS[action];
  if (!promptFn) return res.status(400).json({ error: `Unknown action: ${action}. Use: ${Object.keys(ACTION_PROMPTS).join(", ")}` });

  const userPrompt = promptFn(context, prompt);

  try {
    const model = process.env.OPENAI_MODEL || "gpt-4o";
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
    let json;
    try { json = JSON.parse(raw); }
    catch { return res.status(502).json({ error: "OpenAI invalid response", detail: raw.slice(0, 200) }); }
    if (!r.ok) return res.status(502).json({ error: json.error?.message || raw.slice(0, 300) });

    const content = json.choices?.[0]?.message?.content || "";
    return res.status(200).json({ content: content.trim(), action, tokens_used: json.usage?.total_tokens || 0 });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
