"""CLI entrypoints for the content pipeline."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path


def _root() -> Path:
    return Path(__file__).resolve().parent.parent


def cmd_static_build() -> int:
    """Run `build_site.py` (static HTML + SEO files)."""
    r = _root()
    proc = subprocess.run([sys.executable, str(r / "build_site.py")], cwd=str(r))
    return int(proc.returncode)


def cmd_admin() -> int:
    """Start the FastAPI admin (requires `requirements-pipeline.txt`)."""
    try:
        from dotenv import load_dotenv

        # override=True: repo `.env` wins over stale shell/IDE env (default False would skip .env).
        load_dotenv(_root() / ".env", override=True)
    except ImportError:
        pass
    try:
        import uvicorn
    except ImportError:
        print("Install optional deps: pip install -r requirements-pipeline.txt", file=sys.stderr)
        return 1
    host = os.environ.get("BLOG_ADMIN_HOST", "127.0.0.1")
    port = int(os.environ.get("BLOG_ADMIN_PORT", "8787"))
    uvicorn.run(
        "pipeline.admin.server:app",
        host=host,
        port=port,
        reload=os.environ.get("BLOG_ADMIN_RELOAD", "1") == "1",
    )
    return 0


def main() -> None:
    p = argparse.ArgumentParser(description="Go Ukraina pipeline commands")
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="Run static site generator (build_site.py)")
    b.set_defaults(_fn=cmd_static_build)

    a = sub.add_parser("admin", help="Run blog admin server (FastAPI + Quill UI)")
    a.set_defaults(_fn=cmd_admin)

    args = p.parse_args()
    code = int(args._fn())
    raise SystemExit(code)


if __name__ == "__main__":
    main()
