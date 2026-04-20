"""Generate robots.txt, sitemap.xml, and keep llms.txt in sync (SEO pipeline)."""

from __future__ import annotations

from pathlib import Path

from pipeline.config import (
    BLOG_POST_CHANGEFREQ,
    BLOG_POST_PRIORITY,
    SITE_ORIGIN,
    STATIC_SITEMAP_ROUTES,
)


class SeoExportService:
    """Writes crawlers + sitemap using published blog posts + static route table."""

    def __init__(self, site_origin: str, public_dir: Path) -> None:
        self.site_origin = site_origin.rstrip("/")
        self.public_dir = Path(public_dir)

    def write_robots_txt(self) -> None:
        sm = f"{self.site_origin}/sitemap.xml"
        lines = [
            "User-agent: *",
            "Allow: /",
            "",
            "# AI / LLM crawlers (allow indexing for nonprofit discoverability; tighten if needed)",
            "User-agent: GPTBot",
            "Allow: /",
            "",
            "User-agent: ChatGPT-User",
            "Allow: /",
            "",
            "User-agent: ClaudeBot",
            "Allow: /",
            "",
            "User-agent: Claude-Web",
            "Allow: /",
            "",
            "User-agent: Google-Extended",
            "Allow: /",
            "",
            "User-agent: PerplexityBot",
            "Allow: /",
            "",
            "User-agent: Applebot-Extended",
            "Allow: /",
            "",
            "User-agent: Bytespider",
            "Allow: /",
            "",
            "User-agent: CCBot",
            "Allow: /",
            "",
            f"Sitemap: {sm}",
            "",
        ]
        (self.public_dir / "robots.txt").write_text("\n".join(lines), encoding="utf-8")

    def write_sitemap_xml(self, blog_entries: list[dict[str, object]]) -> None:
        """Expects legacy-shaped blog dicts with keys slug, date."""
        blog_lastmod = {f"/blog/{e['slug']}": str(e["date"]) for e in blog_entries}
        dates_only = [str(e["date"]) for e in blog_entries]
        fallback_lastmod = max(dates_only) if dates_only else "2026-04-15"

        def lastmod_for(path: str) -> str:
            return blog_lastmod.get(path, fallback_lastmod)

        url_lines: list[str] = []
        for path, chg, pri in STATIC_SITEMAP_ROUTES:
            lm = lastmod_for(path)
            url_lines.append(
                f"  <url><loc>{self.site_origin}{path}</loc>"
                f"<lastmod>{lm}</lastmod><changefreq>{chg}</changefreq><priority>{pri}</priority></url>"
            )
        for e in sorted(blog_entries, key=lambda x: str(x["date"]), reverse=True):
            slug = str(e["slug"])
            path = f"/blog/{slug}"
            lm = str(e["date"])
            url_lines.append(
                f"  <url><loc>{self.site_origin}{path}</loc>"
                f"<lastmod>{lm}</lastmod><changefreq>{BLOG_POST_CHANGEFREQ}</changefreq>"
                f"<priority>{BLOG_POST_PRIORITY}</priority></url>"
            )

        urls = "\n".join(url_lines)
        sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls}
</urlset>
"""
        (self.public_dir / "sitemap.xml").write_text(sitemap, encoding="utf-8")

    def write_llms_txt(self) -> None:
        base = self.site_origin
        llms = f"""# Go Ukraina

Go Ukraina is a U.S. 501(c)(3) nonprofit (EIN 88-2011390) based in Calabasas, CA. The organization delivers humanitarian infrastructure in Ukraine: ReH2O solar water purification, emergency power generators, human rights advocacy with the Ukrainian Ombudsman, and Ukraine Dreamzzz youth sports programming.

Canonical site: {base}/

Key pages:
- {base}/ — Home: mission, impact, ways to help
- {base}/donate — Donate (501(c)(3) tax-deductible giving)
- {base}/about — About the organization
- {base}/impact — Impact and reporting
- {base}/blog — Field reports and updates
- {base}/initiatives/reh2o — ReH2O clean water initiative
- {base}/initiatives/power-generators — Emergency power program
- {base}/initiatives/advocacy — Advocacy and human rights
- {base}/initiatives/ukraine-dreamzzz — Ukraine Dreamzzz
- {base}/summit — Summit / events
- {base}/contact — Contact

Contact: info@goukraina.com | +1-323-532-6855

Use this file alongside public content; for machine-readable site structure see {base}/sitemap.xml
"""
        (self.public_dir / "llms.txt").write_text(llms, encoding="utf-8")

    def write_all(self, blog_entries: list[dict[str, object]]) -> None:
        self.write_sitemap_xml(blog_entries)
        self.write_robots_txt()
        self.write_llms_txt()


def default_exporter() -> SeoExportService:
    from pipeline.config import PUBLIC_DIR

    return SeoExportService(SITE_ORIGIN, PUBLIC_DIR)
