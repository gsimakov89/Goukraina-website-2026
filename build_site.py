#!/usr/bin/env python3
"""Generate static HTML for goukraina.org redesign. Run: python3 build_site.py"""

from __future__ import annotations

import html as html_lib
import json
import os
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=True)
except ImportError:
    pass
OUT = ROOT / "public"


def _fetch_site_settings() -> dict:
    """Load site_settings from Supabase at build time (best-effort, never fails build)."""
    try:
        import httpx
        url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        if not url or not key:
            return {}
        r = httpx.get(
            f"{url}/rest/v1/site_settings?select=key,value",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=8,
        )
        if r.status_code != 200:
            return {}
        rows = r.json()
        return {row["key"]: row["value"] for row in rows if "key" in row}
    except Exception:
        return {}


def _fetch_default_author() -> dict:
    """Load default author profile from Supabase at build time."""
    try:
        import httpx
        url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        if not url or not key:
            return {}
        r = httpx.get(
            f"{url}/rest/v1/author_profiles?is_default=eq.true&limit=1",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=8,
        )
        if r.status_code != 200:
            return {}
        rows = r.json()
        return rows[0] if rows else {}
    except Exception:
        return {}


_SITE_SETTINGS: dict = _fetch_site_settings()
_DEFAULT_AUTHOR: dict = _fetch_default_author()


def _fetch_nav_items() -> list[dict]:
    """Load active nav_items from Supabase for primary desktop nav (best-effort)."""
    try:
        import httpx

        url = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
        if not url or not key:
            return []
        r = httpx.get(
            f"{url}/rest/v1/nav_items?select=label,href,target,sort_order,nav_group,is_active"
            "&is_active=eq.true&order=sort_order.asc",
            headers={"apikey": key, "Authorization": f"Bearer {key}"},
            timeout=8,
        )
        if r.status_code != 200:
            return []
        rows = r.json()
        return rows if isinstance(rows, list) else []
    except Exception:
        return []


_NAV_ITEMS: list[dict] = _fetch_nav_items()


def _tracking_head_snippets() -> str:
    """Build tracking pixel / GTM snippets for <head> from site_settings."""
    tracking = _SITE_SETTINGS.get("tracking") or {}
    if not isinstance(tracking, dict):
        return ""
    parts: list[str] = []
    gtm = (tracking.get("gtm_id") or "").strip()
    if gtm:
        parts.append(
            f'  <!-- Google Tag Manager -->\n'
            f'  <script>(function(w,d,s,l,i){{w[l]=w[l]||[];w[l].push({{"gtm.start":new Date().getTime(),event:"gtm.js"}});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!="dataLayer"?"&l="+l:"";j.async=true;j.src="https://www.googletagmanager.com/gtm.js?id="+i+dl;f.parentNode.insertBefore(j,f);}})(window,document,"script","dataLayer","{gtm}");</script>\n'
            f'  <!-- End Google Tag Manager -->'
        )
    fb = (tracking.get("fb_pixel") or "").strip()
    if fb:
        parts.append(
            f'  <!-- Meta Pixel -->\n'
            f'  <script>!function(f,b,e,v,n,t,s){{if(f.fbq)return;n=f.fbq=function(){{n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version="2.0";n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}}(window,document,"script","https://connect.facebook.net/en_US/fbevents.js");fbq("init","{fb}");fbq("track","PageView");</script>\n'
            f'  <noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id={fb}&ev=PageView&noscript=1"/></noscript>\n'
            f'  <!-- End Meta Pixel -->'
        )
    custom = (tracking.get("custom_head") or "").strip()
    if custom:
        parts.append(f"  {custom}")
    return "\n".join(parts)


def _newsletter_popup_script(base_prefix: str) -> str:
    """Return <script> tag for newsletter popup if enabled in settings."""
    popup = _SITE_SETTINGS.get("newsletter_popup") or {}
    if not isinstance(popup, dict) or not popup.get("enabled"):
        return ""
    return f'  <script src="{base_prefix}assets/js/newsletter-popup.js" defer></script>'
SITE_ORIGIN = "https://www.goukraina.org"
IMG = SITE_ORIGIN
# Static photos/video posters live next to CSS/JS so Vercel serves them reliably (see public/assets/img/).
SITE_MEDIA = "/assets/img"
# Official Ukraine Reconstruction Summit (URS) — primary destination for “Summit” nav.
URS_SUMMIT_URL = "https://www.ursummit.com/"

# Browser UI / PWA hints (matches --uk-blue-deep)
SITE_THEME_COLOR = "#1a2744"
# Bump when main.css changes materially so local/prod browsers pick up new styles.
CSS_ASSET_VERSION = "20260425"
# X/Twitter handle for twitter:site (no @ in attribute value per Twitter Card docs)
TWITTER_SITE = "goukraina"

# Canonical social profile URLs (footer, JSON-LD sameAs, CTAs).
SOCIAL_INSTAGRAM = "https://www.instagram.com/goukraina/"
SOCIAL_FACEBOOK = "https://www.facebook.com/go.ukraina.inc?mibextid=wwXIfr"
SOCIAL_LINKEDIN = "https://www.linkedin.com/company/go-ukraine-inc/"
SOCIAL_YOUTUBE = "https://www.youtube.com/@goukraina-H2O"

ORG_NODE_ID = f"{SITE_ORIGIN}/#organization"
AUTHOR_NODE_ID = f"{SITE_ORIGIN}/#author-german-simakovski"

# Ukraine admin outline from johan/world.geo.json (UKR). Use with viewBox="0 0 200 160".
UKR_OUTLINE_PATH_D = (
    "M 107.51 7.58 L 111.5 8.36 L 114.2 3.97 L 117.45 4.94 L 128.53 3.08 L 135.36 14.0 L 132.69 17.91 L "
    "133.57 23.9 L 142.09 24.83 L 145.9 33.2 L 145.66 36.99 L 159.24 43.78 L 167.44 40.72 L 174.03 49.76 L "
    "180.28 49.55 L 196.03 55.83 L 196.15 61.49 L 191.81 71.6 L 194.18 82.24 L 192.49 88.67 L 182.15 90.08 L "
    "176.64 95.47 L 176.31 104.04 L 167.77 105.59 L 160.66 111.83 L 150.66 112.85 L 141.45 120.04 L 142.08 132.04 L "
    "147.31 136.69 L 158.21 135.53 L 156.12 142.42 L 144.42 145.76 L 129.92 156.92 L 123.97 153.0 L 126.33 143.93 L "
    "114.65 138.28 L 116.54 134.59 L 126.77 128.17 L 123.67 123.75 L 107.06 118.88 L 106.33 111.68 L 96.43 114.06 L "
    "92.46 124.68 L 84.18 138.94 L 79.34 135.63 L 74.32 138.74 L 69.55 135.18 L 72.24 133.09 L 74.1 126.47 L "
    "77.03 120.31 L 76.27 116.86 L 78.51 115.32 L 79.56 117.99 L 85.86 118.56 L 88.69 117.13 L 86.7 115.17 L "
    "87.45 112.3 L 83.72 107.39 L 82.17 99.33 L 78.28 96.17 L 79.05 89.63 L 74.22 84.44 L 69.82 83.72 L 61.95 77.71 L "
    "54.85 79.62 L 52.3 82.46 L 47.79 82.46 L 45.1 86.97 L 37.21 88.82 L 33.56 91.78 L 28.6 87.07 L 21.75 87.0 L "
    "15.14 84.86 L 10.52 88.99 L 9.78 83.82 L 3.85 78.57 L 5.93 70.79 L 8.9 65.77 L 11.23 66.9 L 8.47 58.23 L "
    "18.18 42.18 L 23.48 39.93 L 24.62 34.52 L 19.25 17.68 L 24.36 16.92 L 30.22 11.69 L 38.49 11.27 L 49.29 12.78 L "
    "61.22 17.41 L 69.63 17.8 L 73.65 20.58 L 77.66 17.22 L 80.46 21.73 L 90.11 20.81 L 94.36 22.67 L 95.04 12.96 L "
    "98.34 8.72 L 107.51 7.58 Z"
)


def blog_article_iso_datetime(date_yyyy_mm_dd: str) -> str:
    """Stable ISO-8601 instant for article meta + JSON-LD (date-only inputs get noon UTC)."""
    s = (date_yyyy_mm_dd or "").strip()
    if len(s) >= 10 and "T" not in s:
        return f"{s[:10]}T12:00:00Z"
    return s


def blog_post_extra_graph(post_url: str, post_headline: str) -> list[dict]:
    """Person + BreadcrumbList for single post pages (merged into main @graph)."""
    blog_index = f"{SITE_ORIGIN}/blog"
    return [
        {
            "@type": "Person",
            "@id": AUTHOR_NODE_ID,
            "name": "German Simakovski",
            "jobTitle": "Communications",
            "worksFor": {"@id": ORG_NODE_ID},
            "email": "info@goukraina.com",
        },
        {
            "@type": "BreadcrumbList",
            "@id": f"{post_url}#breadcrumb",
            "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": f"{SITE_ORIGIN}/"},
                {"@type": "ListItem", "position": 2, "name": "Field reports", "item": blog_index},
                {"@type": "ListItem", "position": 3, "name": post_headline, "item": post_url},
            ],
        },
    ]


def html_blog_author_block() -> str:
    """Generate author card using Supabase profile if available, else default."""
    a = _DEFAULT_AUTHOR
    name = html_lib.escape(str(a.get("name") or "German Simakovski"))
    role = html_lib.escape(str(a.get("role") or "Communications · Go Ukraina"))
    email = html_lib.escape(str(a.get("email") or "info@goukraina.com"))
    bio = html_lib.escape(str(a.get("bio") or ""))
    initials = html_lib.escape(str(a.get("initials") or "GS")[:4])
    avatar_url = html_lib.escape(str(a.get("avatar_url") or ""))
    twitter = html_lib.escape(str(a.get("twitter") or ""))
    linkedin = html_lib.escape(str(a.get("linkedin") or ""))

    avatar_el = (
        f'<img class="blog-author-block__avatar-img" src="{avatar_url}" alt="{name}" width="56" height="56" loading="lazy" />'
        if avatar_url
        else f'<div class="blog-author-block__avatar" aria-hidden="true">{initials}</div>'
    )
    bio_el = f'<p class="blog-author-block__bio">{bio}</p>' if bio else ""
    twitter_el = (
        f'<a class="blog-author-block__social" href="https://twitter.com/{twitter}" target="_blank" rel="noopener noreferrer" itemprop="sameAs" aria-label="{name} on X/Twitter">X</a>'
        if twitter
        else ""
    )
    linkedin_el = (
        f'<a class="blog-author-block__social" href="{linkedin}" target="_blank" rel="noopener noreferrer" itemprop="sameAs" aria-label="{name} on LinkedIn">LinkedIn</a>'
        if linkedin
        else ""
    )
    socials = "".join(filter(None, [twitter_el, linkedin_el]))
    socials_wrap = f'<div class="blog-author-block__socials">{socials}</div>' if socials else ""

    return f"""      <section class="blog-author-block reveal" aria-labelledby="article-author-heading">
        <h2 id="article-author-heading" class="visually-hidden">About the author</h2>
        <div class="blog-author-block__card" itemprop="author" itemscope itemtype="https://schema.org/Person">
          {avatar_el}
          <div class="blog-author-block__info">
            <p class="blog-author-block__name"><span itemprop="name">{name}</span></p>
            <p class="blog-author-block__role"><span itemprop="jobTitle">{role}</span></p>
            {bio_el}
            <a class="blog-author-block__contact" href="mailto:{email}" itemprop="email">{email}</a>
            {socials_wrap}
          </div>
        </div>
      </section>
"""


with open(ROOT / "goukraina-scrape.json", encoding="utf-8") as f:
    SCRAPE: dict = json.load(f)

# ReH2O initiative: MP4s under public/assets/img/videos/.
REH2O_VIDEOS_BASE = f"{SITE_MEDIA}/videos"

# Power generators initiative — branded placeholder until field photography is supplied (swap URL in one place).
POWER_INIT_PLACEHOLDER = (
    "https://placehold.co/1920x960/142236/f0d060/png?"
    "text=Field+photo+placeholder+%E2%80%94+generators+for+Ukraine"
)


def ai_prompt_image(prompt: str, width: int = 800, height: int = 500) -> str:
    """Prompt-rendered placeholder via pollinations.ai — swap for static CDN assets when available."""
    return f"https://image.pollinations.ai/prompt/{quote(prompt, safe='')}?width={width}&height={height}&nologo=true"


def blog_cover_url(entry: dict[str, object]) -> str:
    """Hero/cover: full URL (e.g. Supabase Storage), site path (/…), or filename under /assets/img/."""
    rel = entry.get("cover")
    if isinstance(rel, str) and rel.strip():
        s = rel.strip()
        if s.startswith("http://") or s.startswith("https://"):
            return s
        if s.startswith("/"):
            return SITE_ORIGIN + s
        return f"{SITE_ORIGIN}{SITE_MEDIA}/{s}"
    return f"{SITE_ORIGIN}{SITE_MEDIA}/opengraph.jpg"


def blog_share_image_url(entry: dict[str, object]) -> str:
    """Open Graph / Twitter Card / JSON-LD image: seo og_image if set, else hero cover."""
    raw = str(entry.get("og_image") or "").strip()
    if raw:
        if raw.startswith("http://") or raw.startswith("https://"):
            return raw
        if raw.startswith("/"):
            return SITE_ORIGIN + raw
        return f"{SITE_ORIGIN}{SITE_MEDIA}/{raw.lstrip('/')}"
    return blog_cover_url(entry)


# Inline SVGs for blog share controls (currentColor; crisp at 16–20px)
_SVG_BLOG_X = (
    '<svg class="blog-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<path fill="currentColor" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>'
)
_SVG_BLOG_LI = (
    '<svg class="blog-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<path fill="currentColor" d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22 0H2C.9 0 0 .9 0 2v20c0 1.1.9 2 2 2h20c1.1 0 2-.9 2-2V2c0-1.1-.9-2-2-2z"/></svg>'
)
_SVG_BLOG_FB = (
    '<svg class="blog-ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    '<path fill="currentColor" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>'
)
_SVG_BLOG_LINK = (
    '<svg class="blog-ico blog-ico--stroke" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">'
    '<path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    '<path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
)
_SVG_BLOG_SYSTEM_SHARE = (
    '<svg class="blog-ico blog-ico--stroke" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none">'
    '<circle cx="18" cy="5" r="3" stroke="currentColor" stroke-width="2"/><circle cx="6" cy="12" r="3" stroke="currentColor" stroke-width="2"/>'
    '<circle cx="18" cy="19" r="3" stroke="currentColor" stroke-width="2"/>'
    '<path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
)

# Givebutter Form widget id from dashboard (Sharing → Widgets → Form); same as gba_gb.element.id on embed URLs.
# Used on donate (and home widget) so checkout behavior stays consistent. Contact page uses a native form instead.
GIVEBUTTER_FORM_WIDGET_ID = "gk3bXg"

# Field reports — `pipeline/data/posts/*.json` or Supabase `blog_posts` when SUPABASE_* env is set (published only).
def _load_blog_tables() -> tuple[list[dict[str, object]], dict[str, str]]:
    from pipeline.integration.build_adapter import load_blog_for_build

    return load_blog_for_build()


BLOG_ENTRIES, BLOG_BODIES = _load_blog_tables()


def blog_sorted() -> list[dict[str, object]]:
    return sorted(BLOG_ENTRIES, key=lambda e: str(e["date"]), reverse=True)


def blog_entry(slug: str) -> dict[str, object]:
    for e in BLOG_ENTRIES:
        if e["slug"] == slug:
            return e
    raise KeyError(slug)


def blog_neighbors(slug: str) -> tuple[str | None, str | None]:
    """Return (newer_slug, older_slug) by publication date."""
    s = blog_sorted()
    idx = next(i for i, e in enumerate(s) if e["slug"] == slug)
    newer = str(s[idx - 1]["slug"]) if idx > 0 else None
    older = str(s[idx + 1]["slug"]) if idx < len(s) - 1 else None
    return newer, older


def html_blog_tags(tags: tuple[str, ...]) -> str:
    parts = [f'<span class="tag">{html_lib.escape(t)}</span>' for t in tags]
    return f'<p class="tag-row blog-tags">{"".join(parts)}</p>'


def html_blog_share(canonical_url: str, share_title: str) -> str:
    eu = quote(canonical_url, safe="")
    et = quote(share_title, safe="")
    u_attr = html_lib.escape(canonical_url, quote=True)
    t_attr = html_lib.escape(share_title, quote=True)
    ico_li = _SVG_BLOG_LI
    ico_fb = _SVG_BLOG_FB
    ico_x = _SVG_BLOG_X
    ico_link = _SVG_BLOG_LINK
    ico_sys = _SVG_BLOG_SYSTEM_SHARE
    return f"""
    <aside class="blog-share reveal" aria-label="Share this report" data-share-url="{u_attr}" data-share-title="{t_attr}">
      <div class="blog-share__actions" role="group" aria-label="Sharing options">
        <button type="button" class="blog-share__btn blog-share__btn--native" data-share-native hidden aria-label="Share using your device">
          <span class="blog-share__btn-ico" aria-hidden="true">{ico_sys}</span>
          <span class="blog-share__btn-text">Share</span>
        </button>
        <a class="blog-share__btn blog-share__btn--x" href="https://twitter.com/intent/tweet?url={eu}&text={et}" target="_blank" rel="noopener noreferrer" aria-label="Share on X">
          <span class="blog-share__btn-ico" aria-hidden="true">{ico_x}</span>
          <span class="blog-share__btn-text">X</span>
        </a>
        <a class="blog-share__btn blog-share__btn--li" href="https://www.linkedin.com/sharing/share-offsite/?url={eu}" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">
          <span class="blog-share__btn-ico" aria-hidden="true">{ico_li}</span>
          <span class="blog-share__btn-text">LinkedIn</span>
        </a>
        <a class="blog-share__btn blog-share__btn--fb" href="https://www.facebook.com/sharer/sharer.php?u={eu}" target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">
          <span class="blog-share__btn-ico" aria-hidden="true">{ico_fb}</span>
          <span class="blog-share__btn-text">Facebook</span>
        </a>
        <button type="button" class="blog-share__btn blog-share__btn--copy" data-share-copy aria-label="Copy link to clipboard">
          <span class="blog-share__btn-ico" aria-hidden="true">{ico_link}</span>
          <span class="blog-share__btn-text">Copy link</span>
        </button>
      </div>
      <p class="blog-share__toast" data-share-toast hidden aria-live="polite">Link copied to clipboard</p>
    </aside>
    """


