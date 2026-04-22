"""Site settings + nav via Supabase REST (parity with api/admin/settings.js and nav.js)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import HTTPException

from pipeline.config import supabase_project_url


def _service_headers() -> dict[str, str]:
    url = supabase_project_url().strip()
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if not url or not key:
        raise HTTPException(503, "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


def _base() -> str:
    return supabase_project_url().rstrip("/") + "/rest/v1"


def site_settings_get_all() -> dict[str, Any]:
    r = httpx.get(
        f"{_base()}/site_settings?select=key,value&order=key.asc",
        headers=_service_headers(),
        timeout=30,
    )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text or "site_settings query failed")
    rows = r.json()
    out: dict[str, Any] = {}
    if isinstance(rows, list):
        for row in rows:
            if isinstance(row, dict) and "key" in row:
                out[str(row["key"])] = row.get("value")
    return out


def site_settings_get_one(key: str) -> dict[str, Any]:
    """Single key (same shape as Vercel GET ?key=)."""
    from urllib.parse import quote

    k = str(key or "").strip()
    if not k:
        raise HTTPException(400, "key required")
    safe = quote(k, safe="")
    r = httpx.get(
        f"{_base()}/site_settings?select=key,value&key=eq.{safe}",
        headers=_service_headers(),
        timeout=30,
    )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text or "site_settings query failed")
    rows = r.json()
    if isinstance(rows, list) and rows and isinstance(rows[0], dict):
        row = rows[0]
        return {"key": row.get("key"), "value": row.get("value")}
    return {"key": k, "value": None}


def site_settings_upsert(items: list[dict[str, Any]]) -> int:
    if not items:
        raise HTTPException(400, "Empty body")
    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for item in items:
        k = str(item.get("key") or "").strip()
        if not k:
            continue
        rows.append({"key": k, "value": item.get("value"), "updated_at": now})
    if not rows:
        raise HTTPException(400, "No valid key/value pairs")
    r = httpx.post(
        f"{_base()}/site_settings?on_conflict=key",
        headers={**_service_headers(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        content=json.dumps(rows),
        timeout=60,
    )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text or "site_settings upsert failed")
    return len(rows)


def site_settings_get_all_soft() -> dict[str, Any]:
    """Return all site_settings rows, or {} if Supabase is unavailable (no env / HTTP error)."""
    try:
        return site_settings_get_all()
    except HTTPException:
        return {}
    except Exception:
        return {}


def nav_items_get_all() -> list[dict[str, Any]]:
    r = httpx.get(
        f"{_base()}/nav_items?select=*&order=nav_group.asc,sort_order.asc",
        headers=_service_headers(),
        timeout=30,
    )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text or "nav_items query failed")
    data = r.json()
    if not isinstance(data, list):
        return []
    out = []
    for row in data:
        if not isinstance(row, dict):
            continue
        out.append(
            {
                "id": row.get("id"),
                "label": row.get("label") or "",
                "href": row.get("href") or "",
                "target": row.get("target") or "",
                "sort_order": row.get("sort_order") if row.get("sort_order") is not None else 0,
                "parent_id": row.get("parent_id"),
                "is_active": bool(row.get("is_active", True)),
                "nav_group": row.get("nav_group") or "desktop",
                "icon_key": row.get("icon_key") or "",
            }
        )
    return out


def nav_items_replace_all(items: list[dict[str, Any]]) -> None:
    """Delete all nav rows, then insert (matches JS handler)."""
    h = _service_headers()
    dummy = "00000000-0000-0000-0000-000000000000"
    r_del = httpx.delete(
        f"{_base()}/nav_items?id=neq.{dummy}",
        headers=h,
        timeout=30,
    )
    if r_del.status_code >= 400:
        raise HTTPException(r_del.status_code, r_del.text or "nav_items delete failed")
    if not items:
        return
    rows = []
    for i, item in enumerate(items):
        label = str(item.get("label") or "").strip()
        href = str(item.get("href") or "").strip()
        if not label or not href:
            continue
        rows.append(
            {
                "label": label,
                "href": href,
                "target": str(item.get("target") or "").strip(),
                "sort_order": int(item.get("sort_order") if item.get("sort_order") is not None else i * 10),
                "parent_id": item.get("parent_id"),
                "is_active": item.get("is_active") is not False,
                "nav_group": str(item.get("nav_group") or "desktop").strip(),
                "icon_key": str(item.get("icon_key") or "").strip()[:64],
            }
        )
    if not rows:
        return
    r_ins = httpx.post(f"{_base()}/nav_items", headers=h, content=json.dumps(rows), timeout=60)
    if r_ins.status_code >= 400:
        raise HTTPException(r_ins.status_code, r_ins.text or "nav_items insert failed")


def nav_items_insert_one(body: dict[str, Any]) -> dict[str, Any]:
    label = str(body.get("label") or "").strip()
    href = str(body.get("href") or "").strip()
    if not label or not href:
        raise HTTPException(400, "label and href required")
    row = {
        "label": label,
        "href": href,
        "target": str(body.get("target") or "").strip(),
        "sort_order": int(body.get("sort_order") if body.get("sort_order") is not None else 999),
        "parent_id": body.get("parent_id"),
        "is_active": body.get("is_active") is not False,
        "nav_group": str(body.get("nav_group") or "desktop").strip(),
        "icon_key": str(body.get("icon_key") or "").strip()[:64],
    }
    r = httpx.post(
        f"{_base()}/nav_items",
        headers=_service_headers(),
        content=json.dumps(row),
        timeout=30,
    )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, r.text or "nav_items insert failed")
    data = r.json()
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        raise HTTPException(500, "Unexpected insert response")
    return {
        "id": data.get("id"),
        "label": data.get("label") or "",
        "href": data.get("href") or "",
        "target": data.get("target") or "",
        "sort_order": data.get("sort_order") if data.get("sort_order") is not None else 0,
        "parent_id": data.get("parent_id"),
        "is_active": bool(data.get("is_active", True)),
        "nav_group": data.get("nav_group") or "desktop",
        "icon_key": data.get("icon_key") or "",
    }
