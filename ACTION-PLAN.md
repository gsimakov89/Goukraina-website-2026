# SEO action plan — Go Ukraina

Prioritized after the 2026-04-15 generator pass. Re-run `python3 build_site.py` after any `build_site.py` edits.

## P0 — After deploy

1. **Verify Search Console & indexing**  
   Submit `https://www.goukraina.org/sitemap.xml`; check coverage and canonical domain (www vs apex).

2. **Core Web Vitals**  
   Run PageSpeed Insights (mobile first) on home, donate, and one blog post; fix LCP/INP/CLS issues (images, fonts, JS).

3. **Confirm X/Twitter handle**  
   Ensure `TWITTER_SITE` in `build_site.py` matches the real `@` handle for `twitter:site`.

## P1 — Content & structured data

4. **Real `lastmod` for static pages**  
   Currently non-blog URLs use the latest blog post date as fallback. When you ship meaningful edits to a page, bump a dedicated `SITE_SITEMAP_FALLBACK_LASTMOD` (or per-section dates) in `write_seo_files()`.

5. **Blog `dateModified`**  
   Add optional `date_modified` in `BLOG_ENTRIES` when articles are revised; wire into `article:modified_time` and `BlogPosting.dateModified`.

6. **BreadcrumbList JSON-LD**  
   Add for blog posts (Home → Blog → Article) to reinforce hierarchy in search.

## P2 — Policy & technical

7. **AI crawler policy**  
   `robots.txt` currently allows major AI crawlers. If policy changes (e.g. opt out of training), narrow specific `User-agent` blocks without blocking human-facing SEO.

8. **OG image pipeline**  
   Standardize cover art to 1200×630 (or update `og_image_width`/`og_image_height` per asset to match reality).

9. **Server headers**  
   On hosting: enable HTTPS, HSTS, sensible `Cache-Control` for static assets, optional CSP.

## Artifacts from this audit

| File | Purpose |
|------|---------|
| `FULL-AUDIT-REPORT.md` | Findings and scores |
| `ACTION-PLAN.md` | This plan |
| `public/sitemap.xml` | Generated sitemap |
| `public/robots.txt` | Crawler rules |
| `public/llms.txt` | LLM-oriented site summary |

No `SEO-REPORT.html` was generated (optional: `.cursor/skills/agentic-seo/scripts/generate_report.py` against the live URL when available).
