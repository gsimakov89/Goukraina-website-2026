"""AI blog writing assistant (matches api/ai/blog-assist.js)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

SYSTEM_PROMPT = """You are a compassionate, expert content writer for Go Ukraina — a Los Angeles-based 501(c)(3) nonprofit delivering clean water (ReH2O program), emergency power generators, and human rights advocacy for war-affected Ukraine.

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
- Never include <html>, <head>, <body> wrapper tags"""

ACTIONS: dict[str, Any] = {
    "outline": lambda ctx, prompt: (
        f'Create a detailed blog post outline for Go Ukraina. Topic/prompt: "{prompt or ctx}"\n\n'
        "Return an HTML outline with H2 section headings and bullet points (<ul><li>) for sub-points under each section. "
        "Include 5-8 major sections. Add a brief note under each section about what content to include. "
        "End with a strong call-to-action section about donating or sharing."
    ),
    "draft": lambda ctx, prompt: (
        f'Write a complete, SEO-optimized blog post for Go Ukraina.\n\nTopic/prompt: "{prompt or ctx}"\n'
        f'Existing outline or notes: "{ctx}"\n\n'
        "Requirements:\n- 600-900 words\n- 5-7 sections with H2 headings\n"
        "- Opening paragraph that hooks the reader with a human story or striking fact\n"
        "- Closing paragraph with clear CTA to donate at goukraina.org/donate\n"
        "- Naturally mention Ukraine, clean water/power/advocacy as appropriate\n\n"
        "Return full HTML article body (no wrapper tags)."
    ),
    "expand": lambda ctx, prompt: (
        f"Expand and enrich this section of a Go Ukraina blog post. Make it more compelling, specific, and SEO-rich.\n\n"
        f'User instruction: "{prompt}"\n\nExisting content to expand:\n{ctx}\n\n'
        "Return the improved HTML version of this section only."
    ),
    "improve": lambda ctx, prompt: (
        f'Improve the writing quality, clarity, and SEO of this Go Ukraina blog content.\n\n'
        f'User instruction: "{prompt or "Improve clarity, engagement, and SEO without changing the meaning"}"\n\n'
        f"Content to improve:\n{ctx}\n\n"
        "Return the improved HTML. Keep the same structure but strengthen the language, fix passive voice, add specificity, and improve readability."
    ),
    "intro": lambda ctx, prompt: (
        f'Write a powerful opening paragraph (intro) for a Go Ukraina blog post.\n\nTopic: "{prompt or ctx}"\n\n'
        "Requirements:\n- 3-4 sentences max\n- Start with a human moment, striking fact, or urgent situation\n"
        "- Draw the reader in immediately\n- Naturally lead into the article content\n\n"
        "Return a single <p> tag with the intro."
    ),
    "conclusion": lambda ctx, prompt: (
        f'Write a compelling conclusion section for a Go Ukraina blog post.\n\nArticle context: "{ctx}"\n'
        f'User instruction: "{prompt or "Write a strong conclusion"}"\n\n'
        "Requirements:\n- H2 heading: \"How You Can Help\" or similar\n- 2-3 paragraphs\n- Summarize impact\n"
        "- Clear donation CTA linking to goukraina.org/donate\n- Urgency without being manipulative\n\n"
        "Return HTML with <h2> and <p> tags."
    ),
}


def _openai_text(system: str, user: str, tone: str) -> str:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    mdl = os.environ.get("OPENAI_MODEL", "gpt-4o")
    sys_content = system + (f"\n\nTone: {tone}" if tone and tone != "professional" else "")
    body = json.dumps(
        {
            "model": mdl,
            "temperature": 0.6,
            "max_tokens": 2000,
            "messages": [
                {"role": "system", "content": sys_content},
                {"role": "user", "content": user[:8000]},
            ],
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            raw = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode(errors="replace")
        raise RuntimeError(f"OpenAI HTTP {e.code}: {err[:500]}") from e
    choices = raw.get("choices") or []
    if not choices:
        raise RuntimeError("OpenAI returned no choices")
    return str(choices[0].get("message", {}).get("content") or "").strip()


def run_blog_assist(body: dict[str, Any]) -> dict[str, Any]:
    action = str(body.get("action") or "draft").strip()
    if action not in ACTIONS:
        raise ValueError(
            f"Unknown action: {action}. Use: {', '.join(sorted(ACTIONS.keys()))}"
        )
    ctx = str(body.get("context") or "").strip()[:8000]
    prompt = str(body.get("prompt") or "").strip()
    tone = str(body.get("tone") or "professional").strip()
    fn = ACTIONS[action]
    user_prompt = fn(ctx, prompt)
    content = _openai_text(SYSTEM_PROMPT, user_prompt, tone)
    return {"content": content, "action": action}
