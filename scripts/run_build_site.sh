#!/usr/bin/env sh
# Prefer project venv (Vercel installCommand) so pip deps match; else system python3 for local dev.
set -e
ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [ -x .venv/bin/python3 ]; then
  exec .venv/bin/python3 build_site.py "$@"
else
  exec python3 build_site.py "$@"
fi
