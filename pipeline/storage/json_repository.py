"""JSON file persistence for blog posts (one file per slug)."""

from __future__ import annotations

import json
from pathlib import Path

from pipeline.config import POSTS_DIR
from pipeline.models.post import BlogPost, PostStatus


class JsonPostRepository:
    """Load/save `BlogPost` records as `{slug}.json` under the posts directory."""

    def __init__(self, posts_dir: Path | None = None) -> None:
        self.posts_dir = Path(posts_dir or POSTS_DIR)
        self.posts_dir.mkdir(parents=True, exist_ok=True)

    @classmethod
    def default(cls) -> JsonPostRepository:
        return cls(POSTS_DIR)

    def _path(self, slug: str) -> Path:
        return self.posts_dir / f"{slug}.json"

    def list_all(self) -> list[BlogPost]:
        out: list[BlogPost] = []
        for p in sorted(self.posts_dir.glob("*.json")):
            try:
                post = self._load(p.stem)
                if post.status == PostStatus.DELETED:
                    continue
                out.append(post)
            except (KeyError, ValueError, json.JSONDecodeError):
                continue
        return out

    def _load(self, slug: str) -> BlogPost:
        path = self._path(slug)
        if not path.is_file():
            raise KeyError(slug)
        data = json.loads(path.read_text(encoding="utf-8"))
        return BlogPost.from_dict(data)

    def get(self, slug: str) -> BlogPost:
        post = self._load(slug)
        if post.status == PostStatus.DELETED:
            raise KeyError(slug)
        return post

    def save(self, post: BlogPost) -> None:
        path = self._path(post.slug)
        path.write_text(json.dumps(post.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def delete(self, slug: str) -> None:
        path = self._path(slug)
        if not path.is_file():
            return
        post = BlogPost.from_dict(json.loads(path.read_text(encoding="utf-8")))
        post.status = PostStatus.DELETED
        path.write_text(json.dumps(post.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def list_published(self) -> list[BlogPost]:
        return [p for p in self.list_all() if p.status == PostStatus.PUBLISHED]

    def slug_exists(self, slug: str) -> bool:
        return self._path(slug).is_file()
