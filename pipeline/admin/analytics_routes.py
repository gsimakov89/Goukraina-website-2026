"""GA4 + sitemap helpers (matches api/admin/analytics.js)."""

from __future__ import annotations

import json
import os
import time
from typing import Any
from urllib.parse import quote

import httpx
import jwt
from fastapi import HTTPException

from pipeline.admin.site_admin_rest import site_settings_get_all_soft, site_settings_upsert

SITE_ORIGIN = "https://www.goukraina.org"

_ANALYTICS_KEY = "analytics"


def _analytics_from_db() -> dict[str, Any]:
    rows = site_settings_get_all_soft()
    v = rows.get(_ANALYTICS_KEY)
    return v if isinstance(v, dict) else {}


def _env_analytics_defaults() -> dict[str, str]:
    return {
        "ga4_property_id": (os.environ.get("GA4_PROPERTY_ID") or "").strip(),
        "gsc_site_url": (os.environ.get("GSC_SITE_URL") or "").strip() or f"{SITE_ORIGIN}/",
        "ga4_service_account_json": (os.environ.get("GA4_SERVICE_ACCOUNT_JSON") or "").strip(),
    }


def merged_analytics() -> dict[str, str]:
    """Supabase `site_settings.analytics` overrides env for each non-empty field."""
    env = _env_analytics_defaults()
    db = _analytics_from_db()
    out = dict(env)
    for k in ("ga4_property_id", "gsc_site_url", "ga4_service_account_json"):
        if k not in db:
            continue
        v = db[k]
        if not isinstance(v, str):
            continue
        if k == "ga4_service_account_json":
            if v.strip():
                out[k] = v.strip()
        elif k == "gsc_site_url":
            s = v.strip()
            out[k] = s if s else f"{SITE_ORIGIN}/"
        elif v.strip():
            out[k] = v.strip()
    return out


def get_analytics_config_admin() -> dict[str, Any]:
    """Safe fields for admin UI (never returns service account JSON)."""
    m = merged_analytics()
    raw = m.get("ga4_service_account_json") or ""
    has_sa = bool(raw.strip()) and _service_account_from_raw(raw) is not None
    return {
        "ga4_property_id": m.get("ga4_property_id") or "",
        "gsc_site_url": m.get("gsc_site_url") or f"{SITE_ORIGIN}/",
        "service_account_configured": has_sa,
    }


def save_analytics_config(body: dict[str, Any]) -> None:
    """Persist analytics settings to site_settings.analytics (merged with existing)."""
    current = _analytics_from_db()
    merged: dict[str, Any] = {**current}

    if "ga4_property_id" in body:
        merged["ga4_property_id"] = str(body.get("ga4_property_id") or "").strip()
    if "gsc_site_url" in body:
        u = str(body.get("gsc_site_url") or "").strip()
        merged["gsc_site_url"] = u if u else f"{SITE_ORIGIN}/"

    if "ga4_service_account_json" in body:
        raw = str(body.get("ga4_service_account_json") or "").strip()
        if raw:
            try:
                json.loads(raw)
            except json.JSONDecodeError as e:
                raise HTTPException(400, "Google service account JSON must be valid JSON.") from e
            merged["ga4_service_account_json"] = raw
        else:
            merged.pop("ga4_service_account_json", None)

    site_settings_upsert([{"key": _ANALYTICS_KEY, "value": merged}])


def _service_account_from_raw(raw: str) -> dict[str, Any] | None:
    if not raw.strip():
        return None
    try:
        out = json.loads(raw)
        return out if isinstance(out, dict) else None
    except json.JSONDecodeError:
        return None


def _service_account() -> dict[str, Any] | None:
    raw = merged_analytics().get("ga4_service_account_json") or ""
    return _service_account_from_raw(raw)


def get_google_access_token(scopes: list[str] | str) -> str | None:
    sa = _service_account()
    if not sa or not sa.get("private_key") or not sa.get("client_email"):
        return None
    now = int(time.time())
    scope = " ".join(scopes) if isinstance(scopes, list) else scopes
    claim = {
        "iss": sa["client_email"],
        "scope": scope,
        "aud": "https://oauth2.googleapis.com/token",
        "iat": now,
        "exp": now + 3600,
    }
    assertion = jwt.encode(
        claim,
        sa["private_key"],
        algorithm="RS256",
        headers={"alg": "RS256", "typ": "JWT"},
    )
    with httpx.Client(timeout=30) as client:
        r = client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
    try:
        data = r.json()
    except Exception:
        raise RuntimeError(r.text or "Token exchange failed") from None
    if not r.is_success:
        raise RuntimeError(data.get("error_description") or data.get("error") or "Token exchange failed")
    return data.get("access_token")


