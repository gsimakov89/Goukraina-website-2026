"""CMS media via Supabase Storage (public bucket) + media_library metadata."""

from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

from pipeline.admin.supabase_storage import media_bucket_name, public_object_url, storage_list, storage_remove, storage_upload
from pipeline.config import supabase_project_url

ALLOWED_EXT = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp"})
MAX_BYTES = 8 * 1024 * 1024


def _sb_headers() -> dict[str, str]:
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not supabase_project_url().strip() or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required for media (Storage).")
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def _media_rows() -> list[dict[str, Any]]:
    base = supabase_project_url().rstrip("/")
    r = httpx.get(
        f"{base}/rest/v1/media_library?select=filename,path,url,alt_text,size_bytes,created_at&deleted_at=is.null&order=created_at.desc",
        headers=_sb_headers(),
        timeout=30.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(r.text or "media_library query failed")
    data = r.json()
    return data if isinstance(data, list) else []


def list_uploads() -> list[dict[str, Any]]:
    rows = _media_rows()
    by_name = {str(r.get("filename") or ""): r for r in rows}
    try:
        objects = storage_list()
    except Exception as e:
        raise RuntimeError(str(e)) from e

    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    bucket = media_bucket_name()

    for o in objects:
        name = str(o.get("name") or "")
        if not name or name.endswith("/"):
            continue
        ext = Path(name).suffix.lower()
        if ext not in ALLOWED_EXT:
            continue
        seen.add(name)
        r = by_name.get(name)
        meta = o.get("metadata") if isinstance(o.get("metadata"), dict) else {}
        raw_size = meta.get("size")
        size_b: int | None
        if isinstance(raw_size, int):
            size_b = raw_size
        elif isinstance(raw_size, str) and raw_size.isdigit():
            size_b = int(raw_size)
        elif r and r.get("size_bytes") is not None:
            try:
                size_b = int(r["size_bytes"])
            except (TypeError, ValueError):
                size_b = None
        else:
            size_b = None

        pub = public_object_url(name)
        url = pub
        if r and str(r.get("url") or "").startswith("http"):
            url = str(r["url"])
        out.append(
            {
                "filename": name,
                "path": f"{bucket}/{name}",
                "url": url,
                "alt_text": str(r.get("alt_text") or "") if r else "",
                "size_bytes": size_b,
            }
        )

    for r in rows:
        fn = str(r.get("filename") or "")
        if not fn or fn in seen:
            continue
        url = str(r.get("url") or "")
        if not url.startswith("http"):
            url = public_object_url(fn)
        sb = r.get("size_bytes")
        size_b: int | None
        try:
            size_b = int(sb) if sb is not None else None
        except (TypeError, ValueError):
            size_b = None
        out.append(
            {
                "filename": fn,
                "path": str(r.get("path") or f"{bucket}/{fn}"),
                "url": url,
                "alt_text": str(r.get("alt_text") or ""),
                "size_bytes": size_b,
            }
        )

    return out


def _content_type(ext: str) -> str:
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }.get(ext.lower(), "application/octet-stream")


def _upsert_library(filename: str, url: str, alt_text: str, size_bytes: int) -> None:
    base = supabase_project_url().rstrip("/")
    bucket = media_bucket_name()
    row = {
        "filename": filename,
        "path": f"{bucket}/{filename}",
        "url": url,
        "alt_text": alt_text,
        "size_bytes": size_bytes,
    }
    r = httpx.post(
        f"{base}/rest/v1/media_library?on_conflict=filename",
        headers={**_sb_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        content=json.dumps(row),
        timeout=30.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(r.text or "media_library upsert failed")


def save_upload(filename: str, content: bytes) -> dict[str, str]:
    if len(content) > MAX_BYTES:
        raise ValueError("File too large (max 8MB)")
    name = Path(filename).name
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXT:
        raise ValueError("Only jpg, png, gif, webp allowed")
    safe_stem = re.sub(r"[^a-zA-Z0-9_-]+", "-", Path(name).stem)[:60] or "image"
    final = f"{safe_stem}-{uuid.uuid4().hex[:10]}{ext}"
    storage_upload(final, content, _content_type(ext))
    pub = public_object_url(final)
    try:
        _upsert_library(final, pub, "", len(content))
    except Exception:
        pass
    return {"filename": final, "path": f"{media_bucket_name()}/{final}", "url": pub}


def delete_upload(filename: str) -> None:
    name = Path(filename).name
    storage_remove(name)
    base = supabase_project_url().rstrip("/")
    r = httpx.patch(
        f"{base}/rest/v1/media_library",
        params={"filename": f"eq.{name}"},
        headers=_sb_headers(),
        content=json.dumps({"deleted_at": datetime.now(timezone.utc).isoformat()}),
        timeout=20.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(r.text or "media_library delete failed")