def html_blog_pager(slug: str, depth: int) -> str:
    newer, older = blog_neighbors(slug)
    p = prefix(depth)
    chunks: list[str] = []
    if newer:
        e = blog_entry(newer)
        title = html_lib.escape(str(e["title"]))
        chunks.append(
            f'<a class="blog-pager__link blog-pager__link--newer" href="{p}blog/{newer}/index.html">'
            f'<span class="blog-pager__dir">Newer</span><span class="blog-pager__title">{title}</span></a>'
        )
    if older:
        e = blog_entry(older)
        title = html_lib.escape(str(e["title"]))
        chunks.append(
            f'<a class="blog-pager__link blog-pager__link--older" href="{p}blog/{older}/index.html">'
            f'<span class="blog-pager__dir">Older</span><span class="blog-pager__title">{title}</span></a>'
        )
    if not chunks:
        return ""
    inner = f'<div class="blog-pager__grid">{"".join(chunks)}</div>'
    return f'<nav class="blog-pager reveal" aria-label="Adjacent field reports">{inner}</nav>'


def html_blog_more_cards(slug: str, depth: int) -> str:
    others = [e for e in blog_sorted() if e["slug"] != slug][:3]
    if not others:
        return ""
    p = prefix(depth)
    cards: list[str] = []
    for e in others:
        eu = quote(f"https://www.goukraina.org/blog/{e['slug']}", safe="")
        et = quote(str(e["title"]), safe="")
        cover = blog_cover_url(e)
        slug_s = str(e["slug"])
        title_esc = html_lib.escape(str(e["title"]))
        title_img = html_lib.escape(str(e["title"]), quote=True)
        cover_alt = html_lib.escape(f"Cover image for field report: {e['title']}")
        cards.append(
            f"""
    <article class="blog-more-card reveal">
      <a class="blog-more-card__media" href="{p}blog/{slug_s}/index.html" aria-label="Read report: {title_img}">
        <img src="{cover}" alt="{cover_alt}" width="640" height="400" loading="lazy" decoding="async" />
      </a>
      <div class="blog-more-card__body">
      <p class="blog-more-card__meta">{html_lib.escape(str(e["date_label"]))} · {int(e["read"])} min</p>
      <h3 class="blog-more-card__title"><a href="{p}blog/{slug_s}/index.html">{title_esc}</a></h3>
      <p class="blog-more-card__excerpt">{html_lib.escape(str(e["excerpt"]))}</p>
      <div class="blog-more-card__share" role="group" aria-label="Share this report">
        <a class="blog-more-card__share-btn" href="https://twitter.com/intent/tweet?url={eu}&text={et}" target="_blank" rel="noopener noreferrer">
          <span class="blog-more-card__share-ico" aria-hidden="true">{_SVG_BLOG_X}</span>
          <span class="blog-more-card__share-lbl">X</span>
        </a>
        <a class="blog-more-card__share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url={eu}" target="_blank" rel="noopener noreferrer">
          <span class="blog-more-card__share-ico" aria-hidden="true">{_SVG_BLOG_LI}</span>
          <span class="blog-more-card__share-lbl">LinkedIn</span>
        </a>
      </div>
      </div>
    </article>
    """
        )
    return f"""
    <section class="blog-more reveal" aria-labelledby="blog-more-heading">
      <div class="blog-more__head">
        <h2 id="blog-more-heading" class="blog-more__title">More field reports</h2>
        <a class="blog-more__all" href="{p}blog/index.html">View all</a>
      </div>
      <div class="blog-more__grid">{"".join(cards)}</div>
    </section>
    """


def prefix(depth: int) -> str:
    return ("../" * depth) if depth else ""


def head_common(
    depth: int,
    title: str,
    description: str,
    canonical_path: str,
    og_type: str = "website",
    blog_ld: dict | None = None,
    og_image: str | None = None,
    *,
    givebutter_widget: bool = True,
    og_image_alt: str | None = None,
    article_published: str | None = None,
    article_modified: str | None = None,
    article_section: str | None = None,
    og_image_width: int = 1200,
    og_image_height: int = 630,
    extra_graph_nodes: list[dict] | None = None,
) -> str:
    base = SITE_ORIGIN
    canonical = base + canonical_path
    p = prefix(depth)
    te = html_lib.escape(title)
    de = html_lib.escape(description, quote=True)
    og_img = og_image if og_image else f"{base}{SITE_MEDIA}/opengraph.jpg"
    og_img_esc = html_lib.escape(og_img, quote=True)
    og_alt_block = ""
    if og_image_alt:
        oa = html_lib.escape(og_image_alt, quote=True)
        og_alt_block = (
            f'\n  <meta property="og:image:alt" content="{oa}" />\n'
            f'  <meta name="twitter:image:alt" content="{oa}" />'
        )
    article_meta = ""
    if og_type == "article" and article_published:
        ap = html_lib.escape(article_published, quote=True)
        am = html_lib.escape(article_modified or article_published, quote=True)
        sec = ""
        if article_section:
            sec = (
                f'\n  <meta property="article:section" content="{html_lib.escape(article_section, quote=True)}" />'
            )
        article_meta = (
            f'\n  <meta property="article:published_time" content="{ap}" />\n'
            f'  <meta property="article:modified_time" content="{am}" />\n'
            f'  <meta property="article:author" content="German Simakovski" />\n'
            f'  <meta name="author" content="German Simakovski" />{sec}\n'
            f'  <meta name="twitter:creator" content="@{TWITTER_SITE}" />'
        )
    blog_script = ""
    if blog_ld:
        blog_script = (
            f'\n  <script type="application/ld+json">\n{json.dumps(blog_ld, indent=2)}\n  </script>'
        )
    gb_script = ""
    if givebutter_widget:
        gb_script = (
            "\n  <script async src="
            '"https://widgets.givebutter.com/latest.umd.cjs?acct=HneqIckEv5z1FV3R&p=webflow"'
            "></script>"
        )
    return f"""<!DOCTYPE html>
<html lang="en-US">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="{SITE_THEME_COLOR}" />
  <title>{te}</title>
  <meta name="description" content="{de}" />
  <meta name="robots" content="index, follow" />
  <link rel="canonical" href="{canonical}" />
  <link rel="alternate" hreflang="en-US" href="{canonical}" />
  <link rel="alternate" hreflang="x-default" href="{canonical}" />
  <meta property="og:type" content="{og_type}" />
  <meta property="og:site_name" content="Go Ukraina" />
  <meta property="og:url" content="{canonical}" />
  <meta property="og:title" content="{te}" />
  <meta property="og:description" content="{de}" />
  <meta property="og:image" content="{og_img_esc}" />
  <meta property="og:image:width" content="{og_image_width}" />
  <meta property="og:image:height" content="{og_image_height}" />{og_alt_block}
  <meta property="og:locale" content="en_US" />{article_meta}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@{TWITTER_SITE}" />
  <meta name="twitter:title" content="{te}" />
  <meta name="twitter:description" content="{de}" />
  <meta name="twitter:image" content="{og_img_esc}" />
  <link rel="icon" type="image/svg+xml" href="{base}{SITE_MEDIA}/favicon.svg" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;0,9..144,700;1,9..144,400&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="{p}assets/css/main.css?v={CSS_ASSET_VERSION}" />
  <script>
    document.documentElement.classList.add("js");
  </script>{gb_script}
  <script type="application/ld+json">
{json_ld_org_webpage(title, description, canonical, extra_graph_nodes=extra_graph_nodes)}
  </script>{blog_script}
{_tracking_head_snippets()}
{_newsletter_popup_script(p)}
</head>"""


def json_ld_org_webpage(
    title: str, description: str, url: str, extra_graph_nodes: list[dict] | None = None
) -> str:
    org_id = f"{SITE_ORIGIN}/#organization"
    site_id = f"{SITE_ORIGIN}/#website"
    data = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": url + "#webpage",
                "url": url,
                "name": title,
                "description": description,
                "isPartOf": {"@id": site_id},
                "inLanguage": "en-US",
            },
            {
                "@type": "WebSite",
                "@id": site_id,
                "url": f"{SITE_ORIGIN}/",
                "name": "Go Ukraina",
                "publisher": {"@id": org_id},
                "inLanguage": "en-US",
            },
            {
                "@type": ["NGO", "NonprofitOrganization"],
                "@id": org_id,
                "name": "Go Ukraina Inc.",
                "url": SITE_ORIGIN,
                "logo": {
                    "@type": "ImageObject",
                    "url": f"{SITE_ORIGIN}{SITE_MEDIA}/logo.png",
                },
                "description": "Go Ukraina is a Los Angeles-based 501(c)(3) humanitarian nonprofit delivering essential aid, clean water solutions, and infrastructure rebuilding in war-affected Ukraine.",
                "foundingDate": "2022",
                "telephone": "+1-323-532-6855",
                "email": "info@goukraina.com",
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "4500 Park Granada Suite 202",
                    "addressLocality": "Calabasas",
                    "addressRegion": "CA",
                    "postalCode": "91302",
                    "addressCountry": "US",
                },
                "sameAs": [
                    SOCIAL_INSTAGRAM,
                    SOCIAL_FACEBOOK,
                    SOCIAL_LINKEDIN,
                    SOCIAL_YOUTUBE,
                ],
            },
        ],
    }
    if extra_graph_nodes:
        data["@graph"].extend(extra_graph_nodes)
    return json.dumps(data, indent=2)


def blog_index_extra_schema(ordered: list[dict[str, object]]) -> list[dict]:
    """BreadcrumbList + ItemList for the blog listing page (SEO)."""
    base = SITE_ORIGIN
    blog_url = f"{base}/blog"
    items: list[dict] = []
    for i, e in enumerate(ordered, start=1):
        slug = str(e["slug"])
        items.append(
            {
                "@type": "ListItem",
                "position": i,
                "name": str(e["title"]),
                "url": f"{base}/blog/{slug}",
            }
        )
    return [
        {
            "@type": "BreadcrumbList",
            "@id": f"{blog_url}#breadcrumb",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Home",
                    "item": f"{base}/",
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "Field reports",
                    "item": blog_url,
                },
            ],
        },
        {
            "@type": "ItemList",
            "@id": f"{blog_url}#posts",
            "name": "Go Ukraina field reports",
            "description": (
                "Humanitarian field reports and blog archive: clean water (ReH2O), emergency power, "
                "advocacy, POW and human rights updates, and aid programs in Ukraine."
            ),
            "numberOfItems": len(items),
            "itemListElement": items,
        },
    ]


def about_page_extra_schema() -> list[dict]:
    """BreadcrumbList JSON-LD for the About page (SEO)."""
    base = SITE_ORIGIN
    about_url = f"{base}/about"
    return [
        {
            "@type": "BreadcrumbList",
            "@id": f"{about_url}#breadcrumb",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Home",
                    "item": f"{base}/",
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "About",
                    "item": about_url,
                },
            ],
        }
    ]


def mobile_tab_for(current: str) -> str:
    """Bottom-nav tab key for liquid notch (matches primary destinations + More)."""
    if current in ("home", "about", "impact", "donate"):
        return current
    return "more"


def _desktop_nav_links_html(depth: int, current: str) -> str | None:
    """If Supabase has enough active nav_items, return desktop <a> links; else None (use hardcoded nav)."""
    items = [
        r
        for r in _NAV_ITEMS
        if r.get("is_active", True) and str(r.get("nav_group") or "desktop") != "mobile"
    ]
    if len(items) < 2:
        return None
    p = prefix(depth)
    parts: list[str] = []
    for row in sorted(items, key=lambda x: int(x.get("sort_order") or 0)):
        href = str(row.get("href") or "").strip()
        label = str(row.get("label") or "").strip()
        if not href or not label:
            continue
        ext = href.startswith(("http://", "https://"))
        resolved = href if ext else f"{p}{href.lstrip('/')}"
        tg = str(row.get("target") or "").strip()
        if ext:
            tgt = tg or "_blank"
            ext_attrs = f' target="{html_lib.escape(tgt)}" rel="noopener noreferrer"'
        elif tg:
            ext_attrs = f' target="{html_lib.escape(tg)}"'
        else:
            ext_attrs = ""
        esc_h = html_lib.escape(resolved, quote=True)
        esc_l = html_lib.escape(label)
        donate_like = "donate" in href.lower() or label.strip().lower() == "donate"
        aria = ""
        if donate_like and current == "donate":
            aria = ' aria-current="page"'
        if donate_like:
            parts.append(f'<a class="btn btn-gold nav-donate" href="{esc_h}"{ext_attrs}{aria}>{esc_l}</a>')
        else:
            parts.append(f'<a class="nav-link" href="{esc_h}"{ext_attrs}>{esc_l}</a>')
    if len(parts) < 2:
        return None
    return "\n        ".join(parts)


def header_nav(depth: int, current: str) -> str:
    p = prefix(depth)

    def nav_link(href: str, label: str, cur: str | None = None) -> str:
        ext = href.startswith(("http://", "https://"))
        resolved = href if ext else f"{p}{href}"
        ext_attrs = ' target="_blank" rel="noopener noreferrer"' if ext else ""
        c = ""
        if not ext and current == (cur or href):
            c = ' aria-current="page"'
        return f'<a class="nav-link" href="{resolved}"{ext_attrs}{c}>{label}</a>'

    def nav_tile(href: str, label: str, cur: str | None, svg: str) -> str:
        ext = href.startswith(("http://", "https://"))
        resolved = href if ext else f"{p}{href}"
        ext_attrs = ' target="_blank" rel="noopener noreferrer"' if ext else ""
        c = ""
        if not ext and current == (cur or href):
            c = ' aria-current="page"'
        return (
            f'<a class="nav-tile" href="{resolved}"{ext_attrs}{c}>'
            f'<span class="nav-tile__ico" aria-hidden="true"><svg class="nav-tile__svg" viewBox="0 0 24 24" fill="none" '
            f'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{svg}</svg></span>'
            f'<span class="nav-tile__txt">{label}</span></a>'
        )

    # Icons for mobile “More” toolbar (horizontal strip, not full-screen list)
    ico_reh2o = '<path d="M12 2C9 9 5 13 5 18a7 7 0 1014 0c0-5-4-9-7-16z"/>'
    ico_power = '<path d="M13 2L3 14h8l-1 8 10-12h-8l1-8z"/>'
    ico_advocacy = '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
    ico_dream = '<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>'
    ico_summit = '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'
    ico_blog = '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>'
    ico_contact = '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/>'

    db_nav = _desktop_nav_links_html(depth, current)
    if db_nav:
        primary_nav_inner = db_nav
    else:
        primary_nav_inner = f"""        {nav_link("about/index.html", "About", "about")}
        <details class="nav-dropdown">
          <summary class="nav-dropdown-summary"><span>Our Work</span></summary>
          <div class="dropdown-panel">
            {nav_link("initiatives/reh2o/index.html", "ReH2O Clean Water", "init-reh2o")}
            {nav_link("initiatives/power-generators/index.html", "Power Generators", "init-power")}
            {nav_link("initiatives/advocacy/index.html", "Advocacy", "init-advocacy")}
            {nav_link("initiatives/ukraine-dreamzzz/index.html", "Ukraine Dreamzzz", "init-dream")}
          </div>
        </details>
        {nav_link(URS_SUMMIT_URL, "Summit", "summit")}
        {nav_link("impact/index.html", "Impact", "impact")}
        {nav_link("blog/index.html", "Blog", "blog")}
        <a class="btn btn-gold nav-donate" href="{p}donate/index.html"{' aria-current="page"' if current == "donate" else ""}>Donate</a>
        {nav_link("contact/index.html", "Contact", "contact")}"""

    mt = mobile_tab_for(current)
    return f"""
<body data-mobile-tab="{mt}">
  <a class="skip-link" href="#main">Skip to content</a>
  <div class="nav-backdrop" id="nav-backdrop" hidden></div>
  <header class="site-header" role="banner">
    <div class="header-inner">
      <a class="logo-link" href="{p}index.html">
        <img src="{SITE_MEDIA}/logo.png" width="200" height="60" alt="Go Ukraina" />
      </a>
      <nav class="nav-main nav-main--desktop" id="primary-nav" aria-label="Primary navigation">
{primary_nav_inner}
      </nav>
    </div>
  </header>
  <div class="mobile-more-panel" id="more-toolbar" role="navigation" aria-label="More navigation" aria-hidden="true">
    <p class="nav-panel-label nav-panel-label--toolbar" id="more-toolbar-label">Quick links</p>
    <div class="mobile-more-panel__track" aria-labelledby="more-toolbar-label">
      {nav_tile("initiatives/reh2o/index.html", "ReH2O", "init-reh2o", ico_reh2o)}
      {nav_tile("initiatives/power-generators/index.html", "Power", "init-power", ico_power)}
      {nav_tile("initiatives/advocacy/index.html", "Advocacy", "init-advocacy", ico_advocacy)}
      {nav_tile("initiatives/ukraine-dreamzzz/index.html", "Dreamzzz", "init-dream", ico_dream)}
      {nav_tile(URS_SUMMIT_URL, "Summit", "summit", ico_summit)}
      {nav_tile("blog/index.html", "Blog", "blog", ico_blog)}
      {nav_tile("contact/index.html", "Contact", "contact", ico_contact)}
    </div>
  </div>
"""


