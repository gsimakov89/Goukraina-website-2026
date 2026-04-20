"""Full-post SEO review via OpenAI (matches api/ai/seo-review.js)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

from pipeline.ai.enrich import _strip_html


def _estimate_read_minutes(html: str) -> int:
    words = len(_strip_html(html).split())
    return max(1, (words + 199) // 200)


def _openai_json(messages: list[dict[str, str]], model: str | None = None) -> dict[str, Any]:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    mdl = model or os.environ.get("OPENAI_MODEL", "gpt-4o")
    body = json.dumps(
        {
            "model": mdl,
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
            "messages": messages,
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
    content = str(choices[0].get("message", {}).get("content") or "")
    return json.loads(content)


def run_seo_review(body: dict[str, Any]) -> dict[str, Any]:
    title = str(body.get("title") or "").strip()
    if not title:
        raise ValueError("title required")

    seo = body.get("seo") if isinstance(body.get("seo"), dict) else {}
    body_html = str(body.get("body_html") or "")
    body_text = _strip_html(body_html)[:6000]
    word_count = len([w for w in body_text.split() if w])
    tags = body.get("tags") if isinstance(body.get("tags"), list) else []
    tags = [str(t) for t in tags]
    read_time = _estimate_read_minutes(body_html)

    post_data = {
        "title": title,
        "slug": str(body.get("slug") or ""),
        "excerpt": str(body.get("excerpt") or ""),
        "meta_title": str(seo.get("meta_title") or ""),
        "meta_description": str(seo.get("meta_description") or ""),
        "og_image": str(seo.get("og_image") or body.get("cover") or ""),
        "og_image_alt": str(seo.get("og_image_alt") or ""),
        "tags": tags,
        "cover": str(body.get("cover") or ""),
        "word_count": word_count,
        "read_minutes": read_time,
        "body_excerpt": body_text[:2000],
    }

    system = """You are an expert SEO analyst for Go Ukraina, a Ukraine humanitarian nonprofit. Analyze the blog post data and return a comprehensive SEO review as JSON.

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
- read_time: should be auto-calculated; flag inconsistencies"""

    review = _openai_json(
        [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(post_data)},
        ]
    )
    review["word_count"] = word_count
    review["read_minutes"] = read_time
    return review