def get_top_pages() -> dict[str, Any]:
    cfg = merged_analytics()
    property_id = (cfg.get("ga4_property_id") or "").strip()
    if not property_id:
        return {
            "configured": False,
            "message": "Add your GA4 property ID and service account below (stored in Supabase).",
        }

    token = get_google_access_token(["https://www.googleapis.com/auth/analytics.readonly"])
    if not token:
        return {
            "configured": False,
            "message": "Service account JSON is missing or invalid. Paste a valid Google Cloud service account key.",
        }

    prop = property_id if property_id.startswith("properties/") else f"properties/{property_id}"
    body = {
        "dateRanges": [{"startDate": "28daysAgo", "endDate": "today"}],
        "dimensions": [{"name": "pagePath"}, {"name": "pageTitle"}],
        "metrics": [
            {"name": "screenPageViews"},
            {"name": "activeUsers"},
            {"name": "averageSessionDuration"},
        ],
        "orderBys": [{"metric": {"metricName": "screenPageViews"}, "desc": True}],
        "limit": 20,
    }
    with httpx.Client(timeout=45) as client:
        r = client.post(
            f"https://analyticsdata.googleapis.com/v1beta/{prop}:runReport",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            content=json.dumps(body),
        )
    try:
        data = r.json()
    except Exception:
        raise RuntimeError(r.text or "GA4 query failed") from None
    if not r.is_success:
        raise RuntimeError(data.get("error", {}).get("message") or data.get("message") or "GA4 query failed")

    def _dim(dv: Any, i: int) -> str:
        if not isinstance(dv, list) or i >= len(dv):
            return ""
        cell = dv[i]
        if not isinstance(cell, dict):
            return ""
        return str(cell.get("value") or "")

    def _met(mv: Any, i: int) -> str:
        if not isinstance(mv, list) or i >= len(mv):
            return "0"
        cell = mv[i]
        if not isinstance(cell, dict):
            return "0"
        return str(cell.get("value") or "0")

    rows_out: list[dict[str, Any]] = []
    for row in data.get("rows") or []:
        if not isinstance(row, dict):
            continue
        dv = row.get("dimensionValues") or []
        mv = row.get("metricValues") or []
        rows_out.append(
            {
                "path": _dim(dv, 0),
                "title": _dim(dv, 1),
                "views": int(_met(mv, 0)),
                "users": int(_met(mv, 1)),
                "avg_duration_seconds": round(float(_met(mv, 2))),
            }
        )
    total = sum(r["views"] for r in rows_out)
    return {"configured": True, "rows": rows_out, "total_views": total}


def submit_sitemap() -> dict[str, Any]:
    site_url = (merged_analytics().get("gsc_site_url") or f"{SITE_ORIGIN}/").strip()
    sitemap_url = f"{SITE_ORIGIN}/sitemap.xml"
    ping_url = f"https://www.google.com/ping?sitemap={quote(sitemap_url, safe='')}"
    results: list[dict[str, Any]] = []

    try:
        with httpx.Client(timeout=30, follow_redirects=True) as client:
            pr = client.get(ping_url)
        results.append({"method": "ping", "ok": pr.is_success, "status": pr.status_code})
    except Exception as e:
        results.append({"method": "ping", "ok": False, "error": str(e)})

    try:
        token = get_google_access_token(["https://www.googleapis.com/auth/webmasters"])
        if token:
            encoded_site = quote(site_url, safe="")
            encoded_sitemap = quote(sitemap_url, safe="")
            with httpx.Client(timeout=30) as client:
                gr = client.put(
                    f"https://www.googleapis.com/webmasters/v3/sites/{encoded_site}/sitemaps/{encoded_sitemap}",
                    headers={"Authorization": f"Bearer {token}"},
                )
            results.append({"method": "search_console", "ok": gr.is_success, "status": gr.status_code})
        else:
            results.append(
                {"method": "search_console", "ok": False, "skipped": "GA4_SERVICE_ACCOUNT_JSON not set"}
            )
    except Exception as e:
        results.append({"method": "search_console", "ok": False, "error": str(e)})

    return {"ok": any(r.get("ok") for r in results), "sitemap": sitemap_url, "results": results}
