# Full SEO audit — Go Ukraina static site (generator: `build_site.py`)

**Scope:** Entire static app under `public/` (regenerated from `build_site.py`).  
**Date:** 2026-04-15  
**Primary domain (canonical):** `https://www.goukraina.org`

## Executive summary

| Category | Weight | Score | Notes |
|----------|--------|-------|--------|
| Technical SEO | 25% | 84 | Canonical, robots, sitemap with `lastmod`, hreflang, theme-color; AI crawler rules explicit |
| Content quality | 20% | 78 | Strong nonprofit positioning; blog E-E-A-T via author + field reports (content depth varies by page) |
| On-page SEO | 15% | 86 | Titles/descriptions, OG/Twitter, article tags on blog |
| Schema | 15% | 88 | `WebSite` node added to `@graph`; `BlogPosting` aligned with `WebPage#webpage` |
| Performance (CWV) | 10% | — | Not measured in this pass (requires live URL + PSI) |
| Image optimization | 10% | 72 | Hero dimensions set; verify real image dimensions vs OG `1200×630` claims on posts |
| AI / GEO readiness | 5% | 82 | `llms.txt` production-oriented; `robots.txt` allows major AI crawlers |

**Overall (weighted, excluding CWV): ~83** — Good, with room in performance verification and optional structured-data depth.

## Confirmed findings (implemented)

### Structured data — WebSite entity

- **Finding:** `WebPage.isPartOf` referenced `#website` but no `WebSite` object existed in the graph.  
- **Evidence:** `json_ld_org_webpage()` in `build_site.py` now emits `WebSite` with `@id` …`/#website`, `publisher` → organization.  
- **Impact:** Search engines and knowledge panels can relate pages to a defined site entity.  
- **Confidence:** Confirmed.

### BlogPosting alignment

- **Finding:** `mainEntityOfPage` used bare URL `@id` while the page graph used `url#webpage`.  
- **Evidence:** `blog_posting_schema()` uses `mainEntityOfPage.@id = {url}#webpage`, adds `@id` on `BlogPosting`, `url`, `dateModified`.  
- **Impact:** Cleaner entity linking; fewer ambiguous `@id` collisions.  
- **Confidence:** Confirmed.

### Social & discovery meta

- **Finding:** Article pages lacked Open Graph article timestamps and image alt text.  
- **Evidence:** Blog `head_common()` passes `article:published_time`, `article:modified_time`, `og:image:alt`, `twitter:image:alt`; default pages include `og:image:width`/`height`, `twitter:site`, `theme-color`, `hreflang`.  
- **Impact:** Better link previews and accessibility signals for social platforms.  
- **Confidence:** Confirmed.

### Sitemap

- **Finding:** Uniform `changefreq`/`priority`; no `lastmod`.  
- **Evidence:** `write_seo_files()` emits per-URL `lastmod` (blog dates from `BLOG_ENTRIES`; fallback = max blog date), varied `changefreq`/`priority`.  
- **Impact:** Crawlers get freshness hints; blog posts show accurate dates.  
- **Confidence:** Confirmed.

### robots.txt & llms.txt

- **Finding:** `llms.txt` described a “static preview” build; robots had only wildcard + sitemap.  
- **Evidence:** `robots.txt` documents `Allow` for common AI crawlers; `llms.txt` lists canonical URLs and mission without preview-only disclaimer.  
- **Impact:** Clearer AI/LLM policy and brand context (adjust if you need to restrict crawlers).  
- **Confidence:** Confirmed.

## Likely / follow-up (not fully verified on production)

| Item | Severity | Notes |
|------|----------|--------|
| Core Web Vitals | ℹ️ | Run PageSpeed Insights on deployed URL (mobile + desktop). |
| OG image dimensions vs assets | ⚠️ | Blog covers may not be exactly 1200×630; consider real dimensions or standardized crops. |
| `twitter:site` handle | ⚠️ | Set to `@goukraina`; confirm this is the active X handle. |
| BreadcrumbList JSON-LD | ℹ️ | Optional enhancement for inner pages and blog. |
| Security headers | ℹ️ | HSTS/CSP are server/CDN concerns, not in static HTML. |

## Environment limitations

- No live-URL fetch, PSI, or broken-link crawl was run against production in this pass; CWV and header checks should be run post-deploy.