def mobile_bottom_nav(depth: int, current: str) -> str:
    """Liquid notch bottom bar: Donate is always centered (primary CTA). Brand colors via CSS."""
    p = prefix(depth)
    mt = mobile_tab_for(current)
    donate_cur = ' aria-current="page"' if mt == "donate" else ""

    def ico_home() -> str:
        return '<svg class="mb-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>'

    def ico_about() -> str:
        return '<svg class="mb-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 16v-4M12 8h.01"/></svg>'

    def ico_impact() -> str:
        return '<svg class="mb-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>'

    def ico_donate() -> str:
        return '<svg class="mb-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>'

    def ico_menu() -> str:
        return '<svg class="mb-ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>'

    home_ac = ' aria-current="page"' if mt == "home" else ""
    about_ac = ' aria-current="page"' if mt == "about" else ""
    impact_ac = ' aria-current="page"' if mt == "impact" else ""

    row_home = (
        f'<a class="mb-item" href="{p}index.html"{home_ac}><span class="mb-item__inner">{ico_home()}'
        f'<span class="mb-label">Home</span></span></a>'
    )
    row_about = (
        f'<a class="mb-item" href="{p}about/index.html"{about_ac}><span class="mb-item__inner">{ico_about()}'
        f'<span class="mb-label">About</span></span></a>'
    )
    row_center = (
        '<div class="mb-slot mb-slot--center" aria-hidden="true">'
        f'<span class="mb-slot__ghost">{ico_donate()}<span class="mb-label">Donate</span></span></div>'
    )
    row_impact = (
        f'<a class="mb-item" href="{p}impact/index.html"{impact_ac}><span class="mb-item__inner">{ico_impact()}'
        f'<span class="mb-label">Impact</span></span></a>'
    )

    more_row = (
        '<button type="button" class="mb-item mb-item--more mb-menu-toggle" aria-expanded="false" '
        'aria-controls="more-toolbar" aria-label="Open quick links">'
        f'<span class="mb-item__inner">{ico_menu()}<span class="mb-label">More</span></span></button>'
    )

    fab_donate = (
        f'<a class="mb-fab__link" href="{p}donate/index.html"{donate_cur} aria-label="Donate: support our programs">'
        f'<span class="mb-fab__hit mb-fab__hit--donate">{ico_donate()}</span>'
        f'<span class="mb-label mb-label--fab">Donate</span></a>'
    )

    return f"""
  <div class="mobile-bottom-nav" id="mobile-bottom-nav" data-notch-center="1" aria-label="Mobile primary">
    <div class="mobile-bottom-nav__solid" aria-hidden="true"></div>
    <svg class="mobile-bottom-nav__svg" width="400" height="56" viewBox="0 0 400 56" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="mb-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="oklch(20% 0.1 255)"/>
          <stop offset="45%" stop-color="oklch(14% 0.09 255)"/>
          <stop offset="100%" stop-color="oklch(9% 0.05 255)"/>
        </linearGradient>
      </defs>
      <path class="mobile-bottom-nav__path" fill="url(#mb-grad)" d=""/>
      <path class="mobile-bottom-nav__path-border" fill="none" stroke="#d4a84b" stroke-opacity="0.45" stroke-width="1" d=""/>
    </svg>
    <div class="mobile-bottom-nav__row">
      {row_home}
      {row_about}
      {row_center}
      {row_impact}
      {more_row}
    </div>
    <div class="mobile-bottom-nav__fab" aria-hidden="false">
      {fab_donate}
    </div>
  </div>"""


def footer_block(depth: int, current: str) -> str:
    p = prefix(depth)
    donate_aria = ' aria-current="page"' if current == "donate" else ""
    return f"""
  <footer class="site-footer" role="contentinfo" aria-labelledby="footer-heading">
    <h2 id="footer-heading" class="visually-hidden">Site footer</h2>
    <div class="footer-shell">
      <div class="footer-mast">
        <div class="footer-mast__intro">
          <p class="footer-mast__lead">
            A Los Angeles-based 501(c)(3) nonprofit delivering essential aid and rebuilding infrastructure in war-affected Ukraine.
          </p>
          <p class="footer-mast__meta">
            <span class="footer-mast__badge">501(c)(3) tax-exempt</span>
            <span class="footer-mast__dot" aria-hidden="true">·</span>
            <span>EIN 88-2011390</span>
          </p>
        </div>
        <div class="footer-mast__cta">
          <p class="footer-mast__cta-label" id="footer-donate-label">Fund water, power, and field programs</p>
          <a
            class="btn btn-gold footer-donate-btn"
            href="{p}donate/index.html"
            aria-describedby="footer-donate-label"{donate_aria}
          >Donate</a>
        </div>
      </div>

      <nav class="footer-nav" aria-label="Site links">
        <div class="footer-grid">
          <div class="footer-col">
            <h3 class="footer-col__h" id="footer-nav-programs">Programs</h3>
            <ul class="footer-list" aria-labelledby="footer-nav-programs">
              <li><a href="{p}initiatives/reh2o/index.html">ReH2O Clean Water</a></li>
              <li><a href="{p}initiatives/power-generators/index.html">Power Generators</a></li>
              <li><a href="{p}initiatives/advocacy/index.html">Advocacy</a></li>
              <li><a href="{p}initiatives/ukraine-dreamzzz/index.html">Ukraine Dreamzzz</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h3 class="footer-col__h" id="footer-nav-org">Organization</h3>
            <ul class="footer-list" aria-labelledby="footer-nav-org">
              <li><a href="{p}donate/index.html" class="footer-link-donate">Donate</a></li>
              <li><a href="{p}about/index.html">About Us</a></li>
              <li><a href="{p}impact/index.html">Transparency &amp; Impact</a></li>
              <li><a href="{URS_SUMMIT_URL}" target="_blank" rel="noopener noreferrer">Reconstruction Summit</a></li>
              <li><a href="{p}blog/index.html">Blog &amp; Field Reports</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h3 class="footer-col__h" id="footer-nav-contact">Contact</h3>
            <p class="footer-address">
              4500 Park Granada Suite 202<br />
              Calabasas, CA 91302
            </p>
            <ul class="footer-contact-lines">
              <li><a class="footer-contact-link" href="tel:+13235326855">+1 (323) 532-6855</a></li>
              <li><a class="footer-contact-link" href="mailto:info@goukraina.com">info@goukraina.com</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h3 class="footer-col__h" id="footer-nav-social">Follow</h3>
            <ul class="footer-social" aria-labelledby="footer-nav-social">
              <li>
                <a class="footer-social__link" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer">
                  <span class="footer-social__ico" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg></span>
                  <span>Instagram</span>
                </a>
              </li>
              <li>
                <a class="footer-social__link" href="{SOCIAL_FACEBOOK}" target="_blank" rel="noopener noreferrer">
                  <span class="footer-social__ico" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></span>
                  <span>Facebook</span>
                </a>
              </li>
              <li>
                <a class="footer-social__link" href="{SOCIAL_LINKEDIN}" target="_blank" rel="noopener noreferrer">
                  <span class="footer-social__ico" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg></span>
                  <span>LinkedIn</span>
                </a>
              </li>
              <li>
                <a class="footer-social__link" href="{SOCIAL_YOUTUBE}" target="_blank" rel="noopener noreferrer">
                  <span class="footer-social__ico" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></span>
                  <span>YouTube</span>
                </a>
              </li>
            </ul>
          </div>
        </div>
      </nav>
    </div>

    <div class="footer-legal">
      <span class="footer-legal__copy">© 2026 Go Ukraina Inc. All rights reserved.</span>
      <span class="footer-legal__meta">EIN 88-2011390</span>
      <span class="footer-legal__policies">
        <a href="https://www.goukraina.org/privacy">Privacy Policy</a>
        <span class="footer-legal__sep" aria-hidden="true">·</span>
        <a href="https://www.goukraina.org/terms">Terms of Service</a>
      </span>
    </div>
  </footer>
{mobile_bottom_nav(depth, current)}
  <script src="{p}assets/js/main.js" defer></script>
</body>
</html>
"""


def write(path: str, content: str) -> None:
    full = OUT / path
    full.parent.mkdir(parents=True, exist_ok=True)
    full.write_text(content.lstrip(), encoding="utf-8")
    print("wrote", full)


