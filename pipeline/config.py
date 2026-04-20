"""Central configuration for the pipeline (paths, site origin, sitemap routes)."""

from __future__ import annotations

import os
from pathlib import Path

# Go Ukraina Supabase project (override with SUPABASE_URL in env).
SUPABASE_PROJECT_URL_DEFAULT = "https://lrbrvkhddhuebmyazgcf.supabase.co"


def supabase_project_url() -> str:
    """Resolved API URL for Supabase (env wins when set)."""
    return (os.environ.get("SUPABASE_URL") or "").strip() or SUPABASE_PROJECT_URL_DEFAULT

# Project root (parent of `pipeline/`)
ROOT = Path(__file__).resolve().parent.parent
POSTS_DIR = ROOT / "pipeline" / "data" / "posts"
PUBLIC_DIR = ROOT / "public"

# Must match build_site.py SITE_ORIGIN for canonical URLs
SITE_ORIGIN = "https://www.goukraina.org"

# Static paths: (url path suffix, changefreq, priority) — lastmod filled from blog dates or fallback
STATIC_SITEMAP_ROUTES: tuple[tuple[str, str, str], ...] = (
    ("/", "weekly", "1.0"),
    ("/donate", "weekly", "0.95"),
    ("/about", "monthly", "0.9"),
    ("/impact", "monthly", "0.88"),
    ("/initiatives/reh2o", "monthly", "0.85"),
    ("/initiatives/power-generators", "monthly", "0.85"),
    ("/initiatives/advocacy", "monthly", "0.85"),
    ("/initiatives/ukraine-dreamzzz", "monthly", "0.85"),
    ("/summit", "monthly", "0.82"),
    ("/blog", "weekly", "0.86"),
    ("/contact", "yearly", "0.55"),
)

# Individual blog post priority in sitemap (below hub pages)
BLOG_POST_PRIORITY = "0.72"
BLOG_POST_CHANGEFREQ = "monthly"
