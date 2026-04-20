"""LLM enrichment for blog admin: excerpt, meta, slug, tags, share-image alt."""

from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any


def _strip_html(html: str) -> str:
    t = re.sub(r"<script[^>]*>[\s\S]*?</script>", " ", html, flags=re.I)
    t = re.sub(r"<style[^>]*>[\s\S]*?</style>", " ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:12000]


def _openai_chat(messages: list[dict[str, str]], model: str | None = None) -> str:
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    mdl = model or os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
    body = json.dumps(
        {
            "model": mdl,
            "messages": messages,
            "temperature": 0.3,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            raw = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        err = e.read().decode(errors="replace")
        raise RuntimeError(f"OpenAI HTTP {e.code}: {err[:500]}") from e
    choices = raw.get("choices") or []
    if not choices:
        raise RuntimeError("OpenAI returned no choices")
    return str(choices[0].get("message", {}).get("content") or "")


def enrich_post(
    *,
    title: str,
    body_html: str,
    excerpt: str,
    slug: str,
    slug_manual: bool,
    tags: list[str],
    share_image_hint: str,
) -> dict[str, Any]:
    """Return JSON fields for CMS: excerpt, meta_description, meta_title, tags, suggested_slug, og_image_alt."""
    plain = _strip_html(body_html)
    sys_prompt = (
        "You assist a humanitarian nonprofit blog (Go Ukraina, Ukraine aid). "
        "Respond with a single JSON object only. Be factual, neutral, and concise. "
        "Follow WCAG: alt text under 140 characters, describes the image purpose for screen readers."
    )
    user: dict[str, Any] = {
        "title": title,
        "article_plain_text_excerpt": plain[:8000],
        "existing_excerpt": excerpt,
        "current_slug": slug,
        "slug_manual": slug_manual,
        "existing_tags": tags,
        "share_image_url_or_path": share_image_hint,
    }
    schema_hint = (
        'JSON keys: "excerpt" (string, ~1–2 sentences for cards), '
        '"meta_description" (string, 140–165 chars for SERP), '
        '"meta_title" (string, optional shorter SERP title or empty to use article title), '
        '"tags" (array of 2–6 short strings, Title Case topics), '
        '"suggested_slug" (string, lowercase kebab-case, max 72 chars; empty if slug_manual is true), '
        '"og_image_alt" (string, concise alt for the social preview image; use share context or article if unknown).'
    )
    messages = [
        {"role": "system", "content": sys_prompt},
        {
            "role": "user",
            "content": json.dumps(user)
            + "\n\n"
            + schema_hint
            + "\nIf slug_manual is true, set suggested_slug to an empty string. "
            "If slug_manual is false, suggest one SEO-friendly slug from title and content that is unique-styled (kebab-case).",
        },
    ]
    raw = _openai_chat(messages)
    data = json.loads(raw)
    out: dict[str, Any] = {
        "excerpt": str(data.get("excerpt") or "").strip(),
        "meta_description": str(data.get("meta_description") or "").strip(),
        "meta_title": str(data.get("meta_title") or "").strip(),
        "tags": [str(t).strip() for t in (data.get("tags") or []) if str(t).strip()][:8],
        "suggested_slug": str(data.get("suggested_slug") or "").strip().lower()[:120],
        "og_image_alt": str(data.get("og_image_alt") or "").strip()[:200],
    }
    if slug_manual:
        out["suggested_slug"] = ""
    # Normalize slug to safe pattern
    if out["suggested_slug"]:
        out["suggested_slug"] = re.sub(r"[^a-z0-9-]+", "-", out["suggested_slug"]).strip("-")
    return out


def alt_for_image_context(*, article_title: str, image_hint: str, body_html: str) -> str:
    """Short alt for a specific image when only URL/path is known."""
    key = (os.environ.get("OPENAI_API_KEY") or "").strip()
    if not key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    plain = _strip_html(body_html)[:4000]
    sys_prompt = "Reply with JSON: {\"alt\": \"...\"} only. Alt under 120 chars, describes image for blind users, WCAG 2.x."
    user = f"title: {article_title}\nimage: {image_hint}\nbody_excerpt: {plain[:2000]}"
    raw = _openai_chat(
        [{"role": "system", "content": sys_prompt}, {"role": "user", "content": user}],
    )
    data = json.loads(raw)
    return str(data.get("alt") or "").strip()[:200]
