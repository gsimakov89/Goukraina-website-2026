# Admin feature audit (launch prompt vs codebase)

**Public site SEO:** `build_site.py` emits static HTML/CSS in `public/`. The admin is a React SPA at `/admin/` (noindex). Crawlers consume public HTML only.

## Launch scope checklist

| Requirement | Status | Notes |
|-------------|--------|--------|
| Admin dashboard + Supabase auth, admin-only | **Done** | JWT + `admin_users` / metadata / `ADMIN_EMAIL_ALLOWLIST` (`pipeline/admin/auth.py`, `api/_lib/admin_auth.mjs`). |
| Pixels, GTM, tracking in backend | **Partial** | Keys live in `site_settings` JSON (`SiteSettingsPage`); `build_site.py` injects tracking from `_SITE_SETTINGS` when keys exist. Admin UI is raw JSON — not a guided form. |
| Blog UX “extraordinary” / non-tech friendly | **Partial** | Solid Quill editor (headers, bold, lists, link, image, video, blockquote), SEO sidebar, AI buttons. Not yet at “work of art” polish; no guided first-run. |
| Share buttons + SEO + LLM discovery | **Partial** | Meta/OG fields in editor; public templates must include them (verify per page). `llms.txt` / RSS via SEO tools API. No dedicated “share” row in editor UI. |
| Author card around blog | **Partial** | `author_profiles` + Author page in admin; confirm public blog template renders card from same data. |
| Newsletter popup + GoHighLevel | **Done (API)** | `public/assets/js/newsletter-popup.js`, `ghl_webhook_url` in `newsletter_popup` settings, `api/newsletter/subscribe.js`. |
| Static HTML public site (SEO-safe) | **Done** | Admin does not replace public HTML generation. |
| OpenAI-assisted writer | **Partial** | `api/ai/enrich.js`, `api/ai/blog-assist.js`, `api/ai/seo-review.js` (OpenAI). **React admin wires enrich + SEO review only** — **blog-assist is not hooked in the UI.** |
| Claude API | **Not done** | No Anthropic routes in repo; only OpenAI (`api/_lib/ai_keys.mjs`). |
| AI review all fields + auto-correct modal (old vs new, accept all / partial) | **Partial** | API returns structured `fields` in `seo-review`. UI shows **JSON only**; comment in `BlogEditorPage`: “granular accept partial can be added next.” |
| Navigation editor, rearrange without code | **Partial** | DB + API + form with **numeric `sort_order`** — **no drag-and-drop.** |
| SEO Optimizer: AI site analysis + GA + one place | **Partial** | `SeoPage` + `AnalyticsPage` separate; AI analyze + previews exist; not a single fused “optimizer” experience. |
| Generate sitemap, robots, RSS, llms, view | **Done** | `SeoPage` + `api/admin/seo-tools.js`. |
| GA4 top pages + sitemap ping | **Done (needs env)** | `AnalyticsPage` + `api/admin/analytics.js` (`GA4_*`). |
| Google sitelinks | **Expectation** | Sitemap ping helps indexing; **sitelinks are algorithmic** — no API guarantees them. |
| Rich content (images, videos, quotes) | **Partial** | Quill supports image/video/blockquote; **not** a bespoke “insert quote” block beyond blockquote. |
| Media gallery, alt on upload, delete | **Partial** | Gallery list + upload + alt edit; **no delete** in `MediaPage.tsx` (check API). |
| Soft-delete blog | **Partial** | **Vercel** `api/posts/[slug].js`: `status=deleted`. **Local FastAPI** `SupabasePostRepository.delete` uses **HTTP DELETE** (hard remove row) — **inconsistent with soft-delete requirement.** |

## Implemented (backend / APIs)

| Feature | Where | Notes |
|--------|--------|--------|
| Supabase auth for admin | `api/_lib/admin_auth.mjs`, `pipeline/admin/auth.py` | See above |
| Blog CRUD (DB) | `api/posts/*` | Soft delete on **Vercel** only |
| AI: enrich | `api/ai/enrich.js` | Wired in `BlogEditorPage` |
| AI: blog assist | `api/ai/blog-assist.js` | **Not wired in React admin** |
| AI: SEO review | `api/ai/seo-review.js` | JSON modal only |
| AI: alt image | `api/ai/alt-image.js` | Optional route |
| Media | `api/media/*` | |
| Site settings JSON | `api/admin/settings.js` | |
| Author profile | `api/admin/author.js` | |
| Nav editor (DB) | `api/admin/nav.js` | **Public `build_site.py` nav is still hardcoded** — editor does not drive static header yet |
| SEO tools | `api/admin/seo-tools.js` | |
| GA4 + sitemap ping | `api/admin/analytics.js` | |
| Newsletter → GHL | `api/newsletter/subscribe.js` | |
| Newsletter popup (public) | `public/assets/js/newsletter-popup.js` | |
| Import local posts | `api/admin/import-local-posts.js` | |

## Partially implemented / gaps

| Gap | Detail |
|-----|--------|
| Nav on live site | **Done:** `build_site.py` loads `nav_items` when `SUPABASE_*` + service role set; **≥2** active non-mobile items replace the desktop primary nav (dropdown removed when DB nav is used). Mobile “More” strip still hardcoded. |
| Tracking UI | JSON editor only — add form fields for GTM / Meta / etc. |
| AI accept/diff modal | **Done:** `SeoReviewModal` + apply selected / accept all. |
| Drag-and-drop nav | **Done:** `@dnd-kit` sortable in `NavEditorPage`. |
| FastAPI soft delete | **Done:** Supabase PATCH `status=deleted`; JSON repo soft-deletes file. |
| Claude | New integration or shared abstraction over `ANTHROPIC_API_KEY`. |
| Media delete | **Done:** DELETE `/api/media/{filename}` in FastAPI; button in `MediaPage`. |
| FastAPI vs Vercel API surface | Local server still does **not** mirror every `/api/admin/*` route (e.g. settings, seo-tools, analytics). Use **Vercel** or extend `server.py` for full parity. **`/api/ai/seo-review`** and **`/api/ai/blog-assist`** added for local dev. |

## React admin (Vite + TS + Tailwind)

Source: `admin/` → build output `public/admin/`. Dev: `cd admin && npm run dev` → [http://localhost:5173/admin/](http://localhost:5173/admin/) (proxies `/api` → `127.0.0.1:8787`). Production-like: `python -m pipeline.cli admin` → [http://127.0.0.1:8787/admin/](http://127.0.0.1:8787/admin/).

**SEO impact:** None on public HTML; `/admin` noindex.
