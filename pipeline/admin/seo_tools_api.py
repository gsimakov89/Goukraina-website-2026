"""SEO tools: sitemap, robots, RSS, llms.txt, AI analyze (parity with api/admin/seo-tools.js)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException

from pipeline.config import SITE_ORIGIN, supabase_project_url


def _service_headers() -> dict[str, str]:
    url = supabase_project_url().strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise HTTPException(503, "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _posts_table() -> str:
    return (os.environ.get("SUPABASE_POSTS_TABLE") or "blog_posts").strip() or "blog_posts"


def _base() -> str:
    return supabase_project_url().rstrip("/") + "/rest/v1"


def get_published_posts() -> list[dict[str, Any]]:
    tbl = _posts_table()
    if not all(c.isalnum() or c == "_" for c in tbl):
        raise HTTPException(500, "Invalid SUPABASE_POSTS_TABLE")
    r = httpx.get(
        f"{_base()}/{tbl}",
        params={
            "select": "slug,title,date,date_label,excerpt,updated_at,tags,cover,seo",
            "status": "eq.published",
            "deleted_at": "is.null",
            "order": "date.desc",
        },
        headers=_service_headers(),
        timeout=60,
    )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text or "posts query failed")
    data = r.json()
    return data if isinstance(data, list) else []


def generate_sitemap(posts: list[dict[str, Any]]) -> str:
    static_pages = [
        ("/", "1.0", "weekly"),
        ("/about/", "0.8", "monthly"),
        ("/donate/", "0.9", "monthly"),
        ("/impact/", "0.8", "monthly"),
        ("/blog/", "0.8", "daily"),
        ("/contact/", "0.7", "monthly"),
        ("/initiatives/reh2o/", "0.8", "monthly"),
        ("/initiatives/power-generators/", "0.7", "monthly"),
        ("/initiatives/advocacy/", "0.7", "monthly"),
        ("/initiatives/ukraine-dreamzzz/", "0.7", "monthly"),
    ]
    now = datetime.now(timezone.utc).date().isoformat()
    rows: list[str] = []
    for loc, priority, changefreq in static_pages:
        rows.append(
            f"  <url>\n    <loc>{SITE_ORIGIN}{loc}</loc>\n    <lastmod>{now}</lastmod>\n"
            f"    <changefreq>{changefreq}</changefreq>\n    <priority>{priority}</priority>\n  </url>"
        )
    for p in posts:
        slug = str(p.get("slug") or "")
        if not slug:
            continue
        mod = p.get("updated_at")
        if isinstance(mod, str) and len(mod) >= 10:
            lastmod = mod[:10]
        else:
            lastmod = str(p.get("date") or now)
        rows.append(
            f"  <url>\n    <loc>{SITE_ORIGIN}/blog/{slug}/</loc>\n    <lastmod>{lastmod}</lastmod>\n"
            f"    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>"
        )
    body = "\n".join(rows)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n'
        '        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"\n'
        '        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 '
        'http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">\n'
        f"{body}\n</urlset>"
    )


def generate_robots() -> str:
    return f"""User-agent: *
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

Sitemap: {SITE_ORIGIN}/sitemap.xml
"""


def _rss_pub_date(date_str: str | None) -> str:
    if date_str and isinstance(date_str, str):
        try:
            return datetime.fromisoformat(date_str + "T12:00:00+00:00").strftime("%a, %d %b %Y %H:%M:%S GMT")
        except Exception:
            pass
    return datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S GMT")


def generate_rss(posts: list[dict[str, Any]]) -> str:
    items_xml: list[str] = []
    for p in posts[:20]:
        title = str(p.get("title") or "")
        slug = str(p.get("slug") or "")
        if not slug:
            continue
        excerpt = str(p.get("excerpt") or "")
        seo = p.get("seo") if isinstance(p.get("seo"), dict) else {}
        meta_desc = str(seo.get("meta_description") or "") if isinstance(seo, dict) else ""
        desc = excerpt or meta_desc
        link = f"{SITE_ORIGIN}/blog/{slug}/"
        pub = _rss_pub_date(str(p.get("date") or "") or None)
        cover = p.get("cover")
        cover_line = ""
        if cover:
            cover_line = f'\n    <enclosure url="{SITE_ORIGIN}/images/{cover}" type="image/jpeg" length="0" />'
        tags = p.get("tags")
        tag_xml = ""
        if isinstance(tags, list):
            tag_xml = "\n    " + "\n    ".join(f"<category>{t}</category>" for t in tags if t)
        items_xml.append(
            f"""  <item>
    <title><![CDATA[{title}]]></title>
    <link>{link}</link>
    <guid isPermaLink="true">{link}</guid>
    <description><![CDATA[{desc}]]></description>
    <pubDate>{pub}</pubDate>{cover_line}
    {tag_xml}
  </item>"""
        )
    items_block = "\n".join(items_xml)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Go Ukraina Field Reports</title>
    <link>{SITE_ORIGIN}/blog/</link>
    <description>Field reports and updates from Go Ukraina — Ukraine humanitarian aid, clean water, and advocacy.</description>
    <language>en-us</language>
    <atom:link href="{SITE_ORIGIN}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <image>
      <url>{SITE_ORIGIN}/images/logo.png</url>
      <title>Go Ukraina</title>
      <link>{SITE_ORIGIN}</link>
    </image>
{items_block}
  </channel>
</rss>"""


