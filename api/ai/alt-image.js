/**
 * POST /api/ai/alt-image — JSON { title, body_html, image_hint } (auth)
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
  const title = String(body.title || "").trim();
  const imageHint = String(body.image_hint || "").trim();
  if (!title) return res.status(400).json({ error: "title required" });

  const plain = String(body.body_html || "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

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
    const json = JSON.parse(raw);
    if (!r.ok) {
      return res.status(502).json({ error: json.error?.message || raw.slice(0, 300) });
    }
    const content = json.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: "Empty response" });
    const data = JSON.parse(content);
    const alt = String(data.alt || "").trim().slice(0, 200);
    return res.status(200).json({ og_image_alt: alt });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
