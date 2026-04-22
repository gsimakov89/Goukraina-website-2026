import { Link } from "react-router-dom";

const cards = [
  {
    title: "Write a blog post",
    body: "Create drafts, publish field reports, and use AI helpers—no code required.",
    to: "/blog",
    accent: "from-[oklch(96%_0.04_252)] to-[oklch(98%_0.02_250)]",
  },
  {
    title: "Media library",
    body: "Upload images, set alt text for accessibility, and reuse them in posts.",
    to: "/media",
    accent: "from-[oklch(97%_0.03_85)] to-[oklch(99%_0.01_250)]",
  },
  {
    title: "Main menu links",
    body: "Reorder and edit the desktop navigation; changes apply after the site rebuilds.",
    to: "/nav",
    accent: "from-[oklch(96%_0.04_252)] to-[oklch(99%_0.01_250)]",
  },
  {
    title: "Author card",
    body: "Name, bio, and photo shown on blog posts—same for every article.",
    to: "/author",
    accent: "from-[oklch(96%_0.03_200)] to-[oklch(99%_0.01_250)]",
  },
  {
    title: "Integrations",
    body: "Givebutter, OpenAI, and other API keys—paste once here instead of editing hosting config.",
    to: "/integrations",
    accent: "from-[oklch(96%_0.04_200)] to-[oklch(99%_0.01_250)]",
  },
  {
    title: "Site & tracking",
    body: "Analytics tags (GTM, Meta), email popup text, and optional head snippets—all saved to the database.",
    to: "/settings",
    accent: "from-[oklch(96%_0.04_85)] to-[oklch(99%_0.01_250)]",
  },
  {
    title: "SEO & discovery",
    body: "Preview sitemap, robots, RSS, and llms.txt; run an AI SEO check when you’re ready.",
    to: "/seo",
    accent: "from-[oklch(96%_0.05_145)] to-[oklch(99%_0.01_250)]",
  },
  {
    title: "Analytics",
    body: "See top pages (when GA4 is connected) and notify Google when you publish.",
    to: "/analytics",
    accent: "from-[oklch(96%_0.04_280)] to-[oklch(99%_0.01_250)]",
  },
];

export function OverviewPage() {
  return (
    <div>
      <header className="mb-10 border-b border-[oklch(88%_0.02_250)] pb-8">
        <h2 className="font-serif text-3xl font-semibold tracking-tight text-[oklch(22%_0.035_260)]">
          Dashboard
        </h2>
        <p className="mt-2 max-w-2xl text-[oklch(42%_0.03_260)]">
          Manage the blog, images, menu, tracking, and SEO from here. You don’t need to edit project files—changes are
          stored in the database and baked into the public site when it rebuilds.
        </p>
        <p className="mt-3 max-w-2xl text-sm text-[oklch(45%_0.03_260)]">
          Use <strong className="font-medium text-[oklch(32%_0.03_260)]">Integrations</strong> for Givebutter and OpenAI
          keys, and <strong className="font-medium text-[oklch(32%_0.03_260)]">Site &amp; tracking</strong> for Google Tag
          Manager, Meta Pixel, the email popup copy, and optional scripts.
        </p>
      </header>
      <div className="grid gap-5 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className={`group rounded-2xl border border-[oklch(88%_0.02_250)] bg-gradient-to-br ${c.accent} p-6 shadow-sm transition hover:shadow-md`}
          >
            <h3 className="text-lg font-semibold tracking-tight text-[oklch(22%_0.035_260)] group-hover:text-[oklch(48%_0.12_252)]">
              {c.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[oklch(42%_0.03_260)]">{c.body}</p>
            <span className="mt-4 inline-flex items-center text-sm font-semibold text-[oklch(48%_0.12_252)]">
              Open →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