def generate_llms(posts: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for p in posts[:10]:
        title = str(p.get("title") or "")
        slug = str(p.get("slug") or "")
        excerpt = str(p.get("excerpt") or "")
        date = str(p.get("date") or "")
        lines.append(f"- [{title}]({SITE_ORIGIN}/blog/{slug}/) — {excerpt or date}")
    post_list = "\n".join(lines)
    return f"""# Go Ukraina

> Go Ukraina is a Los Angeles-based 501(c)(3) nonprofit delivering clean water, emergency power, and advocacy for war-affected Ukraine.

## What we do

- **ReH2O Clean Water**: Solar-powered water purification stations for communities without safe water access.
- **Emergency Power**: Generators and solar panels for hospitals, shelters, and critical infrastructure.
- **Advocacy**: Human rights advocacy for Ukrainian POWs and war-affected civilians.
- **Ukraine Dreamzzz**: Youth education and cultural preservation programs.

## Key pages

- Homepage: {SITE_ORIGIN}/
- About: {SITE_ORIGIN}/about/
- ReH2O Program: {SITE_ORIGIN}/initiatives/reh2o/
- Power Generators: {SITE_ORIGIN}/initiatives/power-generators/
- Advocacy: {SITE_ORIGIN}/initiatives/advocacy/
- Impact & Transparency: {SITE_ORIGIN}/impact/
- Blog / Field Reports: {SITE_ORIGIN}/blog/
- Donate: {SITE_ORIGIN}/donate/
- Contact: {SITE_ORIGIN}/contact/

## Recent field reports

{post_list}

## Facts

- EIN: 88-2011390
- Status: 501(c)(3) public charity
- Location: Los Angeles, California, USA
- Founded to support Ukraine during the ongoing conflict
- All programs have direct Ukrainian partner oversight

## Contact

- Email: info@goukraina.com
- Website: {SITE_ORIGIN}
- Sitemap: {SITE_ORIGIN}/sitemap.xml
- RSS: {SITE_ORIGIN}/blog/rss.xml
"""


def analyze_with_ai(posts: list[dict[str, Any]], api_key: str) -> dict[str, Any]:
    model = (os.environ.get("OPENAI_MODEL") or "gpt-4o-mini").strip()
    post_summary = []
    for p in posts[:5]:
        seo = p.get("seo") if isinstance(p.get("seo"), dict) else {}
        post_summary.append(
            {
                "slug": p.get("slug"),
                "title": p.get("title"),
                "excerpt": p.get("excerpt") or "",
                "tags": p.get("tags") or [],
                "has_cover": bool(p.get("cover")),
                "meta_description": seo.get("meta_description") or "",
                "meta_title": seo.get("meta_title") or "",
            }
        )
    payload = {
        "model": model,
        "temperature": 0.4,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": """You are an expert SEO analyst for a nonprofit website (Go Ukraina — Ukraine humanitarian aid). Analyze the provided site data and return JSON with:
{
  "score": number 0-100,
  "grade": "A"|"B"|"C"|"D"|"F",
  "summary": "string — 2-3 sentence overall assessment",
  "issues": [{"severity":"critical"|"warning"|"info","title":"string","description":"string","fix":"string"}],
  "wins": ["string"],
  "priority_actions": ["string — specific, actionable, numbered"]
}""",
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "site": "goukraina.org",
                        "mission": "Ukraine humanitarian nonprofit — clean water, power, advocacy",
                        "posts": post_summary,
                        "has_sitemap": True,
                        "has_robots": True,
                        "has_llms_txt": True,
                        "has_rss": False,
                        "has_schema_jsonld": True,
                    }
                ),
            },
        ],
    }
    r = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    raw = r.text
    try:
        body = r.json()
    except Exception:
        raise HTTPException(502, raw[:500]) from None
    if r.status_code >= 400:
        err = body.get("error", {}) if isinstance(body, dict) else {}
        msg = err.get("message") if isinstance(err, dict) else raw[:200]
        raise HTTPException(r.status_code, str(msg))
    if not isinstance(body, dict):
        raise HTTPException(502, "Invalid OpenAI response")
    content = (body.get("choices") or [{}])[0].get("message", {}).get("content")
    if not content:
        raise HTTPException(502, "Empty AI response")
    return json.loads(content)


def run_seo_tools_action(action: str) -> dict[str, Any]:
    a = str(action or "").strip()
    posts = get_published_posts()

    if a == "sitemap":
        return {
            "content": generate_sitemap(posts),
            "filename": "sitemap.xml",
            "contentType": "application/xml",
        }
    if a == "robots":
        return {"content": generate_robots(), "filename": "robots.txt", "contentType": "text/plain"}
    if a == "rss":
        return {"content": generate_rss(posts), "filename": "rss.xml", "contentType": "application/rss+xml"}
    if a == "llms":
        return {"content": generate_llms(posts), "filename": "llms.txt", "contentType": "text/plain"}
    if a == "analyze":
        key = (os.environ.get("OPENAI_API_KEY") or "").strip()
        if not key:
            raise HTTPException(503, "OPENAI_API_KEY not set")
        return analyze_with_ai(posts, key)
    if a == "rebuild":
        hook = (os.environ.get("VERCEL_DEPLOY_HOOK_URL") or "").strip()
        if not hook:
            raise HTTPException(503, "VERCEL_DEPLOY_HOOK_URL not set")
        r = httpx.post(hook, timeout=60)
        return {"ok": r.is_success, "status": r.status_code}

    raise HTTPException(400, f"Unknown action: {a}")