def page_home() -> None:
    depth = 0
    title = "Ukraine Humanitarian Aid & Reconstruction | Go Ukraina"
    desc = (
        "Go Ukraina is a Los Angeles-based 501(c)(3) nonprofit delivering clean water, emergency power, and advocacy for war-affected Ukraine. Donate to make an impact."
    )
    bi = SITE_MEDIA
    cover_wash = blog_cover_url(blog_entry("ukraine-water-crisis-wash-cluster"))
    cover_reh2o_home = f"{bi}/reh2o/crane-station.jpg"
    cover_advocacy = blog_cover_url(blog_entry("ukrainian-pows-humanitarian-crisis"))
    img_event_summit = f"{bi}/reh2o/meeting-2.jpeg"
    img_event_gala = f"{bi}/reh2o/meeting-1.jpeg"
    body = f"""
{head_common(depth, title, desc, "/")}
{header_nav(depth, "home")}
  <main id="main" class="home-main">
    <section class="home-hero" aria-labelledby="hero-title">
      <div class="home-hero-bg" aria-hidden="true"></div>
      <span class="home-hero-dot home-hero-dot--1" aria-hidden="true"></span>
      <span class="home-hero-dot home-hero-dot--2" aria-hidden="true"></span>
      <span class="home-hero-dot home-hero-dot--3" aria-hidden="true"></span>
      <span class="home-hero-dot home-hero-dot--4" aria-hidden="true"></span>
      <div class="home-hero-grid">
        <div class="home-hero-copy">
          <p class="home-hero-kicker">Clean water · Power · Infrastructure · Ukraine</p>
          <h1 id="hero-title">Where water flows again, communities rise again.</h1>
          <p class="home-hero-lead">A Los Angeles–based 501(c)(3) bringing solar water stations, emergency power, and rebuilding support to war-affected Ukraine, funded by people who refuse to look away.</p>
          <div class="home-hero-actions">
            <a class="btn btn-home-primary" href="donate/index.html">Donate now</a>
            <a class="btn btn-home-secondary" href="impact/index.html">See transparency &amp; impact</a>
          </div>
          <p class="home-hero-note"><strong>EIN 88-2011390</strong> · 100% of public gifts fund programs on the ground.</p>
        </div>
        <figure class="home-hero-media">
          <img
            class="home-hero-header-img"
            src="{SITE_MEDIA}/logo.png"
            alt="Go Ukraina emblem"
            width="225"
            height="225"
            loading="eager"
            decoding="async"
          />
        </figure>
      </div>
    </section>

    <section class="home-pillars section reveal reveal--stagger" aria-labelledby="pillars-heading">
      <div class="home-section-head home-section-head--pillars">
        <p class="home-section-kicker home-section-kicker--center home-section-kicker--pillars">Why we exist</p>
        <h2 id="pillars-heading" class="home-h2 home-h2--pillars">Make a difference where it matters</h2>
        <p class="home-sub home-sub--tight home-sub--pillars">Every project is built with Ukrainian partners, designed for dignity, scale, and long-term resilience.</p>
      </div>
      <div class="home-pillar-grid">
        <article class="home-pillar">
          <div class="home-pillar-media">
            <img
              src="{bi}/reh2o/crane-station.jpg"
              alt="ReH2O solar water purification station being installed in Ukraine"
              width="640"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="home-pillar-body">
            <h3 class="home-pillar-title">Clean water access</h3>
            <p>ReH2O stations deliver safe drinking water when pipes and grids fail: solar-powered, independent, built to last.</p>
          </div>
        </article>
        <article class="home-pillar">
          <div class="home-pillar-media">
            <img
              src="{bi}/reh2o/truck-1.jpg"
              alt="Relief truck and emergency power equipment staged for delivery in Ukraine"
              width="640"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="home-pillar-body">
            <h3 class="home-pillar-title">Power when the grid drops</h3>
            <p>Generators for hospitals, schools, and shelters, keeping lights, heat, and care online through blackouts.</p>
          </div>
        </article>
        <article class="home-pillar">
          <div class="home-pillar-media">
            <img
              src="{bi}/ombudsman-meeting.jpg"
              alt="Go Ukraina delegation meeting with Ukrainian human rights partners in Kyiv"
              width="640"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="home-pillar-body">
            <h3 class="home-pillar-title">Advocacy &amp; voice</h3>
            <p>Standing with Ukraine’s human rights institutions (POWs, children, accountability) on the world stage.</p>
          </div>
        </article>
        <article class="home-pillar">
          <div class="home-pillar-media">
            <img
              src="{bi}/reh2o/team-station.jpg"
              alt="Go Ukraina team with partners at a water deployment site"
              width="640"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="home-pillar-body">
            <h3 class="home-pillar-title">Locals for locals</h3>
            <p>We coordinate with municipalities and reconstruction agencies so aid lands where need and impact intersect.</p>
          </div>
        </article>
      </div>
    </section>

    <section class="home-split section reveal" aria-labelledby="split-heading">
      <div class="home-split-visual">
        <div class="home-split-photo home-split-photo--a">
          <img src="{bi}/reh2o/delivery-1.jpg" alt="Solar water purification station deployment in Ukraine" width="560" height="640" loading="lazy" decoding="async" />
        </div>
        <div class="home-split-photo home-split-photo--b">
          <img src="{bi}/reh2o/team-station.jpg" alt="Go Ukraina team with partners at a water station site" width="400" height="400" loading="lazy" decoding="async" />
        </div>
        <div class="home-split-dots" aria-hidden="true"></div>
      </div>
      <div class="home-split-copy">
        <p class="home-section-kicker home-section-kicker--left">Transparency</p>
        <h2 id="split-heading" class="home-h2">Rebuilding starts with knowledge and clean water.</h2>
        <p>Our teams document every deployment: water quality, capacity, and community outcomes. Supporters see what they funded: transparently, honestly, and in real time.</p>
        <div class="home-split-actions">
          <a class="btn btn-home-primary" href="about/index.html">About our mission</a>
          <a class="btn btn-home-outline" href="{SOCIAL_YOUTUBE}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
        </div>
      </div>
    </section>

    <section class="home-campaigns section reveal reveal--stagger" aria-labelledby="camp-heading">
      <div class="home-campaigns__wrap">
        <header class="home-campaigns__header">
          <p class="home-section-kicker">Featured programs</p>
          <h2 id="camp-heading" class="home-h2 home-campaigns__title">Programs you can stand behind</h2>
          <p class="home-campaigns__lead">Transparent initiatives with measurable outcomes. Choose a program to see goals, momentum, and how we work with Ukrainian partners on the ground.</p>
        </header>
        <div class="home-campaign-grid" role="list">
          <article class="home-campaign-card" role="listitem">
            <a class="home-campaign-card__media" href="initiatives/reh2o/index.html" tabindex="-1">
              <span class="home-campaign-card__cat">Water</span>
              <img src="{bi}/reh2o/crane-station.jpg" alt="ReH2O industrial water purification station with deployment crane" width="480" height="320" loading="lazy" decoding="async" />
              <span class="home-campaign-card__shine" aria-hidden="true"></span>
            </a>
            <div class="home-campaign-card__body">
              <div class="home-campaign-card__meta">
                <span class="home-campaign-card__status">Scale-up</span>
                <span class="home-campaign-card__goal">150-station plan</span>
              </div>
              <div class="home-campaign-bar" role="img" aria-label="Momentum toward plan: about 72 percent"><span style="width:72%"></span></div>
              <h3 class="home-campaign-title"><a href="initiatives/reh2o/index.html">ReH2O: solar water for Ukraine</a></h3>
              <p>Industrial purification where municipal systems have been destroyed. One station can serve entire neighborhoods.</p>
              <a class="home-campaign-card__cta" href="initiatives/reh2o/index.html">Explore ReH2O <span class="home-campaign-card__cta-ico" aria-hidden="true">→</span></a>
            </div>
          </article>
          <article class="home-campaign-card" role="listitem">
            <a class="home-campaign-card__media" href="initiatives/power-generators/index.html" tabindex="-1">
              <span class="home-campaign-card__cat">Power</span>
              <img src="{bi}/reh2o/truck-1.jpg" alt="Emergency power and relief supplies loaded for delivery in Ukraine" width="480" height="320" loading="lazy" decoding="async" />
              <span class="home-campaign-card__shine" aria-hidden="true"></span>
            </a>
            <div class="home-campaign-card__body">
              <div class="home-campaign-card__meta">
                <span class="home-campaign-card__status">Active</span>
                <span class="home-campaign-card__goal">Winter readiness</span>
              </div>
              <div class="home-campaign-bar" role="img" aria-label="Momentum toward readiness: about 58 percent"><span style="width:58%"></span></div>
              <h3 class="home-campaign-title"><a href="initiatives/power-generators/index.html">Emergency power for critical sites</a></h3>
              <p>Hospitals and heating hubs receive fuel and hardware before the next cold season.</p>
              <a class="home-campaign-card__cta" href="initiatives/power-generators/index.html">Explore power program <span class="home-campaign-card__cta-ico" aria-hidden="true">→</span></a>
            </div>
          </article>
          <article class="home-campaign-card" role="listitem">
            <a class="home-campaign-card__media" href="initiatives/advocacy/index.html" tabindex="-1">
              <span class="home-campaign-card__cat">Policy</span>
              <img src="{bi}/ombudsman-meeting.jpg" alt="Go Ukraina delegation meeting with Ukraine human rights partners" width="480" height="320" loading="lazy" decoding="async" />
              <span class="home-campaign-card__shine" aria-hidden="true"></span>
            </a>
            <div class="home-campaign-card__body">
              <div class="home-campaign-card__meta">
                <span class="home-campaign-card__status">Partnership</span>
                <span class="home-campaign-card__goal">Ombudsman office</span>
              </div>
              <div class="home-campaign-bar" role="img" aria-label="Partnership progress: about 85 percent"><span style="width:85%"></span></div>
              <h3 class="home-campaign-title"><a href="initiatives/advocacy/index.html">Human rights &amp; accountability</a></h3>
              <p>Policy briefings and diaspora advocacy alongside Ukraine’s human rights leadership.</p>
              <a class="home-campaign-card__cta" href="initiatives/advocacy/index.html">Explore advocacy <span class="home-campaign-card__cta-ico" aria-hidden="true">→</span></a>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="home-impact section reveal" aria-labelledby="impact-heading">
      <div class="home-impact-inner">
        <div class="home-impact-copy">
          <p class="home-section-kicker home-section-kicker--light">By the numbers</p>
          <h2 id="impact-heading" class="home-h2">Impact you can measure</h2>
          <p class="home-sub">Volunteer-led overhead, donor-funded programs, Ukrainian-led delivery.</p>
          <div class="home-impact-stats">
            <div><span class="home-impact-num">150+</span><span class="home-impact-label">Generators shipped</span></div>
            <div><span class="home-impact-num">12+</span><span class="home-impact-label">Water stations live</span></div>
            <div><span class="home-impact-num">$500K+</span><span class="home-impact-label">Aid directed to programs</span></div>
          </div>
          <a class="btn btn-home-outline btn-home-outline--light" href="impact/index.html">Full transparency report</a>
        </div>
        <div class="home-impact-map" aria-hidden="true">
          <svg viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
            <title>Map of Ukraine</title>
            <defs>
              <linearGradient id="home-impact-ua-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="oklch(42% 0.14 255)"/>
                <stop offset="55%" stop-color="oklch(52% 0.12 240)"/>
                <stop offset="100%" stop-color="oklch(82% 0.15 92)"/>
              </linearGradient>
            </defs>
            <!-- Outline: UKR_OUTLINE_PATH_D (johan/world.geo.json), viewBox 0 0 200 160 -->
            <path fill="url(#home-impact-ua-grad)" opacity="0.9" d="{UKR_OUTLINE_PATH_D}"/>
            <circle cx="94.02" cy="39.45" r="4" fill="oklch(95% 0.02 95)"/>
            <circle cx="24.64" cy="51.22" r="3" fill="oklch(95% 0.02 95)"/>
            <circle cx="96.15" cy="116.0" r="3" fill="oklch(95% 0.02 95)"/>
          </svg>
        </div>
      </div>
    </section>

    <section class="home-donate home-donate--atelier section section-alt reveal" aria-labelledby="donate-widget-heading">
      <div class="home-donate__aurora" aria-hidden="true"></div>
      <div class="home-donate-inner">
        <div class="home-donate-card">
          <div class="home-donate-card__shine" aria-hidden="true"></div>
          <div class="home-donate-card__border" aria-hidden="true"></div>
          <div class="home-donate-card__body">
            <header class="home-donate-card__header">
              <p class="home-donate-card__eyebrow">Give · 501(c)(3)</p>
              <h2 id="donate-widget-heading" class="home-donate-card__title">Fuel the next water station</h2>
              <p class="home-donate-card__lead">Every public dollar ships pipes, panels, and proof, transparently deployed beside Ukrainian partners.</p>
              <div class="home-donate-card__ornament" aria-hidden="true">
                <svg width="160" height="12" viewBox="0 0 160 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 6h52M108 6h52" stroke="url(#donate-orn)" stroke-width="1" stroke-linecap="round" opacity="0.55"/>
                  <path d="M56 6c12-4 24-4 36 0s24 4 36 0" stroke="url(#donate-orn)" stroke-width="1.25" stroke-linecap="round"/>
                  <defs>
                    <linearGradient id="donate-orn" x1="0" y1="0" x2="160" y2="0">
                      <stop stop-color="oklch(45% 0.14 255)"/>
                      <stop offset="0.5" stop-color="oklch(88% 0.16 95)"/>
                      <stop offset="1" stop-color="oklch(45% 0.14 255)"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
            </header>
            <ul class="home-donate-card__trust" aria-label="Why give with confidence">
              <li><span class="home-donate-card__trust-ico" aria-hidden="true">✓</span> 100% to programs</li>
              <li><span class="home-donate-card__trust-ico" aria-hidden="true">✓</span> Tax-deductible (US)</li>
              <li><span class="home-donate-card__trust-ico" aria-hidden="true">✓</span> EIN 88-2011390</li>
            </ul>
            <div class="home-donate-card__widget">
              <p class="home-donate-card__widget-label">Choose an amount</p>
              <div class="home-donate-card__widget-surface">
                <givebutter-widget id="{GIVEBUTTER_FORM_WIDGET_ID}"></givebutter-widget>
              </div>
              <p class="home-donate-card__fallback"><a class="home-donate-card__fallback-link" href="donate/index.html">Prefer the full donate page?</a></p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="home-instagram home-ig-reels section reveal" aria-labelledby="ig-heading">
      <div class="home-ig-reels__head">
        <div class="home-ig-reels__intro">
          <div class="home-ig-reels__badge" aria-hidden="true">
            <svg class="home-ig-reels__ig" width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
              <defs>
                <linearGradient id="home-ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stop-color="#f09433"/>
                  <stop offset="25%" stop-color="#e6683c"/>
                  <stop offset="50%" stop-color="#dc2743"/>
                  <stop offset="75%" stop-color="#bc1888"/>
                  <stop offset="100%" stop-color="#833ab4"/>
                </linearGradient>
              </defs>
              <rect width="24" height="24" x="0" y="0" rx="6" fill="url(#home-ig-grad)"/>
              <path fill="white" fill-opacity="0.95" d="M12 8.2a3.8 3.8 0 100 7.6 3.8 3.8 0 000-7.6zm0 6.2a2.4 2.4 0 110-4.8 2.4 2.4 0 010 4.8z"/>
              <circle cx="17.2" cy="6.8" r="1.25" fill="white"/>
            </svg>
            <span class="home-ig-reels__pill">Reels · Stories · Live from the field</span>
          </div>
          <h2 id="ig-heading" class="home-h2 home-ig-reels__title">Field notes on Instagram</h2>
          <p class="home-ig-reels__lede">Vertical moments from deployments: swipe the rail like Stories, tap through to the feed.</p>
        </div>
        <a class="home-ig-reels__cta btn btn-home-outline" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer">Follow @goukraina</a>
      </div>
      <div class="home-ig-reels__dock">
        <div class="home-ig-reels__viewport" role="region" aria-label="Instagram highlight clips" tabindex="0">
          <ul class="home-ig-reels__track">
            <li class="home-ig-reels__item">
              <a class="home-ig-reels__card" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram: volunteers and delivery in the field">
                <span class="home-ig-reels__media">
                  <img src="{bi}/reh2o/delivery-2.jpg" alt="Field delivery: water relief supplies staged for distribution" width="400" height="711" loading="lazy" decoding="async" />
                  <span class="home-ig-reels__veil" aria-hidden="true"></span>
                  <span class="home-ig-reels__play" aria-hidden="true">
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="20" stroke="white" stroke-opacity="0.35" stroke-width="1.5"/><path d="M19 16l10 6-10 6V16z" fill="white"/></svg>
                  </span>
                  <span class="home-ig-reels__label">Field delivery</span>
                </span>
              </a>
            </li>
            <li class="home-ig-reels__item">
              <a class="home-ig-reels__card" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram: relief truck en route">
                <span class="home-ig-reels__media">
                  <img src="{bi}/reh2o/truck-2.jpg" alt="Relief truck en route delivering humanitarian aid" width="400" height="711" loading="lazy" decoding="async" />
                  <span class="home-ig-reels__veil" aria-hidden="true"></span>
                  <span class="home-ig-reels__play" aria-hidden="true">
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="20" stroke="white" stroke-opacity="0.35" stroke-width="1.5"/><path d="M19 16l10 6-10 6V16z" fill="white"/></svg>
                  </span>
                  <span class="home-ig-reels__label">Convoy route</span>
                </span>
              </a>
            </li>
            <li class="home-ig-reels__item">
              <a class="home-ig-reels__card" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram: inside a water purification station">
                <span class="home-ig-reels__media">
                  <img src="{bi}/reh2o/inside-station.jpg" alt="Interior of a ReH2O water purification station with filtration equipment" width="400" height="711" loading="lazy" decoding="async" />
                  <span class="home-ig-reels__veil" aria-hidden="true"></span>
                  <span class="home-ig-reels__play" aria-hidden="true">
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="20" stroke="white" stroke-opacity="0.35" stroke-width="1.5"/><path d="M19 16l10 6-10 6V16z" fill="white"/></svg>
                  </span>
                  <span class="home-ig-reels__label">Inside ReH2O</span>
                </span>
              </a>
            </li>
            <li class="home-ig-reels__item">
              <a class="home-ig-reels__card" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram: partners meeting">
                <span class="home-ig-reels__media">
                  <img src="{bi}/reh2o/meeting-1.jpeg" alt="Partners coordinating reconstruction and water programs" width="400" height="711" loading="lazy" decoding="async" />
                  <span class="home-ig-reels__veil" aria-hidden="true"></span>
                  <span class="home-ig-reels__play" aria-hidden="true">
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="20" stroke="white" stroke-opacity="0.35" stroke-width="1.5"/><path d="M19 16l10 6-10 6V16z" fill="white"/></svg>
                  </span>
                  <span class="home-ig-reels__label">With partners</span>
                </span>
              </a>
            </li>
            <li class="home-ig-reels__item">
              <a class="home-ig-reels__card" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram: community discussion">
                <span class="home-ig-reels__media">
                  <img src="{bi}/reh2o/meeting-2.jpeg" alt="Community stakeholders in a program coordination meeting" width="400" height="711" loading="lazy" decoding="async" />
                  <span class="home-ig-reels__veil" aria-hidden="true"></span>
                  <span class="home-ig-reels__play" aria-hidden="true">
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="20" stroke="white" stroke-opacity="0.35" stroke-width="1.5"/><path d="M19 16l10 6-10 6V16z" fill="white"/></svg>
                  </span>
                  <span class="home-ig-reels__label">Community</span>
                </span>
              </a>
            </li>
            <li class="home-ig-reels__item">
              <a class="home-ig-reels__card" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram: Ukraine Dreamzzz program">
                <span class="home-ig-reels__media">
                  <img src="{bi}/ukraine-dreamzzz.jpeg" alt="Ukraine Dreamzzz athletes training in boxing and combat sports" width="400" height="711" loading="lazy" decoding="async" />
                  <span class="home-ig-reels__veil" aria-hidden="true"></span>
                  <span class="home-ig-reels__play" aria-hidden="true">
                    <svg width="44" height="44" viewBox="0 0 44 44" fill="none"><circle cx="22" cy="22" r="20" stroke="white" stroke-opacity="0.35" stroke-width="1.5"/><path d="M19 16l10 6-10 6V16z" fill="white"/></svg>
                  </span>
                  <span class="home-ig-reels__label">Dreamzzz</span>
                </span>
              </a>
            </li>
          </ul>
        </div>
        <p class="home-ig-reels__hint"><span class="home-ig-reels__hint-ico" aria-hidden="true">↔</span> Swipe or scroll. Tap any frame for @goukraina</p>
      </div>
    </section>

    <section class="home-blog section reveal" aria-labelledby="field">
      <div class="home-section-head home-section-head--split">
        <div class="home-section-head__text">
          <p class="home-section-kicker">Stories</p>
          <h2 id="field" class="home-h2">From the field</h2>
        </div>
        <a class="home-blog-all" href="blog/index.html">All reports →</a>
      </div>
      <div class="home-blog-grid">
        <article class="home-blog-card">
          <a class="home-blog-card__media" href="blog/ukraine-water-crisis-wash-cluster/index.html">
            <img
              src="{cover_wash}"
              alt="Relief delivery of water purification equipment in Ukraine"
              width="640"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </a>
          <div class="home-blog-card__body">
            <h3><a href="blog/ukraine-water-crisis-wash-cluster/index.html">WASH Cluster partnership</a></h3>
            <p>Scaling solar purification with international coordination where access has collapsed.</p>
            <p class="article-meta">2024 · Field report</p>
          </div>
        </article>
        <article class="home-blog-card">
          <a class="home-blog-card__media" href="initiatives/reh2o/index.html">
            <img
              src="{cover_reh2o_home}"
              alt="ReH2O solar water purification station being installed in Ukraine"
              width="640"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </a>
          <div class="home-blog-card__body">
            <h3><a href="initiatives/reh2o/index.html">ReH2O in Mykolaiv region</a></h3>
            <p>Clean water as a model for resilient municipal recovery.</p>
            <p class="article-meta">2025 · Program update</p>
          </div>
        </article>
        <article class="home-blog-card">
          <a class="home-blog-card__media" href="blog/ukrainian-pows-humanitarian-crisis/index.html">
            <img
              src="{cover_advocacy}"
              alt="Go Ukraina delegation meeting with Ukrainian human rights partners in Kyiv"
              width="640"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </a>
          <div class="home-blog-card__body">
            <h3><a href="blog/ukrainian-pows-humanitarian-crisis/index.html">Advocacy &amp; human rights</a></h3>
            <p>Keeping Ukraine’s humanitarian crises visible to policymakers.</p>
            <p class="article-meta">2024 · Advocacy</p>
          </div>
        </article>
      </div>
    </section>

    <section class="home-events section reveal" aria-labelledby="events">
      <h2 id="events" class="home-h2 home-events-title">Upcoming</h2>
      <div class="home-events-row">
        <article class="home-event-pill">
          <a class="home-event-pill__media" href="{URS_SUMMIT_URL}" target="_blank" rel="noopener noreferrer">
            <img
              src="{img_event_summit}"
              alt="Partners and leaders collaborating at a Go Ukraina summit discussion"
              width="720"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </a>
          <div class="home-event-pill__body">
            <h3>Ukraine Reconstruction Summit 2026</h3>
            <p>September 2026 · Washington D.C.</p>
            <a class="btn btn-primary" href="{URS_SUMMIT_URL}" target="_blank" rel="noopener noreferrer">Details</a>
          </div>
        </article>
        <article class="home-event-pill">
          <a class="home-event-pill__media" href="contact/index.html">
            <img
              src="{img_event_gala}"
              alt="Community partners meeting with the Go Ukraina team"
              width="720"
              height="400"
              loading="lazy"
              decoding="async"
            />
          </a>
          <div class="home-event-pill__body">
            <h3>Los Angeles charity gala</h3>
            <p>TBA · Supporting water &amp; power programs</p>
            <a class="btn btn-primary" href="contact/index.html">Get updates</a>
          </div>
        </article>
      </div>
    </section>
  </main>
{footer_block(depth, "home")}
"""
    write("index.html", body)


def page_about() -> None:
    d = 1
    p = prefix(d)
    title = "About Go Ukraina | Mission, Team & 501(c)(3) Nonprofit"
    desc = (
        "Go Ukraina is a Los Angeles–based 501(c)(3) nonprofit (EIN 88-2011390) rebuilding Ukrainian "
        "communities with clean water, power, advocacy, and youth programs. Meet our mission and leadership team."
    )
    main = f"""
{head_common(
        d,
        title,
        desc,
        "/about",
        og_image_alt="About Go Ukraina — Los Angeles nonprofit for Ukraine humanitarian aid and reconstruction.",
        extra_graph_nodes=about_page_extra_schema(),
    )}
{header_nav(d, "about")}
  <main id="main" class="site-inner about-page">
    <header class="about-hero reveal" aria-labelledby="about-heading">
      <div class="about-hero__wash" aria-hidden="true"></div>
      <div class="about-hero__gridlines" aria-hidden="true"></div>
      <div class="about-hero__inner">
        <div class="about-hero__intro">
          <p class="about-hero__eyebrow">501(c)(3) nonprofit · Founded 2022 · California</p>
          <div class="about-hero__mark" aria-hidden="true"></div>
          <h1 class="about-hero__title" id="about-heading">
            <span class="about-hero__title-line">Rebuilding Ukraine,</span>
            <span class="about-hero__title-line about-hero__title-line--accent">one community at a time</span>
          </h1>
        </div>
        <div class="about-hero__aside">
          <p class="about-hero__lead">
            Born from the Ukrainian-American diaspora in Los Angeles, we pair infrastructure you can photograph with partnerships you can verify: water, power, advocacy, and young people on the field.
          </p>
          <p class="about-hero__meta-strip">
            <span>Los Angeles–based</span>
            <span class="about-hero__meta-dot" aria-hidden="true">·</span>
            <span>EIN 88-2011390</span>
          </p>
        </div>
      </div>
    </header>

    <section class="about-story reveal" aria-labelledby="about-who">
      <div class="about-story__inner">
        <div class="about-story__main">
          <h2 id="about-who" class="about-story__h">Who we are</h2>
          <div class="about-story__prose">
            <p>
              When the full-scale invasion began, millions of Ukrainians lost reliable access to power, shelter, and clean water. Go Ukraina formed as a direct response: not as a fleeting relief drop, but as a long-horizon partner for municipalities and reconstruction agencies.
            </p>
            <p>
              We work beside Ukrainian institutions so projects land where need and accountability intersect: solar water stations, emergency generators, human rights advocacy with the Ombudsman, and Ukraine Dreamzzz for the next generation.
            </p>
          </div>
          <blockquote class="about-pullquote">
            <p>We are not only delivering short-term aid. We are investing in the long-term resilience of Ukraine.</p>
          </blockquote>
        </div>
        <aside class="about-facts" aria-label="At a glance">
          <p class="about-facts__label">At a glance</p>
          <ul class="about-facts__list">
            <li class="about-fact">
              <span class="about-fact__mark" aria-hidden="true">01</span>
              <span class="about-fact__text">Registered 501(c)(3) in California · EIN 88-2011390</span>
            </li>
            <li class="about-fact">
              <span class="about-fact__mark" aria-hidden="true">02</span>
              <span class="about-fact__text">Volunteer-led; public donations are directed to programmatic work</span>
            </li>
            <li class="about-fact">
              <span class="about-fact__mark" aria-hidden="true">03</span>
              <span class="about-fact__text">Direct collaboration with Ukrainian authorities &amp; partners</span>
            </li>
            <li class="about-fact">
              <span class="about-fact__mark" aria-hidden="true">04</span>
              <span class="about-fact__text">Diaspora-led board and field-truth reporting</span>
            </li>
          </ul>
        </aside>
      </div>
    </section>

    <section class="about-team reveal" aria-labelledby="leadership">
      <div class="about-team__head">
        <h2 id="leadership" class="about-team__title">Leadership</h2>
        <p class="about-team__intro">People who bridge Los Angeles and Ukraine with operational discipline and heart.</p>
      </div>
      <div class="about-team-grid">
        <article class="about-team-card">
          <div class="about-team-card__media about-team-card__media--german">
            <img src="{SITE_MEDIA}/german-simakovski.png" alt="Portrait of German Simakovski" width="400" height="400" loading="lazy" decoding="async" />
          </div>
          <div class="about-team-card__body">
            <h3 class="about-team-card__name">German Simakovski</h3>
            <p class="about-team-card__role">President &amp; Co-founder</p>
            <p class="about-team-card__bio">Spearheading strategic partnerships and operations, driving our clean water and energy infrastructure deployments.</p>
          </div>
        </article>
        <article class="about-team-card">
          <div class="about-team-card__media about-team-card__media--olena">
            <img src="{SITE_MEDIA}/olena-simakovski.png" alt="Portrait of Olena Simakovski" width="400" height="400" loading="lazy" decoding="async" />
          </div>
          <div class="about-team-card__body">
            <h3 class="about-team-card__name">Olena Simakovski</h3>
            <p class="about-team-card__role">Executive Director &amp; Co-founder</p>
            <p class="about-team-card__bio">Leading advocacy, fundraising initiatives, and the organization of the Ukraine Reconstruction Summit.</p>
          </div>
        </article>
        <article class="about-team-card">
          <div class="about-team-card__media">
            <img src="{SITE_MEDIA}/adrien-tompert.jpg" alt="Portrait of Adrien Tompert" width="400" height="400" loading="lazy" decoding="async" />
          </div>
          <div class="about-team-card__body">
            <h3 class="about-team-card__name">Adrien Tompert</h3>
            <p class="about-team-card__role">Program Development Associate</p>
            <p class="about-team-card__bio">A driven aspiring healthcare professional who has traveled to Ukraine to directly support humanitarian initiatives and fundraising efforts.</p>
          </div>
        </article>
        <article class="about-team-card">
          <div class="about-team-card__media">
            <img src="{SITE_MEDIA}/nikol-bohach.png" alt="Portrait of Nikol Bohach" width="400" height="400" loading="lazy" decoding="async" />
          </div>
          <div class="about-team-card__body">
            <h3 class="about-team-card__name">Nikol Bohach</h3>
            <p class="about-team-card__role">Co-founder</p>
            <p class="about-team-card__bio">Exemplifying the spirit of service and commitment to international solidarity, coordinating Go Ukraina&apos;s operations.</p>
          </div>
        </article>
      </div>
    </section>

    <section class="about-cta reveal" aria-labelledby="about-cta-h">
      <div class="about-cta__card">
        <h2 id="about-cta-h" class="about-cta__title">Go deeper</h2>
        <p class="about-cta__text">See where resources go, read field reports, or fund the next deployment.</p>
        <div class="about-cta__actions">
          <a class="btn btn-primary" href="impact/index.html">Transparency &amp; impact</a>
          <a class="btn btn-home-outline" href="blog/index.html">Field reports</a>
          <a class="btn btn-gold" href="donate/index.html">Donate</a>
        </div>
      </div>
    </section>
  </main>
{footer_block(d, "about")}
"""
    write("about/index.html", main)


