"""Supabase / PostgREST persistence for blog posts (service role on server / CI)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx

from pipeline.config import supabase_project_url
from pipeline.models.post import BlogPost, PostStatus


class SupabasePostRepository:
    """Load/save `BlogPost` rows in Supabase (table default: blog_posts)."""

    def __init__(self) -> None:
        self._url = supabase_project_url().rstrip("/")
        self._key = os.environ["SUPABASE_SERVICE_ROLE_KEY"].strip()
        self._table = os.environ.get("SUPABASE_POSTS_TABLE", "blog_posts").strip() or "blog_posts"

    def _headers(self) -> dict[str, str]:
        return {
            "apikey": self._key,
            "Authorization": f"Bearer {self._key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        }

    def _row_to_dict(self, row: dict[str, Any]) -> dict[str, Any]:
        tags = row.get("tags") or []
        if isinstance(tags, str):
            tags = json.loads(tags)
        seo = row.get("seo") or {}
        if isinstance(seo, str):
            seo = json.loads(seo)
        date_val = row.get("date")
        if hasattr(date_val, "isoformat"):
            date_str = date_val.isoformat()[:10]
        else:
            date_str = str(date_val)[:10] if date_val else ""
        updated = row.get("updated_at")
        if updated is not None and hasattr(updated, "isoformat"):
            updated = updated.isoformat().replace("+00:00", "Z")
        elif updated is not None:
            updated = str(updated)
        return {
            "slug": row["slug"],
            "title": row["title"],
            "desc": row.get("desc") or "",
            "date": date_str,
            "date_label": row.get("date_label") or "",
            "read": int(row.get("read") or 1),
            "tags": list(tags) if isinstance(tags, list) else [],
            "excerpt": row.get("excerpt") or "",
            "cover": row.get("cover") or "",
            "body_html": row.get("body_html") or "",
            "status": row.get("status") or "draft",
            "seo": seo if isinstance(seo, dict) else {},
            "updated_at": updated or "",
            "slug_manual": bool(row.get("slug_manual")),
        }

    def _post_to_row(self, post: BlogPost) -> dict[str, Any]:
        d = post.to_dict()
        row = {
            "slug": d["slug"],
            "title": d["title"],
            "desc": d["desc"],
            "date": d["date"][:10],
            "date_label": d["date_label"],
            "read": d["read"],
            "tags": d["tags"],
            "excerpt": d["excerpt"],
            "cover": d["cover"],
            "body_html": d["body_html"],
            "status": d["status"],
            "seo": d["seo"],
            "slug_manual": d["slug_manual"],
        }
        ua = (d.get("updated_at") or "").strip()
        if ua:
            row["updated_at"] = ua
        return row

    def list_all(self) -> list[BlogPost]:
        q = f"{self._url}/rest/v1/{self._table}?select=*&status=neq.deleted&order=date.desc"
        r = httpx.get(q, headers=self._headers(), timeout=60.0)
        r.raise_for_status()
        rows = r.json()
        if not isinstance(rows, list):
            return []
        out: list[BlogPost] = []
        for row in rows:
            try:
                out.append(BlogPost.from_dict(self._row_to_dict(row)))
            except (KeyError, ValueError, TypeError):
                continue
        return out

    def _slug_eq(self, slug: str) -> str:
        return f"slug=eq.{quote(slug, safe='')}"

    def get(self, slug: str) -> BlogPost:
        q = f"{self._url}/rest/v1/{self._table}?{self._slug_eq(slug)}&select=*&limit=1"
        r = httpx.get(q, headers=self._headers(), timeout=30.0)
        r.raise_for_status()
        rows = r.json()
        if not rows:
            raise KeyError(slug)
        row = rows[0]
        if str(row.get("status") or "") == "deleted":
            raise KeyError(slug)
        return BlogPost.from_dict(self._row_to_dict(row))

    def save(self, post: BlogPost) -> None:
        row = self._post_to_row(post)
        slug = row["slug"]
        try:
            self.get(slug)
            exists = True
        except KeyError:
            exists = False
        if exists:
            r = httpx.patch(
                f"{self._url}/rest/v1/{self._table}?{self._slug_eq(slug)}",
                headers=self._headers(),
                json=row,
                timeout=30.0,
            )
        else:
            r = httpx.post(
                f"{self._url}/rest/v1/{self._table}",
                headers=self._headers(),
                json=row,
                timeout=30.0,
            )
        if r.status_code >= 400:
            raise RuntimeError(r.text or f"status {r.status_code}")

    def delete(self, slug: str) -> None:
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        r = httpx.patch(
            f"{self._url}/rest/v1/{self._table}?{self._slug_eq(slug)}",
            headers=self._headers(),
            json={"status": "deleted", "deleted_at": now},
            timeout=30.0,
        )
        if r.status_code in (200, 204):
            return
        if r.status_code == 404:
            return
        raise RuntimeError(r.text or f"status {r.status_code}")

    def slug_exists(self, slug: str) -> bool:
        try:
            self.get(slug)
            return True
        except KeyError:
            return False

    def list_published(self) -> list[BlogPost]:
        return [p for p in self.list_all() if p.status == PostStatus.PUBLISHED]
