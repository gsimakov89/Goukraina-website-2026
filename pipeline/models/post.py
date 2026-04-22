"""Domain model for blog posts (OOP core)."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any


SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


class PostStatus(str, Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    DELETED = "deleted"  # soft-removed from site, lists, sitemap; row kept in DB


@dataclass
class SeoMeta:
    """Optional SEO overrides; empty strings fall back to title/excerpt."""

    meta_title: str = ""
    meta_description: str = ""
    og_image: str = ""  # absolute URL, site path (/…), or filename under /assets/img/
    og_image_alt: str = ""  # og:image:alt / twitter:image:alt when share image is set

    @classmethod
    def from_dict(cls, d: dict[str, Any] | None) -> SeoMeta:
        if not d:
            return cls()
        return cls(
            meta_title=str(d.get("meta_title") or ""),
            meta_description=str(d.get("meta_description") or ""),
            og_image=str(d.get("og_image") or ""),
            og_image_alt=str(d.get("og_image_alt") or ""),
        )

    def to_dict(self) -> dict[str, str]:
        return {
            "meta_title": self.meta_title,
            "meta_description": self.meta_description,
            "og_image": self.og_image,
            "og_image_alt": self.og_image_alt,
        }


def date_label(iso_date: str) -> str:
    d = datetime.strptime(iso_date[:10], "%Y-%m-%d")
    return f"{d.strftime('%B')} {d.day}, {d.year}"


def estimate_read_minutes(html: str) -> int:
    text = re.sub(r"<[^>]+>", " ", html)
    words = len(re.findall(r"\w+", text))
    return max(1, round(words / 220))


@dataclass
class BlogPost:
    slug: str
    title: str
    desc: str
    date: str  # YYYY-MM-DD
    date_label: str
    read: int
    tags: tuple[str, ...]
    excerpt: str
    cover: str  # relative under /assets/img/ on the deployed site
    body_html: str
    status: PostStatus
    seo: SeoMeta = field(default_factory=SeoMeta)
    updated_at: str = ""
    #: When True, AI / auto-slug must not overwrite `slug` (editor set it explicitly).
    slug_manual: bool = False

    def __post_init__(self) -> None:
        if not SLUG_PATTERN.match(self.slug):
            raise ValueError(f"Invalid slug: {self.slug!r}")
        if isinstance(self.status, str):
            self.status = PostStatus(self.status)
        if isinstance(self.tags, list):
            self.tags = tuple(self.tags)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> BlogPost:
        slug = str(data["slug"])
        title = str(data["title"])
        date = str(data["date"])[:10]
        body = str(data.get("body_html") or "")
        read = int(data.get("read") or estimate_read_minutes(body))
        tags_raw = data.get("tags") or []
        tags = tuple(str(t) for t in tags_raw)
        excerpt = str(data.get("excerpt") or "")
        desc = str(data.get("desc") or excerpt or title)
        return cls(
            slug=slug,
            title=title,
            desc=desc,
            date=date,
            date_label=str(data.get("date_label") or date_label(date)),
            read=read,
            tags=tags,
            excerpt=excerpt,
            cover=str(data.get("cover") or ""),
            body_html=body,
            status=PostStatus(str(data.get("status") or "draft")),
            seo=SeoMeta.from_dict(data.get("seo") if isinstance(data.get("seo"), dict) else None),
            updated_at=str(data.get("updated_at") or ""),
            slug_manual=bool(data.get("slug_manual")),
        )

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["status"] = self.status.value
        d["tags"] = list(self.tags)
        d["seo"] = self.seo.to_dict()
        return d

    def to_legacy_entry(self) -> dict[str, object]:
        """Shape expected by build_site.py blog templates."""
        meta_desc = self.seo.meta_description.strip() or self.desc
        return {
            "slug": self.slug,
            "title": self.title,
            "desc": meta_desc,
            "date": self.date,
            "date_label": self.date_label,
            "read": self.read,
            "tags": self.tags,
            "excerpt": self.excerpt,
            "cover": self.cover,
            "meta_title": self.seo.meta_title.strip(),
            "og_image": self.seo.og_image.strip(),
            "og_image_alt": self.seo.og_image_alt.strip(),
        }
