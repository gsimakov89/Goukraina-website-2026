"""Application service: create, update, publish blog posts."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from uuid import uuid4

from pipeline.config import supabase_project_url
from pipeline.models.post import BlogPost, PostStatus, SeoMeta
from pipeline.storage.json_repository import JsonPostRepository
from pipeline.storage.supabase_repository import SupabasePostRepository


def default_post_repository() -> JsonPostRepository | SupabasePostRepository:
    import os

    if supabase_project_url().strip() and (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip():
        return SupabasePostRepository()
    return JsonPostRepository.default()


def _slugify(title: str, existing: set[str]) -> str:
    s = title.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    if not s:
        s = "post"
    base = s[:80]
    if base not in existing:
        return base
    return f"{base}-{uuid4().hex[:6]}"


class PostService:
    def __init__(self, repository: JsonPostRepository | SupabasePostRepository | None = None) -> None:
        self._repo = repository or default_post_repository()

    def all_posts(self) -> list[BlogPost]:
        primary = self._repo.list_all()
        if isinstance(self._repo, SupabasePostRepository):
            by_slug = {p.slug: p for p in primary}
            for p in JsonPostRepository.default().list_all():
                if p.slug not in by_slug:
                    by_slug[p.slug] = p
            primary = list(by_slug.values())
        return sorted(
            primary,
            key=lambda p: (p.date, p.slug),
            reverse=True,
        )

    def published_for_build(self) -> list[BlogPost]:
        posts = [p for p in self._repo.list_all() if p.status == PostStatus.PUBLISHED]
        return sorted(posts, key=lambda p: p.date, reverse=True)

    def get(self, slug: str) -> BlogPost:
        """Load by slug. If using Supabase but the row is missing, fall back to local JSON (dev / import)."""
        try:
            return self._repo.get(slug)
        except KeyError:
            if isinstance(self._repo, SupabasePostRepository):
                try:
                    return JsonPostRepository.default().get(slug)
                except KeyError:
                    pass
            raise

    def save(self, post: BlogPost) -> None:
        post.updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        self._repo.save(post)

    def delete(self, slug: str) -> None:
        self._repo.delete(slug)

    def slug_exists(self, slug: str) -> bool:
        if self._repo.slug_exists(slug):
            return True
        if isinstance(self._repo, SupabasePostRepository):
            return JsonPostRepository.default().slug_exists(slug)
        return False

    def create_draft(
        self,
        title: str,
        body_html: str = "<p></p>",
        date: str | None = None,
    ) -> BlogPost:
        existing = {p.slug for p in self._repo.list_all()}
        slug = _slugify(title, existing)
        today = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        from pipeline.models.post import date_label as fmt_date
        from pipeline.models.post import estimate_read_minutes

        post = BlogPost(
            slug=slug,
            title=title,
            desc=title,
            date=today,
            date_label=fmt_date(today),
            read=estimate_read_minutes(body_html),
            tags=(),
            excerpt="",
            cover="",
            body_html=body_html,
            status=PostStatus.DRAFT,
            seo=SeoMeta(),
            slug_manual=False,
        )
        self.save(post)
        return post
