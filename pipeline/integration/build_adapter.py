"""Bridge between the pipeline store and `build_site.py` (legacy dict layout)."""

from __future__ import annotations

from pipeline.models.post import BlogPost, date_label, estimate_read_minutes
from pipeline.services.post_service import PostService
from pipeline.storage.json_repository import JsonPostRepository


def _sync_derived_fields(post: BlogPost) -> BlogPost:
    """Recompute date_label, read time, desc from SEO when saving from admin."""
    post.date_label = date_label(post.date)
    post.read = estimate_read_minutes(post.body_html)
    meta = post.seo.meta_description.strip()
    post.desc = meta or post.excerpt.strip() or post.title
    return post


def load_blog_for_build() -> tuple[list[dict[str, object]], dict[str, str]]:
    """Published posts only, sorted newest first — matches former BLOG_ENTRIES / BLOG_BODIES."""
    try:
        svc = PostService()
        posts = svc.published_for_build()
    except Exception as e:
        # CI / Vercel: bad SUPABASE_* or transient API errors must not fail the whole static build.
        print("WARN: blog load from primary store failed, falling back to local JSON:", e)
        svc = PostService(repository=JsonPostRepository.default())
        posts = svc.published_for_build()
    entries: list[dict[str, object]] = []
    bodies: dict[str, str] = {}
    for p in posts:
        p2 = _sync_derived_fields(p)
        entries.append(p2.to_legacy_entry())
        bodies[p2.slug] = p2.body_html
    return entries, bodies


def resync_post_fields(post: BlogPost) -> BlogPost:
    """Call before save from API to keep derived fields consistent."""
    return _sync_derived_fields(post)
