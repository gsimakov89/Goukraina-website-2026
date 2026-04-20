#!/usr/bin/env python3
"""Copy all posts from pipeline/data/posts/*.json into Supabase (requires SUPABASE_* env)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(_ROOT / ".env", override=True)
except ImportError:
    pass

from pipeline.storage.json_repository import JsonPostRepository  # noqa: E402
from pipeline.storage.supabase_repository import SupabasePostRepository  # noqa: E402


def main() -> None:
    if not (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip():
        print("Set SUPABASE_SERVICE_ROLE_KEY (SUPABASE_URL defaults to this project)", file=sys.stderr)
        sys.exit(1)
    src = JsonPostRepository.default()
    dst = SupabasePostRepository()
    for post in src.list_all():
        dst.save(post)
        print("ok", post.slug)


if __name__ == "__main__":
    main()
