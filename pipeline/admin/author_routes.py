"""Author profile CRUD via Supabase REST (matches api/admin/author.js)."""

from __future__ import annotations

import os

import httpx
from fastapi import HTTPException

from pipeline.config import supabase_project_url

TABLE = "author_profiles"


def _headers() -> dict[str, str]:
    url = supabase_project_url().strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise HTTPException(
            503,
            "SUPABASE_SERVICE_ROLE_KEY and Supabase URL required for author profiles.",
        )
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _base() -> str:
    return supabase_project_url().rstrip("/") + "/rest/v1"


def get_default_author() -> dict:
    r = httpx.get(
        f"{_base()}/{TABLE}?is_default=eq.true&select=*&limit=1",
        headers=_headers(),
        timeout=20,
    )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text or "Supabase error")
    rows = r.json()
    return rows[0] if rows else {}


def upsert_author(body: dict) -> dict:
    existing = httpx.get(
        f"{_base()}/{TABLE}?is_default=eq.true&select=id&limit=1",
        headers=_headers(),
        timeout=20,
    )
    if existing.status_code >= 400:
        raise HTTPException(existing.status_code, existing.text or "Supabase error")
    rows = existing.json()
    row_id = rows[0]["id"] if rows else None

    row = {
        "name": str(body.get("name") or "").strip(),
        "role": str(body.get("role") or "").strip(),
        "bio": str(body.get("bio") or "").strip(),
        "avatar_url": str(body.get("avatar_url") or "").strip(),
        "initials": str(body.get("initials") or "").strip()[:4],
        "email": str(body.get("email") or "").strip(),
        "twitter": str(body.get("twitter") or "").strip(),
        "linkedin": str(body.get("linkedin") or "").strip(),
        "website": str(body.get("website") or "").strip(),
        "is_default": True,
    }

    if row_id:
        r = httpx.patch(
            f"{_base()}/{TABLE}?id=eq.{row_id}",
            headers=_headers(),
            json=row,
            timeout=20,
        )
    else:
        r = httpx.post(
            f"{_base()}/{TABLE}",
            headers=_headers(),
            json=row,
            timeout=20,
        )

    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text or "Supabase error")
    out = r.json()
    if isinstance(out, list) and out:
        return {"ok": True, "data": out[0]}
    if isinstance(out, dict):
        return {"ok": True, "data": out}
    return {"ok": True, "data": out}