def page_reh2o() -> None:
    d = 2
    title = "ReH2O Clean Water Project | Go Ukraina"
    desc = "Deploying solar-powered reverse osmosis water stations to communities across Ukraine that have lost access to clean water."
    imgs = [
        "reh2o/delivery-1.jpg",
        "reh2o/delivery-2.jpg",
        "reh2o/station-interior.jpeg",
        "reh2o/crane-station.jpg",
        "reh2o/truck-1.jpg",
        "reh2o/truck-2.jpg",
        "reh2o/inside-station.jpg",
        "reh2o/team-station.jpg",
        "reh2o/meeting-1.jpeg",
        "reh2o/meeting-2.jpeg",
    ]
    img_alts = [
        "Water station components staged for delivery to a Ukrainian community",
        "Relief delivery and logistics for clean water equipment",
        "Interior of a solar-powered water purification station",
        "Deploying a ReH2O station with crane support at a community site",
        "Truck carrying emergency water infrastructure supplies",
        "Relief convoy transporting equipment for clean water programs",
        "Operators inside a purification unit inspecting filtration systems",
        "Field team and partners at a deployed water station",
        "Coordination meeting with partners on regional water recovery",
        "Stakeholders discussing program outcomes and next deployments",
    ]
    gal = "".join(
        f'<figure><img src="{SITE_MEDIA}/{p}" alt="{html_lib.escape(img_alts[i])}" loading="lazy" width="600" height="450" /></figure>'
        for i, p in enumerate(imgs)
    )
    sol_solar = ai_prompt_image(
        "Documentary photograph of solar panels mounted on a mobile water purification unit in a field, "
        "off-grid humanitarian technology, soft daylight, realistic, no text or logos"
    )
    sol_ro = ai_prompt_image(
        "Industrial reverse osmosis water filtration skid, stainless steel pipes and membrane housings, "
        "clean water engineering, shallow depth of field, realistic, no text"
    )
    sol_capacity = ai_prompt_image(
        "High-volume community water dispensing from modern purification station, families with containers, "
        "humanitarian infrastructure, photorealistic, respectful, no text"
    )
    html = f"""
{head_common(d, title, desc, "/initiatives/reh2o")}
{header_nav(d, "init-reh2o")}
  <main id="main" class="site-inner reh2o-page">
    <header class="power-hero reveal" style="--power-hero-bg: url('{SITE_MEDIA}/reh2o/crane-station.jpg')">
      <div class="power-hero__noise" aria-hidden="true"></div>
      <div class="power-hero__accent" aria-hidden="true"></div>
      <div class="power-hero__inner">
        <p class="power-hero__kicker">Flagship Initiative</p>
        <h1 class="power-hero__title">ReH2O: Solar-Powered Clean Water for Ukraine</h1>
        <p class="power-hero__lead">Deploying independent, high-capacity reverse osmosis stations to communities whose water infrastructure has been destroyed by war.</p>
      </div>
    </header>
    <section class="section reh2o-section reveal">
      <h2 class="section-title">The Crisis</h2>
      <div class="article-body">
        <p>Since the full-scale invasion, attacks on civilian infrastructure have decimated municipal water systems across Ukraine. The Ukraine water crisis is immense; millions lack reliable access to safe drinking water.</p>
        <p>Without power, pumping stations fail. Without treatment facilities, disease spreads. Bottled water delivery is expensive, logistically complex, and unsustainable for long-term survival in conflict zones.</p>
      </div>
    </section>
    <section class="section section-alt reh2o-section reveal">
      <h2 class="section-title">Our Solution</h2>
      <div class="card-grid reh2o-card-grid">
        <article class="card reh2o-solution-card">
          <div class="reh2o-solution-card__media">
            <img src="{sol_solar}" alt="Illustration: solar panels on a mobile water purification unit" width="800" height="500" loading="lazy" decoding="async" />
          </div>
          <div class="reh2o-solution-card__body">
            <h3>Solar Independence</h3>
            <p>Units operate entirely off-grid, ensuring continuous clean water even during total blackouts.</p>
          </div>
        </article>
        <article class="card reh2o-solution-card">
          <div class="reh2o-solution-card__media">
            <img src="{sol_ro}" alt="Illustration: industrial reverse osmosis filtration equipment" width="800" height="500" loading="lazy" decoding="async" />
          </div>
          <div class="reh2o-solution-card__body">
            <h3>Reverse Osmosis</h3>
            <p>Industrial-grade purification removes toxins, heavy metals, and pathogens from compromised sources.</p>
          </div>
        </article>
        <article class="card reh2o-solution-card">
          <div class="reh2o-solution-card__media">
            <img src="{sol_capacity}" alt="Illustration: high-volume clean water distribution for a community" width="800" height="500" loading="lazy" decoding="async" />
          </div>
          <div class="reh2o-solution-card__body">
            <h3>High Capacity</h3>
            <p>Each station can process enough daily drinking water to sustain an entire neighborhood or hospital.</p>
          </div>
        </article>
      </div>
    </section>
    <section class="section reh2o-section reveal">
      <h2 class="section-title">See ReH2O In Action</h2>
      <p class="section-intro reh2o-section__intro">Watch how our solar-powered purification units are engineered and deployed to bring clean water to Ukraine's most vulnerable communities.</p>
      <div class="reh2o-video-grid">
        <figure class="reh2o-video">
          <div class="reh2o-video__frame">
            <video controls playsinline preload="metadata" poster="{SITE_MEDIA}/reh2o/delivery-1.jpg" aria-label="ReH2O field deployment video">
              <source src="{REH2O_VIDEOS_BASE}/reh2o-project.mp4" type="video/mp4" />
            </video>
          </div>
          <figcaption class="reh2o-video__cap">
            <h3>ReH2O Field Deployment</h3>
            <p>Documentation of station delivery and its impact on the communities we serve.</p>
          </figcaption>
        </figure>
        <figure class="reh2o-video">
          <div class="reh2o-video__frame">
            <video controls playsinline preload="metadata" poster="{SITE_MEDIA}/reh2o/station-interior.jpeg" aria-label="ReH2O station 3D overview video">
              <source src="{REH2O_VIDEOS_BASE}/reh2o-3d.mp4" type="video/mp4" />
            </video>
          </div>
          <figcaption class="reh2o-video__cap">
            <h3>ReH2O Station — 3D Overview</h3>
            <p>A detailed look at the engineering and components behind each solar-powered purification unit.</p>
          </figcaption>
        </figure>
      </div>
    </section>
    <section class="section section-alt reh2o-section reh2o-section--gallery reveal">
      <h2 class="section-title section-title--sub">Station Delivery Gallery</h2>
      <p class="section-intro">From factory to field — photos documenting the manufacturing, transport, and deployment of our ReH2O purification stations.</p>
      <div class="gallery-grid reh2o-gallery">{gal}</div>
    </section>
    <section class="section reh2o-section reh2o-section--150 reveal" aria-labelledby="reh2o-150-heading">
      <h2 id="reh2o-150-heading" class="section-title">The 150 Station Plan</h2>
      <div class="article-body reh2o-150-plan">
        <p class="reh2o-150-plan__lead">The ReH2O model is proven. Now, we must scale. Go Ukraina aims to deploy 150 ReH2O stations across the most vulnerable regions of Ukraine over the next 24 months. We cannot do this without your support.</p>
        <h3 class="reh2o-150-plan__h">$80,000 Funds One Complete Station</h3>
        <p>A single donation of $80,000 covers the manufacturing, logistics, and installation of a full unit — each station produces 100,000 liters of clean filtered water every day, securing safe drinking water for thousands of people.</p>
        <p class="reh2o-150-plan__cta"><a class="btn btn-primary" href="../../donate/index.html">Partner With Us</a></p>
      </div>
    </section>
  </main>
{footer_block(d, "init-reh2o")}
"""
    write("initiatives/reh2o/index.html", html)


def page_power() -> None:
    d = 2
    title = "Emergency Power Generators for Ukraine | Go Ukraina"
    desc = "Go Ukraina delivers emergency backup power generators to hospitals, schools, and heating centers in war-affected Ukraine. Help keep critical infrastructure running."
    ph = POWER_INIT_PLACEHOLDER
    html = f"""
{head_common(d, title, desc, "/initiatives/power-generators")}
{header_nav(d, "init-power")}
  <main id="main" class="site-inner power-page">
    <header class="power-hero reveal" style="--power-hero-bg: url('{ph}')">
      <div class="power-hero__noise" aria-hidden="true"></div>
      <div class="power-hero__accent" aria-hidden="true"></div>
      <div class="power-hero__inner">
        <p class="power-hero__kicker">Critical infrastructure · Winter readiness</p>
        <h1 class="power-hero__title">When the grid goes quiet, power still has to answer</h1>
        <p class="power-hero__lead">
          Go Ukraina routes industrial and portable generators to hospitals, schools, and heating centers across war-affected Ukraine—so wards stay lit, classrooms warm, and neighbors aren&apos;t left in the dark.
        </p>
      </div>
    </header>

    <section class="power-metrics reveal" aria-label="Program reach">
      <ul class="power-metrics__list">
        <li class="power-metrics__item">
          <span class="power-metrics__value">150+</span>
          <span class="power-metrics__label">Generators delivered since 2022</span>
        </li>
        <li class="power-metrics__item power-metrics__item--accent">
          <span class="power-metrics__value">$100</span>
          <span class="power-metrics__label">Roughly one week of fuel for a deployed unit in high demand</span>
        </li>
        <li class="power-metrics__item">
          <span class="power-metrics__value">24/7</span>
          <span class="power-metrics__label">Stakes when blackouts hit medical and social infrastructure</span>
        </li>
      </ul>
    </section>

    <section class="power-split section reveal" aria-labelledby="power-impact-h">
      <div class="power-split__main">
        <h2 id="power-impact-h" class="section-title">Amperage where it saves lives</h2>
        <div class="article-body power-article">
          <p>
            A single high-capacity generator can carry a hospital wing: ventilators, operating lights, incubators—still running when the city goes dark. Smaller units reach elders in isolated housing and keep heating circulation points alive in freezing months.
          </p>
          <p>
            Our logistics pair donor generosity with partner assessments so units land where outages are deadliest, not where paperwork is easiest.
          </p>
        </div>
      </div>
      <aside class="power-split__rail" aria-label="Funding note">
        <p class="power-split__stat">$100 = ~1 week of fuel</p>
        <p class="power-split__note">Fuel is the recurring line item that keeps donated hardware useful after delivery. Gifts of any size stack toward the next tank and the next route east.</p>
      </aside>
    </section>

    <figure class="power-photo reveal">
      <div class="power-photo__frame">
        <img
          src="{ph}"
          alt="Placeholder image for field photograph of emergency power deployment—replace with production asset when available"
          width="1600"
          height="900"
          loading="lazy"
          decoding="async"
          class="power-photo__img"
        />
      </div>
      <figcaption class="power-photo__cap">
        Placeholder image — replace with a field photo (e.g. unloading generators in Kharkiv) when production assets are ready.
      </figcaption>
    </figure>

    <section class="power-ways section section-alt reveal" aria-labelledby="power-ways-h">
      <h2 id="power-ways-h" class="section-title">Where generators go</h2>
      <p class="section-intro power-ways__intro">Sized to facility need: from neighborhood resilience to clinical intensity.</p>
      <ul class="power-ways__list">
        <li class="power-way">
          <span class="power-way__name">Hospitals &amp; clinics</span>
          <span class="power-way__desc">Industrial units that can shoulder wings or departments through rolling blackouts.</span>
        </li>
        <li class="power-way">
          <span class="power-way__name">Schools &amp; shelters</span>
          <span class="power-way__desc">Keeping gathering spaces lit and warm so services don&apos;t pause when the grid drops.</span>
        </li>
        <li class="power-way">
          <span class="power-way__name">Homes &amp; elders</span>
          <span class="power-way__desc">Portable sets for isolated households that can&apos;t wait for macro grid repair.</span>
        </li>
      </ul>
    </section>

    <section class="power-closer reveal">
      <div class="power-closer__card">
        <h2 class="power-closer__title">Power the next shipment</h2>
        <p class="power-closer__text">
          Winter returns every year; the need for dispatchable power does too. Fund fuel, transport, and sourcing so the next generators leave the warehouse before the next freeze.
        </p>
        <div class="power-closer__actions">
          <a class="btn btn-primary" href="../../donate/index.html">Donate</a>
          <a class="btn btn-home-outline" href="../../contact/index.html">Talk logistics</a>
        </div>
      </div>
    </section>
  </main>
{footer_block(d, "init-power")}
"""
    write("initiatives/power-generators/index.html", html)


