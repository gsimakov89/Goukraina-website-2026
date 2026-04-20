# Deploying on Vercel

This repo is a **static site** (`public/` after build) plus **Node serverless functions** under `api/`.

## One-time setup

1. Push the repo to GitHub (or GitLab / Bitbucket).
2. In [Vercel](https://vercel.com) → **Add New Project** → import the repository.
3. Vercel should pick up **`vercel.json`** (build command, output directory, install command). Do **not** change the framework to Next.js; leave as **Other** if asked.
4. Add **Environment Variables** (Project → Settings → Environment Variables). Use **Production** (and Preview if you want staging builds to match).

### Required for production

| Name | Notes |
|------|--------|
| `SUPABASE_ANON_KEY` | Public / publishable key (admin UI + `/api/supabase-public-config`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret key — **required** if posts live in Supabase (`blog_posts`). Admin login can use `admin_users` with **anon + user JWT** (see below) without this, but the build/pipeline still needs the service role for server-side post reads/writes. |
| `SUPABASE_JWT_SECRET` | JWT signing secret (Supabase **Settings → API → JWT signing**). Must match the project or every API call returns “invalid session”. |

`SUPABASE_URL` is optional here — the app defaults to the project URL in `pipeline/config.py` — but you can set it explicitly in Vercel if you prefer.

### Optional

| Name | Notes |
|------|--------|
| `OPENAI_API_KEY` | For `/api/ai/enrich` and `/api/ai/alt-image`. |
| `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH` | Only if you still use **GitHub** for posts or media instead of Supabase-only. |
| `VERCEL_DEPLOY_HOOK_URL` | Optional POST hook from `/api/redeploy`. |
| `ADMIN_EMAIL_ALLOWLIST` | Optional comma-separated emails granted admin API access without `admin_users` / metadata (escape hatch; prefer a row in `public.admin_users`). |

After changing env vars, **redeploy** (Deployments → … → Redeploy).

## What the build does

1. `npm install` at repo root (serverless deps: Supabase client, `jose`) **and** `cd admin && npm install --legacy-peer-deps` (Vite React admin).
2. `pip install -r requirements.txt` (Python: `httpx`, `PyJWT`, `python-dotenv` for `build_site.py`).
3. `python3 build_site.py` — generates static pages in `public/`, runs **`npm run build` in `admin/`** to emit the **React admin** into `public/admin/`, then writes SEO files. With `SUPABASE_SERVICE_ROLE_KEY`, blog HTML is built from **Supabase** `blog_posts`.

## Admin CMS

- **`/admin`** — **Vite + React + TypeScript + Tailwind** SPA (source in `admin/`); it calls **`/api/*`** on the same origin. Public pages remain pre-rendered HTML for SEO.
- Ensure each admin is granted access: **`public.admin_users`** row (recommended), **`app_metadata.admin`**, or **`ADMIN_EMAIL_ALLOWLIST`** — see `supabase/seed_admin_user.sql`. If login works but APIs return 403, the JWT secret is wrong or the user is not allowlisted.

## Local check

```bash
npm install && python3 -m pip install -r requirements.txt && python3 build_site.py
```

Use `vercel dev` to test API routes locally (requires [Vercel CLI](https://vercel.com/docs/cli)).

## Serverless timeouts

`vercel.json` sets **`maxDuration`: 10** seconds for `api/**/*.js` (fits the Hobby limit). If AI routes hit timeouts on **Pro**, raise `maxDuration` (up to 60s) in `vercel.json` under `functions`.
