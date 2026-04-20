# Go Ukraina admin (React + TypeScript + Vite + Tailwind)

Admin-only SPA; the public marketing site stays static HTML from `build_site.py` for SEO.

## Develop

```bash
cd admin
npm install --legacy-peer-deps
npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173/admin/`). API calls proxy to `http://127.0.0.1:8787` — run the FastAPI admin API (`python -m pipeline.cli admin`) or your Vercel API locally.

## Build

```bash
npm run build
```

Output: `../public/admin/` (served at `/admin/` in production).

## Stack

- React 19, React Router, Supabase JS (email/password)
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Quill via `react-quill` (rich text for blog body)