def page_advocacy() -> None:
    d = 2
    title = "Advocacy: Human Rights & Humanitarian Policy | Go Ukraina"
    desc = "Go Ukraina partners with the Ukrainian Ombudsman for Human Rights to advocate for Ukrainian POWs, abducted children, and civilian protection."
    html = f"""
{head_common(d, title, desc, "/initiatives/advocacy")}
{header_nav(d, "init-advocacy")}
  <main id="main" class="site-inner">
    <header class="power-hero reveal" style="--power-hero-bg: url('{SITE_MEDIA}/ombudsman-meeting.jpg')">
      <div class="power-hero__noise" aria-hidden="true"></div>
      <div class="power-hero__accent" aria-hidden="true"></div>
      <div class="power-hero__inner">
        <p class="power-hero__kicker">Human Rights Advocacy</p>
        <h1 class="power-hero__title">Standing up for Every Ukrainian</h1>
        <p class="power-hero__lead">Go Ukraina partners with the Office of the Ukrainian Parliament Commissioner for Human Rights to advance accountability, secure prisoner releases, and fight for the return of abducted children.</p>
      </div>
    </header>
    <section class="section reveal">
      <h2 class="section-title">Official Partnership: Office of the Ombudsman of Ukraine</h2>
      <div class="article-body">
        <p>Go Ukraina has established a formal working partnership with the Office of the Ukrainian Parliament Commissioner for Human Rights, led by Commissioner Dmytro Lubinets.</p>
        <p>This partnership enables us to serve as a transatlantic bridge, amplifying the Ombudsman's documentation of human rights violations to U.S. policy institutions, advocacy organizations, and international humanitarian partners.</p>
        <p>Together, we coordinate outreach, policy briefings, and diplomatic engagement focused on two of the most urgent humanitarian crises of the war: the release of Ukrainian prisoners of war and the return of children unlawfully deported or forcibly transferred from Ukraine to Russia.</p>
      </div>
      <div class="partner-strip reveal">
        <img src="{SITE_MEDIA}/ombudsman-logo.png" alt="Office of the Ombudsman of Ukraine logo" loading="lazy" width="200" height="120" />
      </div>
    </section>
    <section class="section section-alt reveal">
      <h2 class="section-title">Our Advocacy Focus Areas</h2>
      <p class="section-intro">Guided by the Ombudsman's documented evidence, Go Ukraina advances four interlocking areas of advocacy.</p>
      <div class="card-grid">
        <article class="card"><h3>Prisoners of War</h3><p>Coordinating international advocacy and diplomatic engagement to secure the release of Ukrainian military personnel and civilians held as prisoners of war, drawing on documented evidence of torture and violations of the Geneva Conventions.</p></article>
        <article class="card"><h3>Abducted Children</h3><p>Raising awareness and driving policy action on the systematic deportation and forced transfer of Ukrainian children to Russia. One of the most grave violations of international humanitarian law documented in this conflict.</p></article>
        <article class="card"><h3>Accountability &amp; Justice</h3><p>Supporting international legal mechanisms to document, preserve, and prosecute war crimes, ensuring that violations of international humanitarian and human rights law are met with accountability.</p></article>
        <article class="card"><h3>Transatlantic Engagement</h3><p>Hosting high-level virtual policy briefings that connect the Ombudsman's office directly with U.S. congressional offices, advocacy organizations, and humanitarian partners to strengthen coordinated international action.</p></article>
      </div>
    </section>
    <section class="section reveal">
      <h2 class="section-title">Upcoming Event: High-Level Policy Briefing on Ukrainian POWs &amp; Abducted Children</h2>
      <div class="article-body">
        <p>The Office of the Ukrainian Parliament Commissioner for Human Rights, in cooperation with Go Ukraina, is organizing a high-level virtual policy briefing with Commissioner Dmytro Lubinets.</p>
        <p>This briefing will provide a direct institutional update on documented violations of international humanitarian and human rights law, the systematic deportation of Ukrainian children, and ongoing diplomatic and humanitarian coordination efforts.</p>
        <p>Participants will hear directly from Commissioner Lubinets on the legal mechanisms being pursued, the current status of prisoner exchange negotiations, and the international accountability processes underway.</p>
        <ul>
          <li><strong>Format:</strong> Virtual Policy Briefing (Zoom)</li>
          <li><strong>Speaker:</strong> Dmytro Lubinets, Ukrainian Parliament Commissioner for Human Rights</li>
          <li><strong>Duration:</strong> 45–60 minutes including moderated Q&amp;A</li>
          <li><strong>Language:</strong> Ukrainian with English translation</li>
        </ul>
        <p><strong>Request to Participate</strong></p>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--space-md);margin-top:var(--space-md)">
        <img src="{SITE_MEDIA}/ombudsman-meeting.jpg" alt="Go Ukraina delegation meeting with Ombudsman Dmytro Lubinets in Kyiv" loading="lazy" width="600" height="400" />
        <img src="{SITE_MEDIA}/ombudsman-kyiv.jpg" alt="Human Rights Topics in Ukraine: Ombudsman's office team at high-level briefing in Kyiv" loading="lazy" width="600" height="400" />
      </div>
    </section>
    <section class="section section-alt reveal">
      <div class="donate-panel">
        <h2 class="section-title">Support Our Advocacy Work</h2>
        <p class="section-intro">Every dollar supports our ability to maintain institutional partnerships, host policy briefings, and keep Ukraine's human rights crisis visible on the international stage.</p>
        <a class="btn btn-primary" href="../../donate/index.html">Partner With Us</a>
      </div>
    </section>
  </main>
{footer_block(d, "init-advocacy")}
"""
    write("initiatives/advocacy/index.html", html)


def dreamzzz_extra_schema() -> list[dict]:
    """BreadcrumbList for initiative page (SEO)."""
    base = SITE_ORIGIN
    url = f"{base}/initiatives/ukraine-dreamzzz"
    return [
        {
            "@type": "BreadcrumbList",
            "@id": f"{url}#breadcrumb",
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": 1,
                    "name": "Home",
                    "item": f"{base}/",
                },
                {
                    "@type": "ListItem",
                    "position": 2,
                    "name": "Ukraine Dreamzzz",
                    "item": url,
                },
            ],
        },
    ]


def page_dream() -> None:
    d = 2
    title = "Ukraine Dreamzzz | Boxing, MMA & Kickboxing for Youth | Go Ukraina"
    desc = (
        "Train in Miami with elite coaches. Ukraine Dreamzzz backs young Ukrainian athletes in boxing, MMA & kickboxing—housing, competitions, and leadership through Go Ukraina, a Los Angeles 501(c)(3)."
    )
    og_img = f"{SITE_ORIGIN}{SITE_MEDIA}/ukraine-dreamzzz.jpeg"
    html = f"""
{head_common(
        d,
        title,
        desc,
        "/initiatives/ukraine-dreamzzz",
        og_image=og_img,
        og_image_alt="Ukraine Dreamzzz athletes training — combat sports and leadership program",
        extra_graph_nodes=dreamzzz_extra_schema(),
    )}
{header_nav(d, "init-dream")}
  <main id="main" class="site-inner power-page dreamzzz-page">
    <header class="power-hero power-hero--dreamzzz reveal" style="--power-hero-bg: url('{SITE_MEDIA}/ukraine-dreamzzz.jpeg')" aria-labelledby="dreamzzz-hero-title">
      <div class="power-hero__noise" aria-hidden="true"></div>
      <div class="power-hero__accent power-hero__accent--dreamzzz" aria-hidden="true"></div>
      <div class="power-hero__veil power-hero__veil--dreamzzz" aria-hidden="true"></div>
      <div class="power-hero__inner power-hero__inner--dreamzzz">
        <p class="power-hero__kicker power-hero__kicker--dreamzzz">Combat sports · Leadership · Go Ukraina</p>
        <div class="dreamzzz-hero__mark" aria-hidden="true"></div>
        <h1 class="power-hero__title power-hero__title--dreamzzz" id="dreamzzz-hero-title">Ukraine <span class="dreamzzz-hero__title-accent">Dreamzzz</span></h1>
        <p class="power-hero__lead power-hero__lead--dreamzzz">Train hard. Represent Ukraine. We back disciplined young athletes in <strong>boxing</strong>, <strong>MMA</strong>, and <strong>kickboxing</strong>—elite coaching, structured housing, and a Miami training hub, powered by a California <strong>501(c)(3)</strong> nonprofit.</p>
        <ul class="dreamzzz-hero__chips" aria-label="Program highlights">
          <li>Miami, USA</li>
          <li>International exposure</li>
          <li>Sponsors &amp; mentorship</li>
        </ul>
      </div>
    </header>

    <section class="dreamzzz-band dreamzzz-band--story reveal" aria-labelledby="dreamzzz-mission">
      <div class="dreamzzz-band__inner">
        <h2 id="dreamzzz-mission" class="dreamzzz-h2">Built for athletes who refuse to quit</h2>
        <p class="dreamzzz-lede">Ukraine Dreamzzz exists for young Ukrainians with the talent and grit to rise in combat sports—not as a one-off trip, but as a serious athletic pathway with accountability on and off the mat.</p>
        <blockquote class="dreamzzz-quote">
          <p>Discipline in the gym becomes leadership in the community.</p>
        </blockquote>
        <p>Through Go Ukraina, athletes access professional coaching, safe housing, competition calendars, and sponsor introductions—so potential turns into a career arc, not just a highlight reel.</p>
      </div>
    </section>

    <section class="dreamzzz-pillars reveal" aria-labelledby="dreamzzz-pillars-h">
      <div class="dreamzzz-pillars__head">
        <h2 id="dreamzzz-pillars-h" class="dreamzzz-h2">What athletes receive</h2>
        <p class="dreamzzz-pillars__sub">Everything listed below is coordinated with Go Ukraina staff and partner coaches—clear expectations, real structure.</p>
      </div>
      <ol class="dreamzzz-pillars__list">
        <li class="dreamzzz-pillar"><span class="dreamzzz-pillar__n" aria-hidden="true">01</span><div class="dreamzzz-pillar__body"><h3 class="dreamzzz-pillar__h">Pro-level coaching</h3><p class="dreamzzz-pillar__p">Experienced trainers across boxing, MMA, and kickboxing—technique, conditioning, and fight IQ.</p></div></li>
        <li class="dreamzzz-pillar"><span class="dreamzzz-pillar__n" aria-hidden="true">02</span><div class="dreamzzz-pillar__body"><h3 class="dreamzzz-pillar__h">Housing &amp; rhythm</h3><p class="dreamzzz-pillar__p">A stable environment that mirrors the discipline of elite sport—not chaos between sessions.</p></div></li>
        <li class="dreamzzz-pillar"><span class="dreamzzz-pillar__n" aria-hidden="true">03</span><div class="dreamzzz-pillar__body"><h3 class="dreamzzz-pillar__h">Miami training base</h3><p class="dreamzzz-pillar__p">USA training blocks in Miami—access to sparring partners, clubs, and the American fight ecosystem.</p></div></li>
        <li class="dreamzzz-pillar"><span class="dreamzzz-pillar__n" aria-hidden="true">04</span><div class="dreamzzz-pillar__body"><h3 class="dreamzzz-pillar__h">Competition &amp; visibility</h3><p class="dreamzzz-pillar__p">Tournament entries and exposure so scouts and promoters can see your work.</p></div></li>
        <li class="dreamzzz-pillar"><span class="dreamzzz-pillar__n" aria-hidden="true">05</span><div class="dreamzzz-pillar__body"><h3 class="dreamzzz-pillar__h">Character &amp; leadership</h3><p class="dreamzzz-pillar__p">Mentorship that treats you as a future ambassador—not only a competitor.</p></div></li>
        <li class="dreamzzz-pillar"><span class="dreamzzz-pillar__n" aria-hidden="true">06</span><div class="dreamzzz-pillar__body"><h3 class="dreamzzz-pillar__h">Sponsor pathways</h3><p class="dreamzzz-pillar__p">Support building long-term partnerships so talent doesn’t stall for lack of backing.</p></div></li>
      </ol>
    </section>

    <figure class="dreamzzz-figure reveal">
      <div class="dreamzzz-figure__frame">
        <img src="{SITE_MEDIA}/ukraine-dreamzzz.jpeg" alt="Ukraine Dreamzzz athletes in training — boxing and combat sports development program supported by Go Ukraina" width="1200" height="750" loading="lazy" decoding="async" />
      </div>
      <figcaption class="dreamzzz-figure__cap">Field energy: Ukraine Dreamzzz connects young athletes to coaching, housing, and competition opportunities.</figcaption>
    </figure>

    <section class="dreamzzz-finale reveal" aria-labelledby="dreamzzz-apply">
      <div class="dreamzzz-finale__inner">
        <h2 id="dreamzzz-apply" class="dreamzzz-finale__title">Ready to step into the program?</h2>
        <p class="dreamzzz-finale__text">Tell us about your training history and goals—we reply to serious inquiries from athletes and guardians.</p>
        <div class="dreamzzz-finale__actions">
          <a class="btn btn-primary dreamzzz-finale__btn" href="../../contact/index.html">Apply &amp; contact</a>
          <a class="btn btn-gold dreamzzz-finale__btn" href="../../donate/index.html">Fund youth athletics</a>
        </div>
        <p class="dreamzzz-finale__email">Or write directly: <a href="mailto:info@goukraina.com">info@goukraina.com</a></p>
      </div>
    </section>
  </main>
{footer_block(d, "init-dream")}
"""
    write("initiatives/ukraine-dreamzzz/index.html", html)


def page_summit() -> None:
    d = 1
    title = "Ukraine Reconstruction Summit | Go Ukraina"
    desc = "The Ukrainian Reconstruction Summit brings together leaders, donors, and organizations to coordinate humanitarian aid and reconstruction efforts."
    bi = SITE_MEDIA
    html = f"""
{head_common(d, title, desc, "/summit")}
{header_nav(d, "summit")}
  <main id="main" class="site-inner summit-page">
    <header class="summit-hero reveal" aria-labelledby="summit-hero-title">
      <div class="summit-hero__aurora" aria-hidden="true"></div>
      <span class="summit-hero__orb summit-hero__orb--1" aria-hidden="true"></span>
      <span class="summit-hero__orb summit-hero__orb--2" aria-hidden="true"></span>
      <span class="summit-hero__orb summit-hero__orb--3" aria-hidden="true"></span>
      <div class="summit-hero__inner">
        <p class="summit-hero__eyebrow">Washington D.C. · September 2026</p>
        <h1 id="summit-hero-title" class="summit-hero__title">Ukraine Reconstruction Summit</h1>
        <p class="summit-hero__tag">“From War to Renaissance”</p>
        <p class="summit-hero__lead">Investors, policymakers, NGO leaders, and the Ukrainian diaspora. One room, one mission: rebuild with integrity, speed, and hope.</p>
        <div class="summit-hero__meta">
          <span class="summit-pill">300+ leaders</span>
          <span class="summit-pill summit-pill--gold">Clean water · Energy · FDI</span>
        </div>
        <div class="summit-hero__actions">
          <a class="btn btn-gold summit-hero__cta" href="../donate/index.html">Support the mission</a>
          <a class="btn btn-primary summit-hero__cta" href="#summit-notify">Get summit updates</a>
        </div>
      </div>
      <div class="summit-hero__visual" aria-hidden="true">
        <div class="summit-hero__frame">
          <img src="{bi}/reh2o/meeting-2.jpeg" alt="Regional partnership meeting—visual for Ukraine Reconstruction Summit hero" width="720" height="900" loading="eager" decoding="async" />
        </div>
        <svg class="summit-hero__ring" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="100" cy="100" r="96" fill="none" stroke="url(#summit-ring)" stroke-width="0.75" opacity="0.5"/>
          <defs>
            <linearGradient id="summit-ring" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="oklch(88% 0.16 95)"/>
              <stop offset="100%" stop-color="oklch(45% 0.14 255)"/>
            </linearGradient>
          </defs>
        </svg>
      </div>
    </header>

    <div class="summit-marquee" aria-hidden="true">
      <div class="summit-marquee__track">
        <span>Energy resilience</span><span>Clean water infrastructure</span><span>Foreign direct investment</span><span>Diaspora partnerships</span><span>Accountability</span>
        <span>Energy resilience</span><span>Clean water infrastructure</span><span>Foreign direct investment</span><span>Diaspora partnerships</span><span>Accountability</span>
      </div>
    </div>

    <section class="summit-stats reveal" aria-label="Summit scale">
      <div class="summit-stats__grid">
        <div class="summit-stat">
          <span class="summit-stat__num">260+</span>
          <span class="summit-stat__label">Leaders · 2025 (MGM National Harbor)</span>
        </div>
        <div class="summit-stat">
          <span class="summit-stat__num">2026</span>
          <span class="summit-stat__label">Expanded program &amp; partnerships</span>
        </div>
        <div class="summit-stat">
          <span class="summit-stat__num">24+</span>
          <span class="summit-stat__label">Months of momentum since launch</span>
        </div>
      </div>
    </section>

    <section class="summit-split reveal" aria-labelledby="summit-about">
      <div class="summit-split__media">
        <img src="{bi}/reh2o/meeting-2.jpeg" alt="Partners at a regional cooperation discussion in Mykolaiv" width="800" height="600" loading="lazy" decoding="async" />
        <div class="summit-split__accent" aria-hidden="true"></div>
      </div>
      <div class="summit-split__copy">
        <h2 id="summit-about" class="summit-h2">Where pledges become projects</h2>
        <p class="summit-lead">The Ukraine Reconstruction Summit is the premier gathering for turning dialogue into delivery, linking capital, policy, and on-the-ground NGOs including Go Ukraina’s water and power programs.</p>
        <p>Co-chaired by <strong>German Simakovski</strong> and <strong>Olena Simakovski</strong>, the 2025 convening welcomed more than 260 decision-makers. In 2026 we go deeper: energy security, municipal water systems, and investment frameworks that respect Ukrainian institutions and communities.</p>
        <ul class="summit-checks">
          <li>Curated rooms for investors &amp; municipalities</li>
          <li>Field-honest reporting from NGO implementers</li>
          <li>Evening receptions designed for durable partnerships</li>
        </ul>
      </div>
    </section>

    <section class="summit-gallery reveal" aria-labelledby="summit-gallery-h">
      <div class="summit-gallery__head">
        <h2 id="summit-gallery-h" class="summit-h2">Moments from the journey</h2>
        <p class="summit-gallery__sub">Faces, places, and the work that continues after the last session ends.</p>
      </div>
      <div class="summit-bento">
        <figure class="summit-bento__item summit-bento__item--tall">
          <img src="{bi}/reh2o/crane-station.jpg" alt="ReH2O water station deployment" width="600" height="800" loading="lazy" />
          <figcaption>Reconstruction in motion: clean water where pipes failed.</figcaption>
        </figure>
        <figure class="summit-bento__item">
          <img src="{bi}/ombudsman-meeting.jpg" alt="Advocacy partnership meeting" width="800" height="520" loading="lazy" />
          <figcaption>Advocacy &amp; human rights: bridges to policymakers.</figcaption>
        </figure>
        <figure class="summit-bento__item">
          <img src="{bi}/reh2o/team-station.jpg" alt="Field team at a water station" width="720" height="480" loading="lazy" />
          <figcaption>Teams on the ground: transparency you can photograph.</figcaption>
        </figure>
        <figure class="summit-bento__item summit-bento__item--wide">
          <img src="{bi}/reh2o/truck-1.jpg" alt="Logistics and delivery" width="960" height="480" loading="lazy" />
          <figcaption>Logistics that keep generators and stations moving.</figcaption>
        </figure>
      </div>
    </section>

    <section class="summit-timeline reveal" aria-labelledby="summit-tl">
      <h2 id="summit-tl" class="summit-h2 summit-timeline__title">The arc</h2>
      <ol class="summit-timeline__list">
        <li class="summit-timeline__step">
          <span class="summit-timeline__year">2025</span>
          <p><strong>MGM National Harbor.</strong> 260+ leaders; foundations laid for energy, water, and investment dialogues.</p>
        </li>
        <li class="summit-timeline__step summit-timeline__step--future">
          <span class="summit-timeline__year">2026</span>
          <p><strong>Washington D.C.</strong> Expanded agenda, more cross-border deals, and a sharper focus on resilient infrastructure.</p>
        </li>
      </ol>
    </section>

    <section class="summit-notify section section-alt reveal" id="summit-notify" aria-labelledby="summit-notify-h">
      <div class="summit-notify__card">
        <h2 id="summit-notify-h" class="summit-h2">Get notified for 2026</h2>
        <p class="summit-notify__intro">Early access to tickets, speaker releases, and sponsorship briefings, straight to your inbox.</p>
        <form id="summit-notify-form" class="form-grid summit-notify__form">
          <div>
            <label for="sn-email">Email</label>
            <input type="email" id="sn-email" name="email" required autocomplete="email" placeholder="you@example.com" />
          </div>
          <button type="submit" class="btn btn-primary">Notify me</button>
        </form>
      </div>
    </section>
  </main>
{footer_block(d, "summit")}
"""
    write("summit/index.html", html)


