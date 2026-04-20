"""Supabase Storage (public bucket) for CMS media — mirrors api/_lib/supabase_storage.mjs."""

from __future__ import annotations

import os
from urllib.parse import quote

import httpx

from pipeline.config import supabase_project_url


def _service_key() -> str:
    k = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not k:
        raise RuntimeError("SUPABASE_SERVICE_ROLE_KEY required for Storage")
    return k


def media_bucket_name() -> str:
    return (os.environ.get("SUPABASE_MEDIA_BUCKET") or "cms-uploads").strip() or "cms-uploads"


def _headers() -> dict[str, str]:
    key = _service_key()
    return {"apikey": key, "Authorization": f"Bearer {key}"}


def public_object_url(object_key: str) -> str:
    base = supabase_project_url().rstrip("/")
    b = media_bucket_name()
    parts = [p for p in object_key.split("/") if p]
    path_part = "/".join(quote(p, safe="") for p in parts)
    return f"{base}/storage/v1/object/public/{b}/{path_part}"


def storage_upload(object_key: str, content: bytes, content_type: str) -> None:
    base = supabase_project_url().rstrip("/")
    bucket = media_bucket_name()
    parts = [p for p in object_key.split("/") if p]
    path_part = "/".join(quote(p, safe="") for p in parts)
    url = f"{base}/storage/v1/object/{quote(bucket, safe='')}/{path_part}"
    r = httpx.post(
        url,
        headers={**_headers(), "Content-Type": content_type, "x-upsert": "true"},
        content=content,
        timeout=120.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(r.text or f"Storage upload failed ({r.status_code})")


def storage_remove(object_key: str) -> None:
    base = supabase_project_url().rstrip("/")
    bucket = media_bucket_name()
    parts = [p for p in object_key.split("/") if p]
    path_part = "/".join(quote(p, safe="") for p in parts)
    url = f"{base}/storage/v1/object/{quote(bucket, safe='')}/{path_part}"
    r = httpx.delete(url, headers=_headers(), timeout=60.0)
    if r.status_code >= 400 and r.status_code != 404:
        raise RuntimeError(r.text or f"Storage delete failed ({r.status_code})")


def storage_list() -> list[dict]:
    base = supabase_project_url().rstrip("/")
    bucket = media_bucket_name()
    url = f"{base}/storage/v1/object/list/{quote(bucket, safe='')}"
    r = httpx.post(
        url,
        headers={**_headers(), "Content-Type": "application/json"},
        json={"prefix": "", "limit": 1000, "offset": 0},
        timeout=60.0,
    )
    if r.status_code >= 400:
        raise RuntimeError(r.text or f"Storage list failed ({r.status_code})")
    data = r.json()
    return data if isinstance(data, list) else []
