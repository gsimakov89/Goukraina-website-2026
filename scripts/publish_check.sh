#!/usr/bin/env bash
# Local pre-publish checks (same steps as Vercel install + build).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== npm install =="
npm install

echo "== pip (requirements.txt) =="
if command -v python3 >/dev/null 2>&1; then
  python3 -m pip install -r requirements.txt
else
  echo "python3 not found" >&2
  exit 1
fi

if [[ -f "$ROOT/.env" ]]; then
  echo "== Supabase smoke test (needs .env) =="
  python3 scripts/test_supabase_connection.py || echo "WARN: Supabase test failed — check .env or skip for JSON-only builds"
else
  echo "== skip Supabase test (no .env) =="
fi

echo "== build_site.py =="
python3 build_site.py

echo "== Python compile check =="
python3 -m compileall -q pipeline build_site.py scripts

echo "== Node ESM load (admin_auth) =="
node -e "import('./api/_lib/admin_auth.mjs').then(()=>console.log('ok')).catch(e=>{console.error(e);process.exit(1)})"

echo ""
echo "OK — ready to commit/push. On Vercel: set env vars (see VERCEL.md), then deploy."