def page_impact() -> None:
    d = 1
    title = "Transparency & Impact | Go Ukraina"
    desc = "See exactly where your donation goes. View our impact dashboard, financial transparency reports, and 501(c)(3) status for Go Ukraina."
    partners = [
        ("partners/ombudsman.png", "Office of the Ombudsman of Ukraine"),
        ("partners/consulate-sf.jpg", "Ukrainian Consulate San Francisco"),
        ("partners/reua.png", "REUA: Rebuild Our Ukraine"),
        ("partners/partner-4.png", "Partner organization"),
        ("partners/urs-logo.png", "Ukraine Reconstruction Summit"),
    ]
    pl = "".join(
        f'<img src="{SITE_MEDIA}/{src}" alt="{html_lib.escape(alt)}" loading="lazy" width="200" height="80" />'
        for src, alt in partners
    )
    html = f"""
{head_common(d, title, desc, "/impact")}
{header_nav(d, "impact")}
  <main id="main" class="site-inner impact-page">
    <header class="impact-hero reveal">
      <div class="impact-hero__wash" aria-hidden="true"></div>
      <div class="impact-hero__inner">
        <p class="impact-hero__eyebrow">Transparency</p>
        <h1 class="impact-hero__title">Impact you can trace</h1>
        <p class="impact-hero__lead">
          We publish how resources move from donors to deployments. Low overhead, Ukrainian-led delivery, and partners who share our standards.
        </p>
      </div>
      <ul class="impact-hero__stats" aria-label="Highlights">
        <li class="impact-hero-stat">
          <span class="impact-hero-stat__num">150+</span>
          <span class="impact-hero-stat__lbl">Generators shipped</span>
        </li>
        <li class="impact-hero-stat">
          <span class="impact-hero-stat__num">12+</span>
          <span class="impact-hero-stat__lbl">Water stations live</span>
        </li>
        <li class="impact-hero-stat">
          <span class="impact-hero-stat__num">$500K+</span>
          <span class="impact-hero-stat__lbl">Aid to programs</span>
        </li>
      </ul>
    </header>

    <section class="impact-band impact-band--alloc reveal" aria-labelledby="impact-alloc-h">
      <div class="impact-band__inner">
        <header class="impact-band__head">
          <h2 id="impact-alloc-h" class="impact-band__title">Where funding goes</h2>
          <p class="impact-band__intro">
            Volunteer-led operations keep overhead lean. The chart below shows how we allocate programmatic spending across initiatives (illustrative shares).
          </p>
        </header>
        <div class="impact-alloc-grid">
          <article class="impact-alloc-card">
            <div class="impact-alloc-card__row">
              <h3 class="impact-alloc-card__name"><a href="initiatives/reh2o/index.html">ReH2O clean water</a></h3>
              <span class="impact-alloc-card__pct">45%</span>
            </div>
            <div class="alloc-bar impact-alloc-card__bar" role="presentation"><div class="alloc-fill" style="width:45%"></div></div>
            <p class="impact-alloc-card__hint">Solar purification where municipal systems have failed.</p>
          </article>
          <article class="impact-alloc-card">
            <div class="impact-alloc-card__row">
              <h3 class="impact-alloc-card__name"><a href="initiatives/power-generators/index.html">Power generators</a></h3>
              <span class="impact-alloc-card__pct">30%</span>
            </div>
            <div class="alloc-bar impact-alloc-card__bar" role="presentation"><div class="alloc-fill" style="width:30%"></div></div>
            <p class="impact-alloc-card__hint">Backup power for hospitals, schools, and heating hubs.</p>
          </article>
          <article class="impact-alloc-card">
            <div class="impact-alloc-card__row">
              <h3 class="impact-alloc-card__name"><a href="initiatives/advocacy/index.html">Advocacy</a></h3>
              <span class="impact-alloc-card__pct">15%</span>
            </div>
            <div class="alloc-bar impact-alloc-card__bar" role="presentation"><div class="alloc-fill" style="width:15%"></div></div>
            <p class="impact-alloc-card__hint">Human rights, policy briefings, diaspora voice.</p>
          </article>
          <article class="impact-alloc-card">
            <div class="impact-alloc-card__row">
              <h3 class="impact-alloc-card__name"><a href="initiatives/ukraine-dreamzzz/index.html">Ukraine Dreamzzz</a></h3>
              <span class="impact-alloc-card__pct">10%</span>
            </div>
            <div class="alloc-bar impact-alloc-card__bar" role="presentation"><div class="alloc-fill" style="width:10%"></div></div>
            <p class="impact-alloc-card__hint">Sports and leadership for young Ukrainians.</p>
          </article>
        </div>
      </div>
    </section>

    <section class="impact-trust reveal" aria-labelledby="impact-trust-h">
      <div class="impact-trust__inner">
        <h2 id="impact-trust-h" class="visually-hidden">Accountability</h2>
        <ul class="impact-trust__list">
          <li class="impact-trust__item">
            <span class="impact-trust__label">Status</span>
            <span class="impact-trust__value">501(c)(3) public charity</span>
          </li>
          <li class="impact-trust__item">
            <span class="impact-trust__label">EIN</span>
            <span class="impact-trust__value">88-2011390</span>
          </li>
          <li class="impact-trust__item impact-trust__item--cta">
            <a class="btn btn-primary impact-trust__btn" href="donate/index.html">Fuel the next deployment</a>
          </li>
        </ul>
      </div>
    </section>

    <section class="impact-partners reveal" aria-labelledby="impact-partners-h">
      <div class="impact-partners__head">
        <h2 id="impact-partners-h" class="impact-partners__title">Partners who scale the work</h2>
        <p class="impact-partners__intro">Institutions and coalitions that help us move water, power, and policy with credibility.</p>
      </div>
      <div class="impact-partners__strip">
        {pl}
      </div>
    </section>

    <section class="impact-bottom reveal" aria-labelledby="impact-bottom-h">
      <div class="impact-bottom__card">
        <h2 id="impact-bottom-h" class="impact-bottom__title">See the work in the field</h2>
        <p class="impact-bottom__text">Deployments, partnerships, and advocacy updates from our blog and program pages.</p>
        <div class="impact-bottom__actions">
          <a class="btn btn-primary" href="blog/index.html">Field reports</a>
          <a class="btn btn-home-outline" href="about/index.html">About Go Ukraina</a>
        </div>
      </div>
    </section>
  </main>
{footer_block(d, "impact")}
"""
    write("impact/index.html", html)


def page_blog_index() -> None:
    d = 1
    title = "Field Reports & News | Go Ukraina"
    desc = (
        "Field reports from Go Ukraina: ReH2O clean water, emergency generators, POW advocacy, "
        "and humanitarian aid in Ukraine. Dispatches from our Los Angeles–based 501(c)(3) nonprofit."
    )
    ordered = blog_sorted()
    p = prefix(d)
    if not ordered:
        featured_block = '<p class="blog-archive__lead">No field reports published yet. Check back soon.</p>'
        rest_grid = ""
    else:
        featured = ordered[0]
        rest = ordered[1:]
        fs = str(featured["slug"])
        feat_href = f"{p}blog/{fs}/index.html"
        feat_u = quote(f"https://www.goukraina.org/blog/{fs}", safe="")
        feat_t = quote(str(featured["title"]), safe="")
        feat_cover = blog_cover_url(featured)
        feat_title_esc = html_lib.escape(str(featured["title"]))
        feat_title_aria = html_lib.escape(str(featured["title"]), quote=True)
        feat_img_alt = html_lib.escape(f"Cover image: {featured['title']}", quote=True)
        featured_block = f"""
    <article class="blog-card blog-card--featured blog-card--featured-editorial reveal">
      <div class="blog-card__media">
        <a class="blog-card__media-link" href="{feat_href}" aria-label="Read report: {feat_title_aria}">
          <img src="{feat_cover}" alt="{feat_img_alt}" width="1200" height="675" loading="eager" decoding="async" />
        </a>
      </div>
      <div class="blog-card__body">
        <p class="blog-card__ribbon">Latest field report</p>
        {html_blog_tags(tuple(featured["tags"]))}
        <h2 class="blog-card__title"><a href="{feat_href}">{feat_title_esc}</a></h2>
        <p class="blog-card__excerpt">{html_lib.escape(str(featured["excerpt"]))}</p>
        <div class="blog-card__foot">
          <span class="blog-card__meta">{html_lib.escape(str(featured["date_label"]))} · {int(featured["read"])} min read</span>
          <div class="blog-card__actions">
            <a class="btn btn-primary blog-card__read" href="{feat_href}">Read full report</a>
            <div class="blog-card__share-inline" role="group" aria-label="Share this report">
              <a class="blog-card__share-ico" href="https://twitter.com/intent/tweet?url={feat_u}&text={feat_t}" target="_blank" rel="noopener noreferrer" aria-label="Share on X">{_SVG_BLOG_X}</a>
              <a class="blog-card__share-ico" href="https://www.linkedin.com/sharing/share-offsite/?url={feat_u}" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">{_SVG_BLOG_LI}</a>
            </div>
          </div>
        </div>
      </div>
    </article>
    """
        rest_chunks: list[str] = []
        for e in rest:
            slug = str(e["slug"])
            href = f"{p}blog/{slug}/index.html"
            eu = quote(f"https://www.goukraina.org/blog/{slug}", safe="")
            et = quote(str(e["title"]), safe="")
            title_esc = html_lib.escape(str(e["title"]))
            title_aria = html_lib.escape(str(e["title"]), quote=True)
            img_alt = html_lib.escape(f"Cover image: {e['title']}", quote=True)
            cover_u = blog_cover_url(e)
            rest_chunks.append(
                f"""
    <article class="blog-card blog-card--archive reveal">
      <div class="blog-card__media">
        <a class="blog-card__media-link" href="{href}" aria-label="Read report: {title_aria}">
          <img src="{cover_u}" alt="{img_alt}" width="800" height="500" loading="lazy" decoding="async" />
        </a>
      </div>
      <div class="blog-card__body">
        {html_blog_tags(tuple(e["tags"]))}
        <h3 class="blog-card__title"><a href="{href}">{title_esc}</a></h3>
        <p class="blog-card__excerpt">{html_lib.escape(str(e["excerpt"]))}</p>
        <div class="blog-card__foot">
          <span class="blog-card__meta">{html_lib.escape(str(e["date_label"]))} · {int(e["read"])} min read</span>
          <a class="blog-card__read-more" href="{href}">Read report <span aria-hidden="true">→</span></a>
        </div>
        <div class="blog-card__micro-share" role="group" aria-label="Quick share">
          <a class="blog-card__micro-share-link" href="https://twitter.com/intent/tweet?url={eu}&text={et}" target="_blank" rel="noopener noreferrer" aria-label="Share on X">{_SVG_BLOG_X}</a>
          <a class="blog-card__micro-share-link" href="https://www.linkedin.com/sharing/share-offsite/?url={eu}" target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn">{_SVG_BLOG_LI}</a>
        </div>
      </div>
    </article>
    """
            )
        rest_grid = "\n".join(rest_chunks)
    html = f"""
{head_common(
        d,
        title,
        desc,
        "/blog",
        og_image_alt="Go Ukraina field reports — humanitarian updates from Ukraine.",
        extra_graph_nodes=blog_index_extra_schema(ordered),
    )}
{header_nav(d, "blog")}
  <main id="main" class="site-inner blog-index-page">
    <header class="blog-index-hero reveal" aria-labelledby="blog-index-heading">
      <div class="blog-index-hero__wash" aria-hidden="true"></div>
      <div class="blog-index-hero__grid" aria-hidden="true"></div>
      <div class="blog-index-hero__inner">
        <div class="blog-index-hero__intro">
          <p class="blog-index-hero__eyebrow">Perspective from the field</p>
          <div class="blog-index-hero__mark" aria-hidden="true"></div>
          <h1 class="blog-index-hero__title" id="blog-index-heading">Field <span class="blog-index-hero__title-accent">reports</span></h1>
        </div>
        <div class="blog-index-hero__aside">
          <p class="blog-index-hero__lead">Deployments, partnerships, and advocacy grounded in what we see in Ukraine and with our partners—written to be read, shared, and cited.</p>
          <p class="blog-index-hero__note"><span class="blog-index-hero__stat">Independent dispatches</span><span class="blog-index-hero__note-sep" aria-hidden="true">·</span><span>Ukraine &amp; diaspora</span></p>
        </div>
      </div>
    </header>

    <section class="blog-index-featured section" aria-labelledby="featured-heading">
      <h2 id="featured-heading" class="visually-hidden">Featured report</h2>
      {featured_block}
    </section>

    <section class="blog-index-rest section blog-archive" id="blog-archive" aria-labelledby="archive-heading">
      <div class="blog-archive__shell">
        <header class="blog-archive__head">
          <p class="blog-archive__eyebrow">From the archive</p>
          <h2 id="archive-heading" class="blog-archive__title">More field reports <span class="blog-archive__accent">&amp; dispatches</span></h2>
          <p class="blog-archive__lead">
            Earlier humanitarian coverage—clean water, advocacy, and recovery in Ukraine. Each article opens in full with share links for your networks.
          </p>
        </header>
        <div class="blog-index-grid blog-index-grid--archive">
        {rest_grid}
        </div>
      </div>
    </section>
  </main>
{footer_block(d, "blog")}
"""
    write("blog/index.html", html)


def blog_posting_schema(
    url: str, headline: str, date_iso: str, desc: str, image_url: str | None = None
) -> dict:
    page_id = f"{url}#webpage"
    data: dict = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "@id": f"{url}#article",
        "url": url,
        "headline": headline,
        "datePublished": date_iso,
        "dateModified": date_iso,
        "articleSection": "Field reports",
        "author": {"@id": AUTHOR_NODE_ID},
        "publisher": {"@id": ORG_NODE_ID},
        "description": desc,
        "mainEntityOfPage": {"@type": "WebPage", "@id": page_id},
    }
    if image_url:
        data["image"] = image_url
    return data


def write_blog_article(slug: str) -> None:
    e = blog_entry(slug)
    depth = 2
    path = f"/blog/{slug}"
    url = f"https://www.goukraina.org{path}"
    meta_title = str(e.get("meta_title") or "").strip()
    page_title = f'{meta_title} | Go Ukraina' if meta_title else f'{e["title"]} | Go Ukraina'
    desc = str(e["desc"])
    cover = blog_cover_url(e)
    share_img = blog_share_image_url(e)
    og_alt_raw = str(e.get("og_image_alt") or "").strip()
    og_custom = bool(str(e.get("og_image") or "").strip())
    og_cover_alt = og_alt_raw or (
        f"Share preview image for: {e['title']}" if og_custom else f"Hero image for: {e['title']}"
    )
    date_iso = blog_article_iso_datetime(str(e["date"]))
    bp = blog_posting_schema(url, str(e["title"]), date_iso, desc, image_url=share_img)
    body = BLOG_BODIES[slug].strip()
    share = html_blog_share(url, str(e["title"]))
    pager = html_blog_pager(slug, depth)
    more = html_blog_more_cards(slug, depth)
    tags = html_blog_tags(tuple(e["tags"]))
    read = int(e["read"])
    cover_alt = html_lib.escape(f"Hero image for: {e['title']}")
    author_block = html_blog_author_block()
    extra_nodes = blog_post_extra_graph(url, str(e["title"]))
    html = f"""
{head_common(
        depth,
        page_title,
        desc,
        path,
        "article",
        blog_ld=bp,
        og_image=share_img,
        og_image_alt=og_cover_alt,
        article_published=date_iso,
        article_modified=date_iso,
        article_section="Field reports",
        extra_graph_nodes=extra_nodes,
    )}
{header_nav(depth, "blog")}
  <main id="main" class="site-inner blog-post-page">
    <article class="blog-article" itemscope itemtype="https://schema.org/BlogPosting">
      <header class="article-hero blog-post-hero">
        {tags}
        <h1 class="blog-post-hero__title section-title" itemprop="headline">{html_lib.escape(str(e["title"]))}</h1>
        <p class="article-meta blog-post-hero__meta">
          <time itemprop="datePublished" datetime="{html_lib.escape(date_iso)}">{html_lib.escape(str(e["date_label"]))}</time>
          <span class="blog-post-hero__sep" aria-hidden="true"> · </span>
          <span>{read} min read</span>
        </p>
      </header>
      <figure class="blog-post-cover reveal">
        <div class="blog-post-cover__frame">
          <img src="{cover}" alt="{cover_alt}" width="1200" height="630" loading="eager" decoding="async" />
        </div>
      </figure>
{author_block}
      <div class="blog-post-main">
      {share}
      <div class="article-body blog-article-body reveal" itemprop="articleBody">
        {body}
      </div>
      </div>
    </article>
    {pager}
    {more}
  </main>
{footer_block(depth, "blog")}
"""
    write(f"blog/{slug}/index.html", html)


def page_blog_articles() -> None:
    for entry in BLOG_ENTRIES:
        write_blog_article(str(entry["slug"]))


