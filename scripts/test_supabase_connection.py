#!/usr/bin/env python3
"""Smoke-test Supabase REST and the blog_posts table (loads repo-root .env). Does not print secrets."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".env", override=True)
except ImportError:
    pass

import httpx  # noqa: E402

from pipeline.config import supabase_project_url  # noqa: E402


def main() -> int:
    base = supabase_project_url().rstrip("/")
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    anon = (os.environ.get("SUPABASE_ANON_KEY") or "").strip()
    jwt_set = bool((os.environ.get("SUPABASE_JWT_SECRET") or os.environ.get("JWT_SECRET") or "").strip())

    print(f"Project URL: {base}")
    if not key:
        print("FAIL: SUPABASE_SERVICE_ROLE_KEY missing (add to .env)")
        return 1
    if not anon:
        print("WARN: SUPABASE_ANON_KEY missing (admin SPA needs it on the host)")
    if not jwt_set:
        print("WARN: SUPABASE_JWT_SECRET missing (admin API will reject Supabase logins)")

    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Accept-Profile": "public"}

    try:
        r = httpx.get(
            f"{base}/rest/v1/blog_posts?select=slug&limit=1",
            headers=headers,
            timeout=20.0,
        )
    except httpx.RequestError as e:
        print(f"FAIL: network error — {e}")
        return 1

    if r.status_code == 200:
        rows = r.json()
        n = len(rows) if isinstance(rows, list) else 0
        print(f"OK: blog_posts reachable (sample rows in response: {n})")
        return 0

    body = (r.text or "")[:800]
    print(f"FAIL: HTTP {r.status_code}")
    print(body)
    if r.status_code in (404, 406) or "PGRST" in body or "does not exist" in body.lower():
        print(
            "\nHint: run the SQL in supabase/migrations/20260415000000_blog_posts.sql "
            "in the Supabase SQL Editor, then retry."
        )
    return 2


if __name__ == "__main__":
    sys.exit(main())