def page_donate() -> None:
    d = 1
    p = prefix(d)
    title = "Donate | Go Ukraina"
    desc = (
        "Make a tax-deductible gift to Go Ukraina. Support solar water stations, emergency power, "
        "and rebuilding programs for communities across Ukraine, with full transparency."
    )
    bi = SITE_MEDIA
    html = f"""
{head_common(d, title, desc, "/donate")}
{header_nav(d, "donate")}
  <main id="main" class="site-inner donate-page">
    <header class="donate-hero donate-hero--split">
      <div class="donate-hero__glow" aria-hidden="true"></div>
      <div class="donate-hero__split">
        <div class="donate-hero__copy">
          <p class="donate-hero__eyebrow">For everyone who stands with Ukraine</p>
          <h1>Turn care into clean water &amp; power</h1>
          <figure class="donate-hero__figure">
            <div class="donate-hero__figure-frame">
              <img src="{bi}/reh2o/station-interior.jpeg" alt="Interior of a solar-powered water purification station in Ukraine" width="640" height="800" loading="eager" decoding="async" />
            </div>
            <figcaption class="donate-hero__figure-cap">Solar water · Ukraine</figcaption>
          </figure>
          <p class="donate-hero__lead">
            You are not funding overhead theater. You are helping Ukrainian partners keep hospitals lit, schools warm, and families supplied with safe water when infrastructure fails. Every public gift is directed to programs you can read about in our field reports.
          </p>
          <ul class="donate-trust-row" aria-label="Trust and verification">
            <li>501(c)(3) nonprofit · California</li>
            <li>EIN 88-2011390</li>
            <li><a href="../impact/index.html">Transparency &amp; impact</a></li>
          </ul>
          <blockquote class="donate-quote donate-quote--hero">
            <p>We work with municipalities and Ukrainian teams so aid is never abstract. It shows up as water you can test and power you can measure.</p>
          </blockquote>
          <section class="donate-hero__reach" aria-labelledby="donate-reach-heading">
            <h2 id="donate-reach-heading" class="donate-hero__reach-title">Reach our team</h2>
            <p class="donate-hero__reach-note">Wires, naming, DAFs, or questions before you give—we reply within a few business days.</p>
            <ul class="contact-channels donate-hero__reach-channels">
              <li>
                <a class="contact-channel" href="tel:+13235326855">
                  <span class="contact-channel__glyph" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                  </span>
                  <span class="contact-channel__text">
                    <span class="contact-channel__label">Phone</span>
                    <span class="contact-channel__value">+1 (323) 532-6855</span>
                  </span>
                </a>
              </li>
              <li>
                <a class="contact-channel" href="mailto:info@goukraina.com">
                  <span class="contact-channel__glyph" aria-hidden="true">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
                  </span>
                  <span class="contact-channel__text">
                    <span class="contact-channel__label">Email</span>
                    <span class="contact-channel__value">info@goukraina.com</span>
                  </span>
                </a>
              </li>
            </ul>
            <p class="donate-hero__reach-cta">
              <a class="btn btn-primary" href="{p}contact/index.html#contact-form-heading">Open contact form</a>
            </p>
            <p class="donate-hero__tiers-hint"><a href="#donate-impact">What your gift can do <span aria-hidden="true">→</span></a></p>
          </section>
        </div>
        <div class="donate-hero__form-wrap" id="donate-form">
          <section class="donate-form-panel reveal" aria-labelledby="donate-form-heading">
            <div class="contact-form-shell">
              <div class="contact-form-shell__rim" aria-hidden="true"></div>
              <div class="contact-form-shell__body">
                <div class="contact-form-shell__seal" aria-hidden="true"><span>GU</span></div>
                <header class="contact-form-head">
                  <p class="contact-form-head__kicker">Secure checkout</p>
                  <h2 id="donate-form-heading" class="contact-form-head__title">Complete your gift</h2>
                  <p class="contact-form-head__lead">
                    Tax-deductible in the U.S. to the extent allowed by law. Questions? <a href="mailto:info@goukraina.com">info@goukraina.com</a>
                  </p>
                </header>
                <div class="contact-form-shell__embed" aria-labelledby="donate-form-heading">
                  <givebutter-widget id="{GIVEBUTTER_FORM_WIDGET_ID}"></givebutter-widget>
                </div>
                <p class="contact-form__fineprint">
                  Payments are processed securely through Givebutter. Go Ukraina does not store your card details.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </header>

    <section class="donate-impact reveal" id="donate-impact" aria-labelledby="impact-tiers-heading">
      <div class="donate-impact__inner">
        <aside class="donate-aside">
          <h2 id="impact-tiers-heading" class="donate-aside__h">What your gift can do</h2>
          <p class="donate-aside__intro">Illustrative examples. Actual deployment follows community need and partner assessments.</p>
          <ul class="donate-tiers">
            <li class="donate-tier">
              <span class="donate-tier__amount">$25</span>
              <span class="donate-tier__text">Helps cover consumables and logistics that keep safe water flowing for families in high-need areas.</span>
            </li>
            <li class="donate-tier">
              <span class="donate-tier__amount">$100</span>
              <span class="donate-tier__text">Contributes to fuel and maintenance so backup power can run at a clinic or shelter during blackouts.</span>
            </li>
            <li class="donate-tier">
              <span class="donate-tier__amount">$500</span>
              <span class="donate-tier__text">Supports components and transport toward modular ReH2O purification capacity.</span>
            </li>
            <li class="donate-tier donate-tier--featured">
              <span class="donate-tier__badge">Station-scale</span>
              <span class="donate-tier__amount">~$80k</span>
              <span class="donate-tier__text">Roughly the cost to sponsor a full ReH2O station build. Talk to us about naming and reporting.</span>
            </li>
          </ul>
        </aside>
      </div>
    </section>

    <section class="section donate-ways donate-ways--channels reveal" aria-labelledby="ways-heading">
      <header class="donate-ways__header">
        <p class="donate-ways__eyebrow">Structured &amp; major gifts</p>
        <h2 id="ways-heading" class="donate-ways__title">Other ways <span class="donate-ways__accent">to give</span></h2>
        <p class="donate-ways__intro">
          Bank transfer, appreciated stock, DAF grants, or employer matching—each has a simple next step. Choose the path that fits; we reply with step-by-step instructions and recognition options.
        </p>
      </header>
      <div class="donate-ways-grid">
        <article class="donate-way-card">
          <span class="donate-way-card__icon" aria-hidden="true">
            <svg class="donate-way-card__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h2v4M13 21v-4h2v4"/></svg>
          </span>
          <h3 class="donate-way-card__title">Wire &amp; ACH</h3>
          <p class="donate-way-card__lead">Strong fit for large outright gifts—direct settlement, no card fees.</p>
          <p class="donate-way-card__step"><strong>How it works:</strong> we email secure routing, account name, and the exact reference line to use.</p>
          <a class="btn btn-gold donate-way-card__btn" href="mailto:info@goukraina.com?subject=Wire%20%2F%20ACH%20instructions%20%E2%80%94%20Go%20Ukraina&amp;body=Hello%20Go%20Ukraina%2C%0A%0AI%20would%20like%20routing%20details%20for%20a%20wire%20or%20ACH%20gift.%0A%0AThank%20you.">Get wire &amp; ACH instructions</a>
        </article>
        <article class="donate-way-card">
          <span class="donate-way-card__icon" aria-hidden="true">
            <svg class="donate-way-card__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"/></svg>
          </span>
          <h3 class="donate-way-card__title">Stock &amp; DAF</h3>
          <p class="donate-way-card__lead">Give appreciated securities or grant from a donor-advised fund—often tax-advantaged.</p>
          <p class="donate-way-card__step"><strong>How it works:</strong> tell us your broker or fund; we coordinate transfer instructions and acknowledgment.</p>
          <a class="btn btn-gold donate-way-card__btn" href="mailto:info@goukraina.com?subject=Stock%20or%20DAF%20gift%20%E2%80%94%20Go%20Ukraina&amp;body=Hello%20Go%20Ukraina%2C%0A%0AI%20plan%20to%20give%20appreciated%20stock%20or%20through%20my%20donor-advised%20fund.%20Please%20send%20transfer%20instructions%20and%20recognition%20options.%0A%0ABroker%20%2F%20fund%20name%3A%20%0A%0AThank%20you.">Get stock or DAF steps</a>
        </article>
        <article class="donate-way-card">
          <span class="donate-way-card__icon" aria-hidden="true">
            <svg class="donate-way-card__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
          </span>
          <h3 class="donate-way-card__title">Employer matching</h3>
          <p class="donate-way-card__lead">Many companies double employee gifts—stretch impact without giving twice.</p>
          <p class="donate-way-card__step"><strong>How it works:</strong> we send EIN, legal name, and what your HR portal usually needs.</p>
          <a class="btn btn-gold donate-way-card__btn" href="mailto:info@goukraina.com?subject=Employer%20matching%20%E2%80%94%20Go%20Ukraina&amp;body=Hello%20Go%20Ukraina%2C%0A%0AI%27d%20like%20documentation%20for%20my%20employer%E2%80%99s%20matching%20program.%0A%0AWorkplace%20name%3A%20%0A%0AThank%20you.">Get matching paperwork</a>
        </article>
      </div>
      <div class="donate-ways__footer">
        <div class="donate-ways__footer-inner">
          <div class="donate-ways__footer-copy">
            <p class="donate-ways__footer-kicker">Prefer a conversation first?</p>
            <p class="donate-ways__footer-desc">
              Not sure which option fits—wire, stock, DAF, or matching? We’ll walk you through it. Most replies land within a few business days.
            </p>
            <p class="donate-ways__footer-more">
              <a class="donate-ways__footer-form" href="../contact/index.html#contact-form-heading">Open the full contact form</a>
            </p>
          </div>
          <div class="donate-ways__footer-actions" role="group" aria-label="Contact Go Ukraina">
            <a class="donate-ways__contact-row" href="tel:+13235326855">
              <span class="donate-ways__contact-ico" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              </span>
              <span class="donate-ways__contact-body">
                <span class="donate-ways__contact-label">Phone</span>
                <span class="donate-ways__contact-value">+1 (323) 532-6855</span>
              </span>
            </a>
            <a class="donate-ways__contact-row" href="mailto:info@goukraina.com?subject=Giving%20question%20%E2%80%94%20Go%20Ukraina">
              <span class="donate-ways__contact-ico" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
              </span>
              <span class="donate-ways__contact-body">
                <span class="donate-ways__contact-label">Email</span>
                <span class="donate-ways__contact-value">info@goukraina.com</span>
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>

    <section class="section section-alt donate-legal reveal" aria-labelledby="legal-heading">
      <h2 id="legal-heading" class="visually-hidden">Legal</h2>
      <div class="donate-legal__box">
        <p><strong>Go Ukraina Inc.</strong> is a California nonprofit public benefit corporation recognized as tax-exempt under Section 501(c)(3) of the Internal Revenue Code. Donations are tax-deductible in the United States to the extent permitted by law. Our EIN is <strong>88-2011390</strong>. A copy of our determination letter is available upon request.</p>
      </div>
    </section>
  </main>
{footer_block(d, "donate")}
"""
    write("donate/index.html", html)


def page_contact() -> None:
    d = 1
    p = prefix(d)
    title = "Contact | Go Ukraina"
    desc = "Get in touch with Go Ukraina to discuss partnerships, donations, volunteering, or media inquiries."
    html = f"""
{head_common(d, title, desc, "/contact", givebutter_widget=False)}
{header_nav(d, "contact")}
  <main id="main" class="site-inner contact-page">
    <header class="contact-hero reveal">
      <div class="contact-hero__aurora" aria-hidden="true"></div>
      <div class="contact-hero__mesh" aria-hidden="true"></div>
      <div class="contact-hero__inner">
        <p class="contact-hero__eyebrow">Correspondence</p>
        <h1 class="contact-hero__title">A line across the ocean</h1>
        <p class="contact-hero__lead">
          From Calabasas to Kyiv and beyond, we answer partners, donors, and storytellers who want water, power, and dignity to win the long arc.
        </p>
      </div>
      <div class="contact-hero__rule" aria-hidden="true"></div>
    </header>

    <div class="contact-studio reveal">
      <aside class="contact-aside" aria-labelledby="contact-channels-heading">
        <div class="contact-aside__intro">
          <p class="contact-aside__eyebrow">Get in touch</p>
          <h2 id="contact-channels-heading" class="contact-aside__h">Direct lines</h2>
          <p class="contact-aside__note">We read every message. Expect a thoughtful reply within a few business days.</p>
        </div>
        <div class="contact-aside__reach">
        <ul class="contact-channels">
          <li>
            <a class="contact-channel" href="tel:+13235326855">
              <span class="contact-channel__glyph" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
              </span>
              <span class="contact-channel__text">
                <span class="contact-channel__label">Phone</span>
                <span class="contact-channel__value">+1 (323) 532-6855</span>
              </span>
            </a>
          </li>
          <li>
            <a class="contact-channel" href="mailto:info@goukraina.com">
              <span class="contact-channel__glyph" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
              </span>
              <span class="contact-channel__text">
                <span class="contact-channel__label">Email</span>
                <span class="contact-channel__value">info@goukraina.com</span>
              </span>
            </a>
          </li>
        </ul>
        </div>
        <div class="contact-hq">
          <div class="contact-hq__head">
            <span class="contact-hq__pin" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            </span>
            <h3 class="contact-hq__title">Headquarters</h3>
          </div>
          <address class="contact-hq__address">
            4500 Park Granada Suite 202<br />
            Calabasas, CA 91302<br />
            United States
          </address>
        </div>
        <nav class="contact-explore" aria-labelledby="contact-explore-heading">
          <h3 id="contact-explore-heading" class="contact-explore__title">Explore</h3>
          <p class="contact-explore__lede">Support programs, review impact, and follow field updates.</p>
          <ul class="contact-explore__list">
            <li>
              <a class="contact-explore__tile" href="{p}donate/index.html">
                <span class="contact-explore__ico" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
                </span>
                <span class="contact-explore__tile-body">
                  <span class="contact-explore__tile-label">Give</span>
                  <span class="contact-explore__tile-hint">Donate</span>
                </span>
              </a>
            </li>
            <li>
              <a class="contact-explore__tile" href="{p}impact/index.html">
                <span class="contact-explore__ico" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                </span>
                <span class="contact-explore__tile-body">
                  <span class="contact-explore__tile-label">Impact</span>
                  <span class="contact-explore__tile-hint">Results</span>
                </span>
              </a>
            </li>
            <li>
              <a class="contact-explore__tile contact-explore__tile--external" href="{SOCIAL_INSTAGRAM}" target="_blank" rel="noopener noreferrer" aria-label="Instagram (opens in new tab)">
                <span class="contact-explore__ico" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 16a4 4 0 100-8 4 4 0 000 8z"/><path d="M16.5 7.5h.01"/></svg>
                </span>
                <span class="contact-explore__tile-body">
                  <span class="contact-explore__tile-label">Instagram</span>
                  <span class="contact-explore__tile-hint">Follow us</span>
                </span>
              </a>
            </li>
          </ul>
        </nav>
      </aside>

      <div class="contact-form-shell">
        <div class="contact-form-shell__rim" aria-hidden="true"></div>
        <div class="contact-form-shell__body">
          <div class="contact-form-shell__seal" aria-hidden="true"><span>GU</span></div>
          <header class="contact-form-head">
            <p class="contact-form-head__kicker">Your note</p>
            <h2 id="contact-form-heading" class="contact-form-head__title">Write to us</h2>
            <p class="contact-form-head__lead">
              Partnerships, press, volunteering, or a simple hello. Tell us what you need in the form—submitting opens your email app with everything filled in—or call or write using the links on the left.
            </p>
          </header>
          <div class="contact-form-shell__embed contact-form-shell__embed--native" aria-labelledby="contact-form-heading">
            <form id="contact-main-form" class="contact-form" name="contact" action="#" method="post" novalidate>
              <div class="contact-form__names">
                <div class="contact-form__field">
                  <label for="contact-first">First name</label>
                  <input id="contact-first" name="first" type="text" autocomplete="given-name" required placeholder="Hanna" />
                </div>
                <div class="contact-form__field">
                  <label for="contact-last">Last name</label>
                  <input id="contact-last" name="last" type="text" autocomplete="family-name" required placeholder="Kovalenko" />
                </div>
              </div>
              <div class="contact-form__field">
                <label for="contact-email">Email</label>
                <input id="contact-email" name="email" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com" />
              </div>
              <div class="contact-form__field">
                <label for="contact-phone">Phone <span class="contact-form__optional">(optional)</span></label>
                <input id="contact-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" placeholder="+1 (323) 555-0100" />
              </div>
              <div class="contact-form__field">
                <label for="contact-topic">Topic</label>
                <select id="contact-topic" name="topic" required>
                  <option value="" disabled selected>Choose a topic…</option>
                  <option value="General inquiry">General inquiry</option>
                  <option value="Partnerships &amp; collaboration">Partnerships &amp; collaboration</option>
                  <option value="Press &amp; media">Press &amp; media</option>
                  <option value="Volunteering">Volunteering</option>
                  <option value="Giving &amp; donations">Giving &amp; donations</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div class="contact-form__field">
                <label for="contact-message">Message</label>
                <textarea id="contact-message" name="message" required placeholder="How can we help? Include any deadlines or context that will help us reply."></textarea>
              </div>
              <div class="contact-form__actions">
                <button type="submit" class="btn btn-primary contact-form__submit">Send message</button>
              </div>
            </form>
          </div>
          <p class="contact-form__fineprint">
            Submitting opens your default email app with your message addressed to <a href="mailto:info@goukraina.com">info@goukraina.com</a>. If nothing opens, copy your note and email us directly—we reply within a few business days.
          </p>
        </div>
      </div>
    </div>
  </main>
{footer_block(d, "contact")}
"""
    write("contact/index.html", html)


def write_seo_files() -> None:
    from pipeline.services.seo_export import default_exporter

    default_exporter().write_all(blog_entries=list(BLOG_ENTRIES))


def copy_admin_ui_to_public() -> None:
    """Build the Vite + React admin into public/admin/ (same origin as /api/*)."""
    import subprocess
    import sys

    admin_dir = ROOT / "admin"
    if not (admin_dir / "package.json").is_file():
        return
    try:
        subprocess.run(["npm", "run", "build"], cwd=str(admin_dir), check=True)
    except FileNotFoundError:
        print(
            "ERROR: npm not found; admin SPA not built. Install Node or run: cd admin && npm run build",
            file=sys.stderr,
        )
        raise SystemExit(1) from None
    except subprocess.CalledProcessError as e:
        print("ERROR: admin SPA build failed (fix admin/ then rebuild):", e, file=sys.stderr)
        raise SystemExit(1) from None


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    page_home()
    page_about()
    page_reh2o()
    page_power()
    page_advocacy()
    page_dream()
    page_summit()
    page_impact()
    page_blog_index()
    page_blog_articles()
    page_donate()
    page_contact()
    write_seo_files()
    copy_admin_ui_to_public()
    print("Built site in", OUT)


if __name__ == "__main__":
    main()
